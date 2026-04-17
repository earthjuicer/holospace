import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

export interface CollabCursor {
  userId: string;
  name: string;
  color: string;
  blockId: string | null;
  offset: number;
  selectionLength: number;
  updatedAt: number;
}

// Stable color from a string id.
function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 80% 55%)`;
}

interface PresencePayload {
  userId: string;
  name: string;
  color: string;
  blockId: string | null;
  offset: number;
  selectionLength: number;
}

/**
 * Subscribe to a Supabase Realtime presence channel for a doc.
 * Returns the list of remote cursors and a `broadcastCursor` function
 * to push the local user's caret position.
 */
export function useCollabPresence(docId: string) {
  const { user } = useAuth();
  const [remote, setRemote] = useState<CollabCursor[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const meRef = useRef<PresencePayload | null>(null);
  const lastSentRef = useRef<number>(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || !docId) return;
    let cancelled = false;

    // Resolve a friendly display name. Prefer the profile row (display_name /
    // username) over auth metadata, since email/password signups have empty
    // user_metadata and would otherwise fall back to the email prefix.
    const resolveName = async (): Promise<string> => {
      const metaName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined);
      if (metaName) return metaName;
      try {
        const { data } = await supabase
          .from('profiles')
          .select('display_name, username')
          .eq('user_id', user.id)
          .maybeSingle();
        if (data?.display_name) return data.display_name;
        if (data?.username) return data.username;
      } catch {
        // ignore — fall back below
      }
      return user.email?.split('@')[0] ?? 'Someone';
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const name = await resolveName();
      if (cancelled) return;

      const me: PresencePayload = {
        userId: user.id,
        name,
        color: colorFor(user.id),
        blockId: null,
        offset: 0,
        selectionLength: 0,
      };
      meRef.current = me;

      channel = supabase.channel(`doc-presence:${docId}`, {
        config: { presence: { key: user.id } },
      });
      channelRef.current = channel;

      const refreshRemote = () => {
        if (!channel) return;
        const state = channel.presenceState() as Record<string, PresencePayload[]>;
        const list: CollabCursor[] = [];
        const now = Date.now();
        for (const key of Object.keys(state)) {
          if (key === user.id) continue;
          const entry = state[key]?.[0];
          if (!entry) continue;
          list.push({ ...entry, updatedAt: now });
        }
        setRemote(list);
      };

      channel
        .on('presence', { event: 'sync' }, refreshRemote)
        .on('presence', { event: 'join' }, refreshRemote)
        .on('presence', { event: 'leave' }, refreshRemote)
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && channel) {
            await channel.track(me);
          }
        });
    })();

    return () => {
      cancelled = true;
      if (pendingRef.current) clearTimeout(pendingRef.current);
      if (channel) {
        channel.untrack().catch(() => {});
        supabase.removeChannel(channel);
      }
      channelRef.current = null;
      meRef.current = null;
    };
  }, [user, docId]);

  const broadcastCursor = useCallback(
    (blockId: string | null, offset: number, selectionLength = 0) => {
      const me = meRef.current;
      const channel = channelRef.current;
      if (!me || !channel) return;
      const next: PresencePayload = { ...me, blockId, offset, selectionLength };
      meRef.current = next;

      // Throttle: send at most every 80ms, with a trailing flush.
      const now = Date.now();
      const send = () => {
        lastSentRef.current = Date.now();
        pendingRef.current = null;
        channel.track(meRef.current!).catch(() => {});
      };
      const elapsed = now - lastSentRef.current;
      if (elapsed >= 80) {
        send();
      } else if (!pendingRef.current) {
        pendingRef.current = setTimeout(send, 80 - elapsed);
      }
    },
    []
  );

  return { remote, broadcastCursor };
}
