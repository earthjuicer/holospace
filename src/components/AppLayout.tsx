import { type ReactNode, useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { AppSidebar } from './AppSidebar';
import { MobileTabBar } from './MobileTabBar';
import { SearchPalette } from './SearchPalette';
import { Onboarding } from './Onboarding';
import { useIsMobile } from '@/hooks/use-mobile';

export function AppLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const { settings, sidebarOpen } = useAppStore();

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

  return (
    <>
      <div className="flex h-[100dvh] w-full overflow-hidden">
        {!isMobile && <AppSidebar />}
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden transition-all duration-220"
          style={{ marginLeft: !isMobile && sidebarOpen ? 0 : 0 }}
        >
          {children}
        </main>
        {isMobile && <MobileTabBar />}
      </div>
      <SearchPalette />
      <Onboarding />
    </>
  );
}
