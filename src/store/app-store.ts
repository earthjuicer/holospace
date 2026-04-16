import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// SSR-safe storage: returns a no-op storage on the server, real localStorage in the browser
const ssrSafeStorage = () => {
  if (typeof window === 'undefined') {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }
  return window.localStorage;
};

export interface Block {
  id: string;
  type: 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'bullet' | 'numbered' | 'quote' | 'code' | 'divider' | 'toggle';
  content: string;
  collapsed?: boolean;
}

export interface Doc {
  id: string;
  title: string;
  icon: string;
  coverGradient: string;
  blocks: Block[];
  pinned: boolean;
  favorite: boolean;
  lastEdited: number;
  parentId: string | null;
}

export interface Task {
  id: string;
  title: string;
  columnId: string;
  labels: string[];
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high';
}

export interface KanbanColumn {
  id: string;
  title: string;
  order: number;
}

export interface CalEvent {
  id: string;
  title: string;
  date: string;
  color: string;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  accentColor: string;
  fontSize: 'small' | 'default' | 'large';
  userName: string;
  userEmail: string;
  avatar: string | null;
}

const uid = () => crypto.randomUUID();

const GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
];

function seedDocuments(): Doc[] {
  // Use deterministic IDs — these run at module load, including during SSR
  // in the Cloudflare Worker which disallows crypto/random in global scope.
  return [
    {
      id: 'seed-doc-1',
      title: 'Getting Started',
      icon: '🚀',
      coverGradient: GRADIENTS[0],
      blocks: [
        { id: 'seed-doc-1-b1', type: 'heading1', content: 'Welcome to your workspace' },
        { id: 'seed-doc-1-b2', type: 'paragraph', content: 'This is your personal productivity hub. Create documents, manage tasks, and stay organized.' },
        { id: 'seed-doc-1-b3', type: 'heading2', content: 'Quick tips' },
        { id: 'seed-doc-1-b4', type: 'bullet', content: 'Use the sidebar to navigate between pages' },
        { id: 'seed-doc-1-b5', type: 'bullet', content: 'Type / in the editor to insert different block types' },
        { id: 'seed-doc-1-b6', type: 'bullet', content: 'Press Cmd+K to search across all your pages' },
        { id: 'seed-doc-1-b7', type: 'divider', content: '' },
        { id: 'seed-doc-1-b8', type: 'quote', content: 'The secret of getting ahead is getting started.' },
      ],
      pinned: true, favorite: true, lastEdited: 0, parentId: null,
    },
    {
      id: 'seed-doc-2',
      title: 'Meeting Notes',
      icon: '📝',
      coverGradient: GRADIENTS[1],
      blocks: [
        { id: 'seed-doc-2-b1', type: 'heading1', content: 'Team Sync — April 2026' },
        { id: 'seed-doc-2-b2', type: 'paragraph', content: 'Attendees: Alex, Jordan, Sam, Taylor' },
        { id: 'seed-doc-2-b3', type: 'heading2', content: 'Agenda' },
        { id: 'seed-doc-2-b4', type: 'numbered', content: 'Product roadmap review' },
        { id: 'seed-doc-2-b5', type: 'numbered', content: 'Design system updates' },
        { id: 'seed-doc-2-b6', type: 'numbered', content: 'Sprint planning' },
        { id: 'seed-doc-2-b7', type: 'heading2', content: 'Action Items' },
        { id: 'seed-doc-2-b8', type: 'bullet', content: 'Finalize Q2 milestones by Friday' },
        { id: 'seed-doc-2-b9', type: 'bullet', content: 'Schedule design review session' },
      ],
      pinned: false, favorite: true, lastEdited: 0, parentId: null,
    },
    {
      id: 'seed-doc-3',
      title: 'Project Ideas',
      icon: '💡',
      coverGradient: GRADIENTS[2],
      blocks: [
        { id: 'seed-doc-3-b1', type: 'heading1', content: 'Brainstorm' },
        { id: 'seed-doc-3-b2', type: 'paragraph', content: 'A collection of project ideas to explore.' },
        { id: 'seed-doc-3-b3', type: 'bullet', content: 'AI-powered recipe generator' },
        { id: 'seed-doc-3-b4', type: 'bullet', content: 'Collaborative mood board app' },
        { id: 'seed-doc-3-b5', type: 'bullet', content: 'Personal finance dashboard' },
      ],
      pinned: false, favorite: false, lastEdited: 0, parentId: null,
    },
  ];
}

function seedColumns(): KanbanColumn[] {
  return [
    { id: 'todo', title: 'To Do', order: 0 },
    { id: 'in-progress', title: 'In Progress', order: 1 },
    { id: 'review', title: 'Review', order: 2 },
    { id: 'done', title: 'Done', order: 3 },
  ];
}

function seedTasks(): Task[] {
  return [
    { id: 'seed-task-1', title: 'Design new landing page', columnId: 'todo', labels: ['design'], dueDate: '2026-04-20', priority: 'high' },
    { id: 'seed-task-2', title: 'Write API documentation', columnId: 'todo', labels: ['docs'], dueDate: '2026-04-22', priority: 'medium' },
    { id: 'seed-task-3', title: 'Implement auth flow', columnId: 'in-progress', labels: ['dev'], dueDate: '2026-04-18', priority: 'high' },
    { id: 'seed-task-4', title: 'Set up CI/CD pipeline', columnId: 'in-progress', labels: ['devops'], dueDate: null, priority: 'medium' },
    { id: 'seed-task-5', title: 'Review pull request #42', columnId: 'review', labels: ['dev'], dueDate: '2026-04-17', priority: 'low' },
    { id: 'seed-task-6', title: 'Update onboarding copy', columnId: 'done', labels: ['content'], dueDate: null, priority: 'low' },
    { id: 'seed-task-7', title: 'Fix mobile navigation bug', columnId: 'done', labels: ['bug'], dueDate: '2026-04-15', priority: 'high' },
  ];
}

function seedEvents(): CalEvent[] {
  // Static dates so this can run at module load on the server.
  return [
    { id: 'seed-event-1', title: 'Team standup', date: '2026-04-16', color: '#667eea' },
    { id: 'seed-event-2', title: 'Design review', date: '2026-04-18', color: '#f5576c' },
    { id: 'seed-event-3', title: 'Sprint retro', date: '2026-04-21', color: '#43e97b' },
    { id: 'seed-event-4', title: 'Lunch with Alex', date: '2026-04-17', color: '#4facfe' },
  ];
}

interface AppState {
  documents: Doc[];
  columns: KanbanColumn[];
  tasks: Task[];
  events: CalEvent[];
  settings: AppSettings;
  onboardingComplete: boolean;
  recentSearches: string[];
  sidebarOpen: boolean;

  // Document actions
  addDocument: (partial?: Partial<Doc>) => string;
  updateDocument: (id: string, updates: Partial<Doc>) => void;
  deleteDocument: (id: string) => void;
  togglePin: (id: string) => void;
  toggleFavorite: (id: string) => void;

  // Block actions
  addBlock: (docId: string, afterBlockId: string | null, block?: Partial<Block>) => string;
  updateBlock: (docId: string, blockId: string, updates: Partial<Block>) => void;
  deleteBlock: (docId: string, blockId: string) => void;

  // Task actions
  addTask: (task: Omit<Task, 'id'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  moveTask: (taskId: string, columnId: string) => void;

  // Column actions
  addColumn: (title: string) => void;
  updateColumn: (id: string, title: string) => void;
  deleteColumn: (id: string) => void;

  // Event actions
  addEvent: (event: Omit<CalEvent, 'id'>) => void;
  updateEvent: (id: string, updates: Partial<CalEvent>) => void;
  deleteEvent: (id: string) => void;

  // Settings
  updateSettings: (updates: Partial<AppSettings>) => void;
  completeOnboarding: () => void;
  addRecentSearch: (term: string) => void;
  clearRecentSearches: () => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      documents: seedDocuments(),
      columns: seedColumns(),
      tasks: seedTasks(),
      events: seedEvents(),
      settings: {
        theme: 'light',
        accentColor: '#667eea',
        fontSize: 'default',
        userName: 'User',
        userEmail: 'user@example.com',
        avatar: null,
      },
      onboardingComplete: false,
      recentSearches: [],
      sidebarOpen: true,

      addDocument: (partial) => {
        const id = uid();
        const doc: Doc = {
          id,
          title: partial?.title || 'Untitled',
          icon: partial?.icon || '📄',
          coverGradient: partial?.coverGradient || GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)],
          blocks: partial?.blocks || [{ id: uid(), type: 'paragraph', content: '' }],
          pinned: false,
          favorite: false,
          lastEdited: Date.now(),
          parentId: partial?.parentId || null,
          ...partial,
        };
        set((s) => ({ documents: [doc, ...s.documents] }));
        return id;
      },

      updateDocument: (id, updates) =>
        set((s) => ({
          documents: s.documents.map((d) =>
            d.id === id ? { ...d, ...updates, lastEdited: Date.now() } : d
          ),
        })),

      deleteDocument: (id) =>
        set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),

      togglePin: (id) =>
        set((s) => ({
          documents: s.documents.map((d) =>
            d.id === id ? { ...d, pinned: !d.pinned } : d
          ),
        })),

      toggleFavorite: (id) =>
        set((s) => ({
          documents: s.documents.map((d) =>
            d.id === id ? { ...d, favorite: !d.favorite } : d
          ),
        })),

      addBlock: (docId, afterBlockId, blockPartial) => {
        const blockId = uid();
        const block: Block = {
          id: blockId,
          type: 'paragraph',
          content: '',
          ...blockPartial,
        };
        set((s) => ({
          documents: s.documents.map((d) => {
            if (d.id !== docId) return d;
            const blocks = [...d.blocks];
            if (!afterBlockId) {
              blocks.push(block);
            } else {
              const idx = blocks.findIndex((b) => b.id === afterBlockId);
              blocks.splice(idx + 1, 0, block);
            }
            return { ...d, blocks, lastEdited: Date.now() };
          }),
        }));
        return blockId;
      },

      updateBlock: (docId, blockId, updates) =>
        set((s) => ({
          documents: s.documents.map((d) => {
            if (d.id !== docId) return d;
            return {
              ...d,
              blocks: d.blocks.map((b) => (b.id === blockId ? { ...b, ...updates } : b)),
              lastEdited: Date.now(),
            };
          }),
        })),

      deleteBlock: (docId, blockId) =>
        set((s) => ({
          documents: s.documents.map((d) => {
            if (d.id !== docId) return d;
            return {
              ...d,
              blocks: d.blocks.filter((b) => b.id !== blockId),
              lastEdited: Date.now(),
            };
          }),
        })),

      addTask: (task) =>
        set((s) => ({ tasks: [...s.tasks, { ...task, id: uid() }] })),

      updateTask: (id, updates) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),

      deleteTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      moveTask: (taskId, columnId) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, columnId } : t)),
        })),

      addColumn: (title) =>
        set((s) => ({
          columns: [
            ...s.columns,
            { id: uid(), title, order: s.columns.length },
          ],
        })),

      updateColumn: (id, title) =>
        set((s) => ({
          columns: s.columns.map((c) => (c.id === id ? { ...c, title } : c)),
        })),

      deleteColumn: (id) =>
        set((s) => ({
          columns: s.columns.filter((c) => c.id !== id),
          tasks: s.tasks.filter((t) => t.columnId !== id),
        })),

      addEvent: (event) =>
        set((s) => ({ events: [...s.events, { ...event, id: uid() }] })),

      updateEvent: (id, updates) =>
        set((s) => ({
          events: s.events.map((e) => (e.id === id ? { ...e, ...updates } : e)),
        })),

      deleteEvent: (id) =>
        set((s) => ({ events: s.events.filter((e) => e.id !== id) })),

      updateSettings: (updates) =>
        set((s) => ({ settings: { ...s.settings, ...updates } })),

      completeOnboarding: () => set({ onboardingComplete: true }),

      addRecentSearch: (term) =>
        set((s) => ({
          recentSearches: [term, ...s.recentSearches.filter((t) => t !== term)].slice(0, 10),
        })),

      clearRecentSearches: () => set({ recentSearches: [] }),

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    {
      name: 'notion-app-storage',
      storage: createJSONStorage(() => ssrSafeStorage()),
      skipHydration: true,
    }
  )
);
