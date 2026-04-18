import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/hooks/use-auth';
import {
  Home, FileText, Kanban, Calendar, Settings, Search, Plus, Star,
  ChevronRight, PanelLeftClose, PanelLeft, Volume2, FolderLock, LogOut, User,
  Sun, Moon, Sparkles, Bell,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/' as const, icon: Home, label: 'Home' },
  { to: '/prompts' as const, icon: Sparkles, label: 'AI Prompts' },
  { to: '/kanban' as const, icon: Kanban, label: 'Tasks' },
  { to: '/calendar' as const, icon: Calendar, label: 'Calendar' },
  { to: '/folders' as const, icon: FolderLock, label: 'Drive' },
  { to: '/voice' as const, icon: Volume2, label: 'Voice' },
  { to: '/settings' as const, icon: Settings, label: 'Settings' },
];

export function AppSidebar() {
  const { documents, sidebarOpen, toggleSidebar, addDocument, toggleFavorite, settings, updateSettings } = useAppStore();
  const { user, signOut } = useAuth();
  const [unreadMentions, setUnreadMentions] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null)
      .then(({ count }) => setUnreadMentions(count ?? 0));

    const sub = supabase
      .channel(`sidebar-notifs-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        () => setUnreadMentions((n) => n + 1))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        () => supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", user.id).is("read_at", null).then(({ count }) => setUnreadMentions(count ?? 0)))
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [user?.id]);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchFilter, setSearchFilter] = useState('');
  const [pagesExpanded, setPagesExpanded] = useState(true);

  const favorites = documents.filter((d) => d.favorite);
  const filteredDocs = documents.filter((d) =>
    d.title.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: '/login' });
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarOpen ? 260 : 56 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className="relative flex flex-col h-full glass border-r border-border/50 z-30 shrink-0"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/30">
        {sidebarOpen && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm font-semibold gradient-accent-text truncate"
          >
            Workspace
          </motion.span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground"
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
        </button>
      </div>

      {/* Search */}
      {sidebarOpen && (
        <div className="px-3 pt-3">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-muted/50 border border-border/30">
            <Search size={14} className="text-muted-foreground shrink-0" />
            <input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search pages…"
              className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground/60"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-2 space-y-1">
        {/* Nav items */}
        <div className="px-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm transition-all ${
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <item.icon size={18} />
                {sidebarOpen && <span className="flex-1 truncate">{item.label}</span>}
              </Link>
            );
          })}
          {/* Mentions / notifications */}
          <button
            onClick={async () => {
              if (!user) return;
              await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", user.id).is("read_at", null);
              setUnreadMentions(0);
            }}
            className="relative flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm transition-all w-full text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            title="Mentions"
          >
            <div className="relative">
              <Bell size={18} />
              {unreadMentions > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadMentions > 9 ? "9+" : unreadMentions}
                </span>
              )}
            </div>
            {sidebarOpen && (
              <span className="flex-1 truncate text-left">
                Mentions
                {unreadMentions > 0 && (
                  <span className="ml-1.5 text-xs font-semibold text-destructive">
                    {unreadMentions} new
                  </span>
                )}
              </span>
            )}
          </button>
        </div>

        {sidebarOpen && (
          <>
            {/* Favorites */}
            {favorites.length > 0 && (
              <div className="px-2 pt-3">
                <div className="flex items-center gap-1 px-2 mb-1">
                  <Star size={12} className="text-muted-foreground/60" />
                  <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                    Favorites
                  </span>
                </div>
                {favorites.map((doc) => (
                  <Link
                    key={doc.id}
                    to="/editor/$docId"
                    params={{ docId: doc.id }}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm transition-all ${
                      location.pathname === `/editor/${doc.id}`
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <span className="text-base">{doc.icon}</span>
                    <span className="truncate">{doc.title}</span>
                  </Link>
                ))}
              </div>
            )}

            {/* Pages */}
            <div className="px-2 pt-3">
              <button
                onClick={() => setPagesExpanded(!pagesExpanded)}
                className="flex items-center gap-1 px-2 mb-1 w-full"
              >
                <ChevronRight
                  size={12}
                  className={`text-muted-foreground/60 transition-transform ${
                    pagesExpanded ? 'rotate-90' : ''
                  }`}
                />
                <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                  Pages
                </span>
              </button>
              <AnimatePresence>
                {pagesExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {filteredDocs.map((doc) => (
                      <Link
                        key={doc.id}
                        to="/editor/$docId"
                        params={{ docId: doc.id }}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm transition-all group ${
                          location.pathname === `/editor/${doc.id}`
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        }`}
                      >
                        <span className="text-base">{doc.icon}</span>
                        <span className="truncate flex-1">{doc.title}</span>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleFavorite(doc.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Star
                            size={12}
                            className={doc.favorite ? 'fill-primary text-primary' : 'text-muted-foreground'}
                          />
                        </button>
                      </Link>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      {/* Bottom: New page + user */}
      <div className="border-t border-border/30">
        <div className="p-3">
          <Link
            to="/editor/$docId"
            params={{ docId: 'new' }}
            onClick={(e) => {
              e.preventDefault();
              const id = addDocument();
              navigate({ to: '/editor/$docId', params: { docId: id } });
            }}
            className={`flex items-center justify-center gap-2 w-full py-2 rounded-xl gradient-accent text-white text-sm font-medium transition-all hover:opacity-90 active:scale-[0.97] ${
              !sidebarOpen ? 'px-2' : 'px-3'
            }`}
          >
            <Plus size={16} />
            {sidebarOpen && <span>New Page</span>}
          </Link>
        </div>

        {/* User info */}
        {user && sidebarOpen && (
          <div className="px-3 pb-3 flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <User size={14} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">
                {user.user_metadata?.full_name || user.email?.split('@')[0]}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
            </div>
            <button
              onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
              title={settings.theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            >
              {settings.theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
        {!sidebarOpen && (
          <div className="px-2 pb-3 flex flex-col items-center gap-1">
            <button
              onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
              className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
              title={settings.theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            >
              {settings.theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
