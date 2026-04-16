import { type ReactNode, useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/hooks/use-auth';
import { AppSidebar } from './AppSidebar';
import { MobileTabBar } from './MobileTabBar';
import { SearchPalette } from './SearchPalette';
import { Onboarding } from './Onboarding';
import { useIsMobile } from '@/hooks/use-mobile';
import { Toaster } from 'sonner';

const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password'];

export function AppLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const { settings, sidebarOpen } = useAppStore();
  const { user, loading } = useAuth();
  const location = useLocation();

  const isPublicRoute = PUBLIC_ROUTES.some((r) => location.pathname.startsWith(r));

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

  // Not logged in and not on a public route — redirect handled by showing login
  if (!user && !isPublicRoute) {
    // We'll let the route handle this, but for now show children
    // The routes will redirect if needed
  }

  return (
    <>
      <div className="flex h-[100dvh] w-full overflow-hidden">
        {!isMobile && <AppSidebar />}
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden transition-all duration-220"
        >
          {children}
        </main>
        {isMobile && <MobileTabBar />}
      </div>
      <SearchPalette />
      <Onboarding />
      <Toaster position="top-center" />
    </>
  );
}
