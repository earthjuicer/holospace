import { useState } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { Menu, Plus, Search, Sun, Moon, LogOut, User, X,
  Home, Sparkles, Kanban, Calendar, FolderLock, Volume2, Settings,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/hooks/use-auth';

const NAV_ITEMS = [
  { to: '/' as const, icon: Home, label: 'Home' },
  { to: '/prompts' as const, icon: Sparkles, label: 'AI Prompts' },
  { to: '/kanban' as const, icon: Kanban, label: 'Tasks' },
  { to: '/calendar' as const, icon: Calendar, label: 'Calendar' },
  { to: '/folders' as const, icon: FolderLock, label: 'Folders' },
  { to: '/voice' as const, icon: Volume2, label: 'Voice' },
  { to: '/settings' as const, icon: Settings, label: 'Settings' },
];

const TITLES: Record<string, string> = {
  '/': 'Home',
  '/prompts': 'AI Prompts',
  '/kanban': 'Tasks',
  '/calendar': 'Calendar',
  '/folders': 'Folders',
  '/voice': 'Voice',
  '/settings': 'Settings',
};

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { addDocument, settings, updateSettings, setSearchOpen } = useAppStore();
  const { user, signOut } = useAuth();

  const title = TITLES[location.pathname] ?? 'Workspace';

  const handleNewPage = () => {
    setOpen(false);
    const id = addDocument();
    navigate({ to: '/editor/$docId', params: { docId: id } });
  };

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    navigate({ to: '/login' });
  };

  return (
    <header className="md:hidden sticky top-0 z-40 glass-subtle border-b border-border/30 flex items-center justify-between px-3 py-2 shrink-0">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            className="p-2 rounded-xl hover:bg-muted/50 text-foreground"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] p-0 flex flex-col gap-0">
          {/* Brand */}
          <div className="px-4 pt-5 pb-4 border-b border-border/30">
            <div className="text-base font-semibold gradient-accent-text">Workspace</div>
            {user && (
              <div className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</div>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                    active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-muted/50'
                  }`}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Footer actions */}
          <div className="border-t border-border/30 p-3 space-y-2">
            <button
              onClick={handleNewPage}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl gradient-accent text-white text-sm font-medium"
            >
              <Plus size={16} /> New Page
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted/60 text-foreground text-xs font-medium"
              >
                {settings.theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                {settings.theme === 'dark' ? 'Light' : 'Dark'}
              </button>
              <button
                onClick={handleSignOut}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-destructive/10 text-destructive text-xs font-medium"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="text-sm font-semibold text-foreground truncate flex-1 text-center">
        {title}
      </div>

      <button
        onClick={() => setSearchOpen(true)}
        className="p-2 rounded-xl hover:bg-muted/50 text-foreground"
        aria-label="Search"
      >
        <Search size={20} />
      </button>
    </header>
  );
}
