import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext, DragOverlay, useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { useAppStore, type Task, type KanbanColumn } from '@/store/app-store';
import {
  Plus, X, MoreHorizontal, Calendar, Flag, GripVertical, Trash2, Edit2,
} from 'lucide-react';

const LABEL_COLORS: Record<string, string> = {
  design: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  dev: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  bug: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  docs: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  content: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  devops: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
};

const PRIORITY_COLORS = {
  low: 'text-green-500',
  medium: 'text-amber-500',
  high: 'text-red-500',
};

function DroppableColumn({
  column,
  children,
  taskCount,
  onAddTask,
  onRename,
  onDelete,
}: {
  column: KanbanColumn;
  children: React.ReactNode;
  taskCount: number;
  onAddTask: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(column.title);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 md:w-80 shrink-0 rounded-2xl transition-colors ${
        isOver ? 'bg-primary/5' : ''
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2.5 mb-2">
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              onRename(title);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onRename(title);
                setEditing(false);
              }
            }}
            autoFocus
            className="text-sm font-semibold bg-transparent outline-none border-b border-primary"
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{column.title}</span>
            <span className="text-xs text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
              {taskCount}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditing(true)}
            className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground"
          >
            <Edit2 size={14} />
          </button>
          <button onClick={onAddTask} className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground">
            <Plus size={14} />
          </button>
          <button onClick={onDelete} className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-2 px-1 pb-2 min-h-[100px]">{children}</div>
    </div>
  );
}

function DraggableCard({ task, onEdit, onDelete }: { task: Task; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.5 : 1 }
    : {};

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: isDragging ? 0.5 : 1, scale: 1 }}
      className="glass p-3 cursor-grab active:cursor-grabbing group"
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-foreground leading-snug">{task.title}</span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1 rounded hover:bg-muted/50"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Edit2 size={12} className="text-muted-foreground" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded hover:bg-muted/50"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <X size={12} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {task.labels.map((label) => (
          <span
            key={label}
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
              LABEL_COLORS[label] || 'bg-muted text-muted-foreground'
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-2">
        {task.dueDate && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar size={10} />
            {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        <span className={`flex items-center gap-1 text-xs ${PRIORITY_COLORS[task.priority]}`}>
          <Flag size={10} />
          {task.priority}
        </span>
      </div>
    </motion.div>
  );
}

export function KanbanBoard() {
  const { columns, tasks, addTask, updateTask, deleteTask, moveTask, addColumn, updateColumn, deleteColumn } =
    useAppStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState<string | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newColTitle, setNewColTitle] = useState('');
  const [showAddCol, setShowAddCol] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const taskId = active.id as string;
    const overId = over.id as string;
    // Check if over a column
    const col = columns.find((c) => c.id === overId);
    if (col) {
      moveTask(taskId, col.id);
    } else {
      // Dropped on another card - move to that card's column
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) moveTask(taskId, overTask.columnId);
    }
  };

  const openAddModal = (columnId: string) => {
    setShowAddModal(columnId);
    setNewTitle('');
    setNewLabel('');
    setNewDueDate('');
    setNewPriority('medium');
    setEditTask(null);
  };

  const openEditModal = (task: Task) => {
    setEditTask(task);
    setShowAddModal(task.columnId);
    setNewTitle(task.title);
    setNewLabel(task.labels.join(', '));
    setNewDueDate(task.dueDate || '');
    setNewPriority(task.priority);
  };

  const handleSaveTask = () => {
    const labels = newLabel
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);
    if (editTask) {
      updateTask(editTask.id, {
        title: newTitle,
        labels,
        dueDate: newDueDate || null,
        priority: newPriority,
      });
    } else if (showAddModal) {
      addTask({
        title: newTitle || 'New Task',
        columnId: showAddModal,
        labels,
        dueDate: newDueDate || null,
        priority: newPriority,
      });
    }
    setShowAddModal(null);
    setEditTask(null);
  };

  const activeTask = tasks.find((t) => t.id === activeId);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 p-4 md:p-6 h-full min-w-max">
            {columns
              .sort((a, b) => a.order - b.order)
              .map((col) => {
                const colTasks = tasks.filter((t) => t.columnId === col.id);
                return (
                  <DroppableColumn
                    key={col.id}
                    column={col}
                    taskCount={colTasks.length}
                    onAddTask={() => openAddModal(col.id)}
                    onRename={(title) => updateColumn(col.id, title)}
                    onDelete={() => deleteColumn(col.id)}
                  >
                    {colTasks.map((task) => (
                      <DraggableCard
                        key={task.id}
                        task={task}
                        onEdit={() => openEditModal(task)}
                        onDelete={() => deleteTask(task.id)}
                      />
                    ))}
                  </DroppableColumn>
                );
              })}

            {/* Add column button */}
            <div className="w-72 shrink-0">
              {showAddCol ? (
                <div className="glass p-3 space-y-2">
                  <input
                    value={newColTitle}
                    onChange={(e) => setNewColTitle(e.target.value)}
                    placeholder="Column name"
                    autoFocus
                    className="w-full px-3 py-2 rounded-xl bg-muted/50 text-sm outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newColTitle.trim()) {
                        addColumn(newColTitle.trim());
                        setNewColTitle('');
                        setShowAddCol(false);
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (newColTitle.trim()) {
                          addColumn(newColTitle.trim());
                          setNewColTitle('');
                          setShowAddCol(false);
                        }
                      }}
                      className="pill-button gradient-accent text-white text-xs"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setShowAddCol(false)}
                      className="pill-button bg-muted text-foreground text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddCol(true)}
                  className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm text-muted-foreground hover:bg-muted/30 transition-colors w-full"
                >
                  <Plus size={16} />
                  Add column
                </button>
              )}
            </div>
          </div>

          <DragOverlay>
            {activeTask && (
              <div className="glass p-3 w-72 rotate-2 shadow-xl">
                <span className="text-sm font-medium">{activeTask.title}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Add/Edit Task Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            onClick={() => {
              setShowAddModal(null);
              setEditTask(null);
            }}
          >
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong w-full max-w-md p-6 space-y-4"
            >
              <h3 className="text-lg font-semibold">{editTask ? 'Edit Task' : 'New Task'}</h3>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Task title"
                autoFocus
                className="w-full px-4 py-3 rounded-2xl bg-muted/50 border border-border/30 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Labels (comma separated)"
                className="w-full px-4 py-3 rounded-2xl bg-muted/50 border border-border/30 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-muted/50 border border-border/30 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex items-center gap-2">
                {(['low', 'medium', 'high'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setNewPriority(p)}
                    className={`pill-button text-xs capitalize ${
                      newPriority === p
                        ? 'gradient-accent text-white'
                        : 'bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowAddModal(null);
                    setEditTask(null);
                  }}
                  className="pill-button bg-muted text-foreground"
                >
                  Cancel
                </button>
                <button onClick={handleSaveTask} className="pill-button gradient-accent text-white">
                  {editTask ? 'Save' : 'Add Task'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
