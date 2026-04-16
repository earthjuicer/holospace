import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Sparkles, Play, Trash2, Save, X, Search, Lock, Users, Tag,
  Loader2, Copy, Wand2, MessageSquare, History, BookOpen, Send, RotateCcw,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PROMPT_TEMPLATES } from '@/lib/prompt-templates';

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

interface PromptRun {
  id: string;
  prompt_id: string | null;
  rendered_input: string;
  variables: Record<string, string>;
  output: string | null;
  model: string;
  status: string;
  created_at: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
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

type Mode = 'run' | 'chat' | 'history';

function PromptsPage() {
  const { user } = useAuth();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterScope, setFilterScope] = useState<'all' | 'private' | 'shared'>('all');
  const [selected, setSelected] = useState<Prompt | null>(null);
  const [editing, setEditing] = useState<Partial<Prompt> | null>(null);
  const [mode, setMode] = useState<Mode>('run');
  const [showTemplates, setShowTemplates] = useState(false);

  // Run state
  const [vars, setVars] = useState<Record<string, string>>({});
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);

  // Chat state
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // History state
  const [history, setHistory] = useState<PromptRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat]);

  useEffect(() => {
    if (mode === 'history' && selected) void loadHistory(selected.id);
  }, [mode, selected]);

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

  async function loadHistory(promptId: string) {
    setHistoryLoading(true);
    const { data } = await supabase
      .from('prompt_runs')
      .select('*')
      .eq('prompt_id', promptId)
      .order('created_at', { ascending: false })
      .limit(50);
    setHistory((data as PromptRun[]) ?? []);
    setHistoryLoading(false);
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

  function startNew(seed?: Partial<Prompt>) {
    setEditing({
      title: 'Untitled prompt',
      description: '',
      content: 'You are a helpful assistant.\n\nTask: {{task}}',
      model: 'google/gemini-3-flash-preview',
      tags: [],
      folder_id: null,
      is_private: true,
      ...seed,
    });
    setSelected(null);
    setOutput('');
    setVars({});
    setChat([]);
  }

  function startEdit(p: Prompt) {
    setEditing({ ...p });
    setSelected(p);
  }

  function selectPrompt(p: Prompt) {
    setSelected(p);
    setEditing(null);
    setOutput('');
    setVars({});
    setChat([]);
    setMode('run');
  }

  function forkTemplate(t: typeof PROMPT_TEMPLATES[number]) {
    setShowTemplates(false);
    startNew({
      title: t.title,
      description: t.description,
      content: t.content,
      model: t.model,
      tags: t.tags,
    });
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

  // Streaming helper — calls run-prompt edge function and streams tokens
  async function streamCompletion({
    model,
    system,
    messages,
    onDelta,
  }: {
    model: string;
    system?: string;
    messages: ChatMessage[];
    onDelta: (chunk: string) => void;
  }): Promise<string> {
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ model, system, messages }),
    });

    if (!resp.ok || !resp.body) {
      if (resp.status === 429) toast.error('Rate limit reached, try again shortly.');
      else if (resp.status === 402) toast.error('AI credits exhausted.');
      else toast.error('Failed to run prompt');
      throw new Error('stream failed');
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
            onDelta(c);
          }
        } catch {
          buf = line + '\n' + buf;
          break;
        }
      }
    }
    return assembled;
  }

  async function run() {
    if (!selected || !user) return;
    setRunning(true);
    setOutput('');
    const rendered = renderPrompt(selected.content, vars);

    try {
      const assembled = await streamCompletion({
        model: selected.model,
        messages: [{ role: 'user', content: rendered }],
        onDelta: (c) => {
          setOutput((prev) => prev + c);
        },
      });

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
      console.error(e);
    } finally {
      setRunning(false);
    }
  }

  async function sendChat() {
    if (!selected || !user || !chatInput.trim() || chatStreaming) return;
    const userMsg: ChatMessage = { role: 'user', content: chatInput.trim() };
    const nextMessages = [...chat, userMsg];
    setChat([...nextMessages, { role: 'assistant', content: '' }]);
    setChatInput('');
    setChatStreaming(true);

    // Use the rendered prompt as the system message (variables already filled where possible)
    const systemMsg = renderPrompt(selected.content, vars);

    try {
      let assembled = '';
      await streamCompletion({
        model: selected.model,
        system: systemMsg,
        messages: nextMessages,
        onDelta: (c) => {
          assembled += c;
          setChat((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: assembled };
            return copy;
          });
        },
      });

      await supabase.from('prompt_runs').insert({
        prompt_id: selected.id,
        owner_id: user.id,
        rendered_input: `[CHAT] system:\n${systemMsg}\n\n` +
          nextMessages.map((m) => `${m.role}: ${m.content}`).join('\n\n'),
        variables: vars,
        output: assembled,
        model: selected.model,
        status: 'completed',
      });
    } catch (e) {
      console.error(e);
      setChat((prev) => prev.slice(0, -1));
    } finally {
      setChatStreaming(false);
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
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setShowTemplates(true)} className="h-8 px-2" title="Browse templates">
                <BookOpen size={14} />
              </Button>
              <Button size="sm" onClick={() => startNew()} className="h-8">
                <Plus size={14} /> New
              </Button>
            </div>
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
            <div className="p-6 text-center text-sm text-muted-foreground space-y-3">
              <p>No prompts yet.</p>
              <Button size="sm" variant="outline" onClick={() => setShowTemplates(true)}>
                <BookOpen size={14} /> Browse templates
              </Button>
            </div>
          ) : (
            filtered.map((p) => {
              const folder = folders.find((f) => f.id === p.folder_id);
              const active = selected?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => selectPrompt(p)}
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

              {/* Mode tabs */}
              <div className="flex gap-1 p-1 bg-muted/40 rounded-lg w-fit">
                {([
                  { id: 'run' as const, label: 'Run', icon: Play },
                  { id: 'chat' as const, label: 'Chat', icon: MessageSquare },
                  { id: 'history' as const, label: 'History', icon: History },
                ]).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setMode(id)}
                    className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5 transition-colors ${
                      mode === id
                        ? 'bg-background shadow-sm font-medium text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>

              {/* Variables — visible in run + chat modes */}
              {mode !== 'history' && variables.length > 0 && (
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

              {/* RUN mode */}
              {mode === 'run' && (
                <>
                  <div className="rounded-xl border border-border/40 bg-muted/30 p-4">
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      Prompt template
                    </div>
                    <pre className="text-sm font-mono whitespace-pre-wrap text-foreground/90">
                      {selected.content}
                    </pre>
                  </div>

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
                </>
              )}

              {/* CHAT mode */}
              {mode === 'chat' && (
                <div className="rounded-xl border border-border/40 bg-background/60 flex flex-col h-[500px]">
                  <div className="px-4 py-2.5 border-b border-border/40 flex items-center justify-between">
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <MessageSquare size={12} /> Chat — prompt acts as system message
                    </div>
                    {chat.length > 0 && (
                      <button
                        onClick={() => setChat([])}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        disabled={chatStreaming}
                      >
                        <RotateCcw size={11} /> Reset
                      </button>
                    )}
                  </div>
                  <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                    {chat.length === 0 && (
                      <div className="text-center text-sm text-muted-foreground py-12">
                        Start a conversation. The prompt template is sent as the system message.
                      </div>
                    )}
                    {chat.map((m, i) => (
                      <div
                        key={i}
                        className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                            m.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted/70 text-foreground'
                          }`}
                        >
                          {m.content || <Loader2 size={14} className="animate-spin opacity-60" />}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 border-t border-border/40 flex gap-2">
                    <Textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void sendChat();
                        }
                      }}
                      placeholder="Send a message…"
                      rows={1}
                      className="resize-none min-h-[40px] max-h-32"
                      disabled={chatStreaming}
                    />
                    <Button onClick={sendChat} disabled={chatStreaming || !chatInput.trim()} size="icon">
                      {chatStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </Button>
                  </div>
                </div>
              )}

              {/* HISTORY mode */}
              {mode === 'history' && (
                <div className="space-y-3">
                  {historyLoading ? (
                    <div className="text-center text-sm text-muted-foreground py-8">Loading…</div>
                  ) : history.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-12 border border-dashed border-border/40 rounded-xl">
                      No runs yet. Execute the prompt to see history here.
                    </div>
                  ) : (
                    history.map((r) => (
                      <details
                        key={r.id}
                        className="group rounded-xl border border-border/40 bg-background/60 overflow-hidden"
                      >
                        <summary className="px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-muted/30 list-none">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-2 h-2 rounded-full ${r.status === 'completed' ? 'bg-emerald-500' : 'bg-destructive'}`} />
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {new Date(r.created_at).toLocaleString()}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {r.model} · {r.output?.slice(0, 80) ?? '—'}
                              </div>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground group-open:rotate-90 transition-transform">▸</span>
                        </summary>
                        <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3">
                          {Object.keys(r.variables ?? {}).length > 0 && (
                            <div>
                              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Variables</div>
                              <pre className="text-xs font-mono bg-muted/40 rounded-lg p-2 whitespace-pre-wrap">
                                {JSON.stringify(r.variables, null, 2)}
                              </pre>
                            </div>
                          )}
                          <div>
                            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Input</div>
                            <pre className="text-xs font-mono bg-muted/40 rounded-lg p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">
                              {r.rendered_input}
                            </pre>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Output</div>
                              {r.output && (
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(r.output ?? '');
                                    toast.success('Copied');
                                  }}
                                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                                >
                                  <Copy size={10} /> Copy
                                </button>
                              )}
                            </div>
                            <div className="text-sm whitespace-pre-wrap leading-relaxed bg-primary/5 rounded-lg p-3 border border-primary/20">
                              {r.output ?? <span className="text-muted-foreground">No output</span>}
                            </div>
                          </div>
                        </div>
                      </details>
                    ))
                  )}
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
                Save reusable AI prompts, run them with variables, chat multi-turn, and review past runs.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => startNew()}><Plus size={14} /> New prompt</Button>
                <Button variant="outline" onClick={() => setShowTemplates(true)}>
                  <BookOpen size={14} /> Browse templates
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Templates dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen size={18} /> Prompt Templates
            </DialogTitle>
            <DialogDescription>
              Fork a starter prompt into your workspace. You can edit it freely after.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            {PROMPT_TEMPLATES.map((t) => (
              <button
                key={t.title}
                onClick={() => forkTemplate(t)}
                className="text-left p-4 rounded-xl border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{t.icon}</span>
                  <span className="font-medium">{t.title}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{t.description}</p>
                <div className="flex flex-wrap gap-1">
                  {t.tags.map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
