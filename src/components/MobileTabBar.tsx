import { Link, useLocation } from '@tanstack/react-router';
import { Home, Kanban, Calendar, Volume2, Settings } from 'lucide-react';

const TABS = [
  { to: '/' as const, icon: Home, label: 'Home' },
  { to: '/kanban' as const, icon: Kanban, label: 'Tasks' },
  { to: '/calendar' as const, icon: Calendar, label: 'Calendar' },
  { to: '/voice' as const, icon: Volume2, label: 'Voice' },
  { to: '/settings' as const, icon: Settings, label: 'Settings' },
];

export function MobileTabBar() {
  const location = useLocation();

  return (
    <nav className="glass border-t border-border/30 ios-safe-bottom flex items-center justify-around px-2 pt-1.5 shrink-0">
      {TABS.map((tab) => {
        const active = location.pathname === tab.to;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-colors ${
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
