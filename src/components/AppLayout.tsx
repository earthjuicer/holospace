import { type ReactNode, useEffect, useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useAppStore, setUserScope } from '@/store/app-store';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { AppSidebar } from './AppSidebar';
import { MobileTabBar } from './MobileTabBar';
import { MobileHeader } from './MobileHeader';
import { SearchPalette } from './SearchPalette';
import { Onboarding } from './Onboarding';
import { IncomingRing } from './IncomingRing';
import { VoiceStatusBar } from './VoiceStatusBar';
import { VoiceRoomProvider } from '@/hooks/voice-room-context';
import { useIsMobile } from '@/hooks/use-mobile';
import { Toaster } from 'sonner';
import { MentionNotifications } from './MentionNotifications';

const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/share',
  '/voice-invite',
];

// Injects accent color as a CSS custom property override so it actually
// affects all components without needing a full re-render chain.
function applyAccentColor(hex: string) {
  let el = document.getElementById('accent-override') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'accent-override';
    document.head.appendChild(el);
  }
  el.textContent = `
    :root, .dark {
      --primary: ${hex} !important;
      --ring: ${hex} !important;
      --sidebar-primary: ${hex} !important;
    }
    .gradient-accent {
      background: linear-gradient(135deg, ${hex}, ${hex}cc) !important;
    }
    .gradient-accent-text {
      background: linear-gradient(135deg, ${hex}, ${hex}cc) !important;
      -webkit-background-clip: text !important;
      -webkit-text-fill-color: transparent !important;
      background-clip: text !important;
    }
  `;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const { settings } = useAppStore();
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [storeReady, setStoreReady] = useState(false);

  const isPublicRoute = PUBLIC_ROUTES.some((r) => location.pathname.startsWith(r));

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    setStoreReady(false);
    setUserScope(user?.id ?? null).then(async () => {
      if (cancelled) return;
      if (user) {
        const state = useAppStore.getState();
        const current = state.settings;
        const isPlaceholderName = !current.userName || current.userName === 'User';
        const isPlaceholderEmail = !current.userEmail || current.userEmail === 'user@example.com';

        if (isPlaceholderName || isPlaceholderEmail || !current.avatar) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('user_id', user.id)
            .maybeSingle();

          const updates: Partial<typeof current> = {};
          if (isPlaceholderName) {
            updates.userName = profile?.display_name || user.email?.split('@')[0] || 'User';
          }
          if (isPlaceholderEmail && user.email) {
            updates.userEmail = user.email;
          }
          if (!current.avatar && profile?.avatar_url) {
            updates.avatar = profile.avatar_url;
          }
          if (Object.keys(updates).length > 0) {
            state.updateSettings(updates);
          }
        }
      }
      setStoreReady(true);
    });
    return () => { cancelled = true; };
  }, [loading, user?.id, user?.email]);

  // Apply theme class
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [settings.theme]);

  // Apply font size
  useEffect(() => {
    document.documentElement.style.fontSize =
      settings.fontSize === 'small' ? '14px' : settings.fontSize === 'large' ? '18px' : '16px';
  }, [settings.fontSize]);

  // Apply accent color — this is the fix: previously picking a color in Settings
  // called updateSettings() but nothing wired the hex to actual CSS variables,
  // so buttons/gradients never changed. Now we inject it at the root level.
  useEffect(() => {
    if (settings.accentColor) applyAccentColor(settings.accentColor);
  }, [settings.accentColor]);

  useEffect(() => {
    if (!loading && !user && !isPublicRoute) {
      navigate({ to: '/login' });
    }
  }, [loading, user, isPublicRoute, navigate]);

  if (loading) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isPublicRoute) {
    return (
      <>
        {children}
        <Toaster position="top-center" />
      </>
    );
  }

  if (!user || !storeReady) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <VoiceRoomProvider>
      <div className="flex h-[100dvh] w-full overflow-hidden">
        {!isMobile && <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          {isMobile && <MobileHeader />}
          <main className="flex-1 overflow-y-auto overflow-x-hidden transition-all duration-220">
            {children}
            {isMobile && <div className="h-16 shrink-0" aria-hidden="true" />}
          </main>
          {isMobile && <MobileTabBar />}
        </div>
      </div>
      <SearchPalette />
      <Onboarding />
      <IncomingRing />
      <VoiceStatusBar />
      <MentionNotifications />
      <Toaster position="top-center" />
    </VoiceRoomProvider>
  );
}
