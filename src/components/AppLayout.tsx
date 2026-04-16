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
import { useIsMobile } from '@/hooks/use-mobile';
import { Toaster } from 'sonner';

// Routes that anyone can visit without signing in. Anything matching one of
// these prefixes skips the auth redirect and is rendered as a bare page
// (no app sidebar / mobile chrome). Voice invite links work for guests —
// they pick a name and join, no signup required.
const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/share',
  '/voice-invite',
];

export function AppLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const { settings } = useAppStore();
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [storeReady, setStoreReady] = useState(false);

  const isPublicRoute = PUBLIC_ROUTES.some((r) => location.pathname.startsWith(r));

  // Swap the persisted store to the current user's bucket whenever auth
  // changes. Each user (and signed-out anon) gets their own dashboard,
  // documents, tasks, calendar, and settings on this device.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    setStoreReady(false);
    setUserScope(user?.id ?? null).then(async () => {
      if (cancelled) return;
      // After hydrating + syncing, prefill profile fields from the auth/profile
      // record — but never overwrite values the user has set themselves.
      if (user) {
        const state = useAppStore.getState();
        const current = state.settings;
        const isPlaceholderName =
          !current.userName || current.userName === 'User';
        const isPlaceholderEmail =
          !current.userEmail || current.userEmail === 'user@example.com';

        if (isPlaceholderName || isPlaceholderEmail || !current.avatar) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('user_id', user.id)
            .maybeSingle();

          const updates: Partial<typeof current> = {};
          if (isPlaceholderName) {
            updates.userName =
              profile?.display_name ||
              user.email?.split('@')[0] ||
              'User';
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
    return () => {
      cancelled = true;
    };
  }, [loading, user?.id, user?.email]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize =
      settings.fontSize === 'small' ? '14px' : settings.fontSize === 'large' ? '18px' : '16px';
  }, [settings.fontSize]);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!loading && !user && !isPublicRoute) {
      navigate({ to: '/login' });
    }
  }, [loading, user, isPublicRoute, navigate]);

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Public routes (login, signup, etc.) — no sidebar
  if (isPublicRoute) {
    return (
      <>
        {children}
        <Toaster position="top-center" />
      </>
    );
  }

  // Not logged in, or store still rehydrating into the user's bucket — show spinner
  if (!user || !storeReady) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex h-[100dvh] w-full overflow-hidden">
        {!isMobile && <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          {isMobile && <MobileHeader />}
          <main className="flex-1 overflow-y-auto overflow-x-hidden transition-all duration-220">
            {children}
            {/* Spacer so content doesn't hide behind fixed mobile tab bar */}
            {isMobile && <div className="h-16 shrink-0" aria-hidden="true" />}
          </main>
          {isMobile && <MobileTabBar />}
        </div>
      </div>
      <SearchPalette />
      <Onboarding />
      <IncomingRing />
      <Toaster position="top-center" />
    </>
  );
}
