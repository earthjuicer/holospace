import { useEffect, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Sparkles, Play, Trash2, Save, X, Search, Lock, Users, Tag, Loader2, Copy, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export const Route = createFileRoute('/prompts')({
  component: PromptsPage,
});

interface Folder {
  id: string;
  name: string;
  icon: string;
  owner_id: string;
}

interface Prompt {
  id: string;
  owner_id: string;
  folder_id: string | null;
  title: string;
  description: string | null;
  content: string;
  model: string;
  tags: string[];
  is_private: boolean;
  updated_at: string;
}

const MODELS = [
  { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash · Fast' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro · Smart' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash · Balanced' },
  { id: 'openai/gpt-5', label: 'GPT-5 · Powerful' },
  { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini · Fast' },
];

function extractVariables(content: string): string[] {
  const matches = content.matchAll(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g);
  const set = new Set<string>();
  for (const m of matches) set.add(m[1]);
  return Array.from(set);
}

function renderPrompt(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function PromptsPage() {
  const { user } = useAuth();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterScope, setFilterScope] = useState<'all' | 'private' | 'shared'>('all');
  const [selected, setSelected] = useState<Prompt | null>(null);
  const [editing, setEditing] = useState<Partial<Prompt> | null>(null);

  // Run state
  const [vars, setVars] = useState<Record<string, string>>({});
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user]);

  async function load() {
    setLoading(true);
    const [{ data: p }, { data: f }] = await Promise.all([
      supabase.from('prompts').select('*').order('updated_at', { ascending: false }),
      supabase.from('folders').select('id, name, icon, owner_id'),
    ]);
    setPrompts((p as Prompt[]) ?? []);
    setFolders((f as Folder[]) ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return prompts.filter((p) => {
      if (filterScope === 'private' && p.folder_id) return false;
      if (filterScope === 'shared' && !p.folder_id) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [prompts, search, filterScope]);

  function startNew() {
    setEditing({
      title: 'Untitled prompt',
      description: '',
      content: 'You are a helpful assistant.\n\nTask: {{task}}',
      model: 'google/gemini-3-flash-preview',
      tags: [],
      folder_id: null,
      is_private: true,
    });
    setSelected(null);
    setOutput('');
    setVars({});
  }

  function startEdit(p: Prompt) {
    setEditing({ ...p });
    setSelected(p);
  }

  async function save() {
    if (!editing || !user) return;
    if (!editing.title?.trim() || !editing.content?.trim()) {
      toast.error('Title and content required');
      return;
    }
    const payload = {
      owner_id: user.id,
      title: editing.title.trim(),
      description: editing.description ?? '',
      content: editing.content,
      model: editing.model ?? 'google/gemini-3-flash-preview',
      tags: editing.tags ?? [],
      folder_id: editing.folder_id ?? null,
      is_private: !editing.folder_id,
    };

    if (editing.id) {
      const { data, error } = await supabase
        .from('prompts')
        .update(payload)
        .eq('id', editing.id)
        .select()
        .single();
      if (error) return toast.error(error.message);
      setPrompts((prev) => prev.map((x) => (x.id === data.id ? (data as Prompt) : x)));
      setSelected(data as Prompt);
      setEditing(null);
      toast.success('Saved');
    } else {
      const { data, error } = await supabase.from('prompts').insert(payload).select().single();
      if (error) return toast.error(error.message);
      setPrompts((prev) => [data as Prompt, ...prev]);
      setSelected(data as Prompt);
      setEditing(null);
      toast.success('Created');
    }
  }

  async function remove(p: Prompt) {
    if (!confirm(`Delete "${p.title}"?`)) return;
    const { error } = await supabase.from('prompts').delete().eq('id', p.id);
    if (error) return toast.error(error.message);
    setPrompts((prev) => prev.filter((x) => x.id !== p.id));
    if (selected?.id === p.id) setSelected(null);
    toast.success('Deleted');
  }

  async function run() {
    if (!selected || !user) return;
    setRunning(true);
    setOutput('');
    const rendered = renderPrompt(selected.content, vars);

    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          model: selected.model,
          messages: [{ role: 'user', content: rendered }],
        }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) toast.error('Rate limit reached, try again shortly.');
        else if (resp.status === 402) toast.error('AI credits exhausted.');
        else toast.error('Failed to run prompt');
        setRunning(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let assembled = '';
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const j = line.slice(6).trim();
          if (j === '[DONE]') { done = true; break; }
          try {
            const parsed = JSON.parse(j);
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) {
              assembled += c;
              setOutput(assembled);
            }
          } catch {
            buf = line + '\n' + buf;
            break;
          }
        }
      }

      // Log run (best effort)
      await supabase.from('prompt_runs').insert({
        prompt_id: selected.id,
        owner_id: user.id,
        rendered_input: rendered,
        variables: vars,
        output: assembled,
        model: selected.model,
        status: 'completed',
      });
    } catch (e) {
      toast.error('Error running prompt');
      console.error(e);
    } finally {
      setRunning(false);
    }
  }

  const variables = selected ? extractVariables(selected.content) : [];

  return (
    <div className="flex h-full overflow-hidden">
      {/* List */}
      <div className="w-80 shrink-0 border-r border-border/40 flex flex-col bg-background/40">
        <div className="p-4 border-b border-border/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-primary" />
              <h1 className="font-semibold">Prompts</h1>
            </div>
            <Button size="sm" onClick={startNew} className="h-8">
              <Plus size={14} /> New
            </Button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prompts…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex gap-1 text-xs">
            {(['all', 'private', 'shared'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterScope(s)}
                className={`px-2.5 py-1 rounded-full transition-colors capitalize ${
                  filterScope === s
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted/60'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No prompts yet. Create your first one.
            </div>
          ) : (
            filtered.map((p) => {
              const folder = folders.find((f) => f.id === p.folder_id);
              const active = selected?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelected(p);
                    setEditing(null);
                    setOutput('');
                    setVars({});
                  }}
                  className={`w-full text-left p-3 rounded-xl mb-1 transition-colors group ${
                    active ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm truncate flex-1">{p.title}</div>
                    {p.folder_id ? (
                      <Users size={12} className="text-muted-foreground shrink-0 mt-0.5" />
                    ) : (
                      <Lock size={12} className="text-muted-foreground shrink-0 mt-0.5" />
                    )}
                  </div>
                  {p.description && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{p.description}</div>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {folder && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
                        {folder.icon} {folder.name}
                      </span>
                    )}
                    {p.tags.slice(0, 2).map((t) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {t}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {editing ? (
            <motion.div
              key="editor"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-3xl mx-auto p-8 space-y-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{editing.id ? 'Edit prompt' : 'New prompt'}</h2>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                    <X size={14} /> Cancel
                  </Button>
                  <Button size="sm" onClick={save}>
                    <Save size={14} /> Save
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <Input
                  value={editing.title ?? ''}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <Input
                  value={editing.description ?? ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Short description (optional)"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Model</label>
                  <Select
                    value={editing.model ?? 'google/gemini-3-flash-preview'}
                    onValueChange={(v) => setEditing({ ...editing, model: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Scope</label>
                  <Select
                    value={editing.folder_id ?? 'private'}
                    onValueChange={(v) => setEditing({ ...editing, folder_id: v === 'private' ? null : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">🔒 Private (only me)</SelectItem>
                      {folders.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.icon} Folder: {f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Prompt content — use <code className="px-1 py-0.5 bg-muted rounded text-[10px]">{'{{variable}}'}</code> for inputs
                </label>
                <Textarea
                  value={editing.content ?? ''}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  rows={14}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tags (comma separated)</label>
                <Input
                  value={(editing.tags ?? []).join(', ')}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                    })
                  }
                  placeholder="writing, code, summary"
                />
              </div>
            </motion.div>
          ) : selected ? (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-3xl mx-auto p-8 space-y-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">{selected.title}</h2>
                  {selected.description && (
                    <p className="text-sm text-muted-foreground mt-1">{selected.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted/70 text-muted-foreground">
                      {MODELS.find((m) => m.id === selected.model)?.label ?? selected.model}
                    </span>
                    {selected.folder_id ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                        <Users size={10} /> Shared
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted/70 text-muted-foreground flex items-center gap-1">
                        <Lock size={10} /> Private
                      </span>
                    )}
                    {selected.tags.map((t) => (
                      <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent-foreground flex items-center gap-1">
                        <Tag size={10} /> {t}
                      </span>
                    ))}
                  </div>
                </div>
                {selected.owner_id === user?.id && (
                  <div className="flex gap-2 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(selected)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(selected)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border/40 bg-muted/30 p-4">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Prompt template
                </div>
                <pre className="text-sm font-mono whitespace-pre-wrap text-foreground/90">
                  {selected.content}
                </pre>
              </div>

              {variables.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Variables
                  </div>
                  {variables.map((v) => (
                    <div key={v} className="space-y-1">
                      <label className="text-xs font-mono text-primary">{`{{${v}}}`}</label>
                      <Textarea
                        value={vars[v] ?? ''}
                        onChange={(e) => setVars({ ...vars, [v]: e.target.value })}
                        rows={2}
                        placeholder={`Value for ${v}`}
                      />
                    </div>
                  ))}
                </div>
              )}

              <Button onClick={run} disabled={running} className="w-full" size="lg">
                {running ? (
                  <><Loader2 size={16} className="animate-spin" /> Running…</>
                ) : (
                  <><Play size={16} /> Run prompt</>
                )}
              </Button>

              {(output || running) && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] font-medium text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <Wand2 size={12} /> Output
                    </div>
                    {output && !running && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(output);
                          toast.success('Copied');
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        <Copy size={12} /> Copy
                      </button>
                    )}
                  </div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {output || <span className="text-muted-foreground">Generating…</span>}
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center text-center p-8"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles size={28} className="text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">AI Prompt Workspace</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Save reusable AI prompts, organize them privately or share inside folders, and run them with variables anytime.
              </p>
              <Button onClick={startNew}><Plus size={14} /> New prompt</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
