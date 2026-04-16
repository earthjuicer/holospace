import { Link, useLocation } from '@tanstack/react-router';
import { Home, Sparkles, Kanban, Calendar, Volume2 } from 'lucide-react';

const TABS = [
  { to: '/' as const, icon: Home, label: 'Home' },
  { to: '/prompts' as const, icon: Sparkles, label: 'Prompts' },
  { to: '/kanban' as const, icon: Kanban, label: 'Tasks' },
  { to: '/calendar' as const, icon: Calendar, label: 'Calendar' },
  { to: '/voice' as const, icon: Volume2, label: 'Voice' },
];

export function MobileTabBar() {
  const location = useLocation();

  return (
    <nav className="glass-subtle border-t border-border/30 ios-safe-bottom flex items-center justify-around px-1 pt-1.5 shrink-0">
      {TABS.map((tab) => {
        const active =
          tab.to === '/'
            ? location.pathname === '/' || location.pathname.startsWith('/editor')
            : location.pathname.startsWith(tab.to);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-xl transition-colors min-w-[56px] ${
              active ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <tab.icon size={20} strokeWidth={active ? 2.2 : 1.8} />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
