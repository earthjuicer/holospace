import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, Clock, X } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

export function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { documents, recentSearches, addRecentSearch, clearRecentSearches } = useAppStore();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const results = query.trim()
    ? documents.filter(
        (d) =>
          d.title.toLowerCase().includes(query.toLowerCase()) ||
          d.blocks.some((b) => b.content.toLowerCase().includes(query.toLowerCase()))
      )
    : [];

  const handleSelect = useCallback(
    (docId: string) => {
      if (query.trim()) addRecentSearch(query.trim());
      setOpen(false);
      navigate({ to: '/editor/$docId', params: { docId } });
    },
    [query, navigate, addRecentSearch]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const list = results.length > 0 ? results : [];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && list[selectedIdx]) {
      handleSelect(list[selectedIdx].id);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
          onClick={() => setOpen(false)}
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-strong w-full max-w-lg overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
              <Search size={18} className="text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIdx(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search pages…"
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/60"
              />
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-muted/50">
                <X size={16} className="text-muted-foreground" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto p-2">
              {query.trim() ? (
                results.length > 0 ? (
                  results.map((doc, i) => (
                    <button
                      key={doc.id}
                      onClick={() => handleSelect(doc.id)}
                      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-left transition-colors ${
                        i === selectedIdx ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <span className="text-lg">{doc.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{doc.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {doc.blocks.find((b) => b.content)?.content.slice(0, 60) || 'Empty page'}
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No results found
                  </div>
                )
              ) : (
                <>
                  {recentSearches.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between px-3 py-1.5">
                        <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                          Recent
                        </span>
                        <button
                          onClick={clearRecentSearches}
                          className="text-[11px] text-muted-foreground/60 hover:text-foreground"
                        >
                          Clear
                        </button>
                      </div>
                      {recentSearches.map((term) => (
                        <button
                          key={term}
                          onClick={() => setQuery(term)}
                          className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted/50"
                        >
                          <Clock size={14} />
                          <span>{term}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">⌘K</kbd>
                    {' '}to search everywhere
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
