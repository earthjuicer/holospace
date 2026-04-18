import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { FolderFiles } from "@/components/FolderFiles";
import { Clock, FolderLock } from "lucide-react";

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [{ title: "Shared drive" }],
  }),
  component: SharePage,
});

interface ShareInfo {
  folder_id: string;
  folder_name: string;
  folder_icon: string;
  expires_at: string;
}

function formatRemaining(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m left`;
}

function SharePage() {
  const { token } = Route.useParams();
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_share_folder", { _token: token });
      if (data && data.length > 0) setInfo(data[0] as ShareInfo);
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass p-8 max-w-md text-center">
          <FolderLock size={36} className="mx-auto mb-3 text-muted-foreground/40" />
          <h1 className="text-xl font-bold text-foreground mb-2">
            Link expired or invalid
          </h1>
          <p className="text-sm text-muted-foreground mb-4">
            This share link is no longer active. Ask the owner for a fresh link.
          </p>
          <Link to="/" className="text-sm text-primary">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{info.folder_icon}</span>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {info.folder_name}
                </h1>
                <p className="text-xs text-muted-foreground">
                  Shared drive · view, download, and upload
                </p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted/50">
              <Clock size={12} /> {formatRemaining(info.expires_at)}
            </span>
          </div>

          <FolderFiles
            folderId={info.folder_id}
            shareToken={token}
            canDelete={false}
          />
        </motion.div>
      </div>
    </div>
  );
}
