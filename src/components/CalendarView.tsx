import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isSameDay, isToday, addMonths, subMonths,
} from 'date-fns';
import { useAppStore, type CalEvent } from '@/store/app-store';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';

const EVENT_COLORS = ['#667eea', '#f5576c', '#43e97b', '#4facfe', '#fa709a', '#fbc2eb'];

function AddEventModal({
  selectedDate,
  newEventTitle,
  setNewEventTitle,
  newEventColor,
  setNewEventColor,
  onAdd,
  onClose,
}: {
  selectedDate: Date;
  newEventTitle: string;
  setNewEventTitle: (v: string) => void;
  newEventColor: string;
  setNewEventColor: (v: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ zIndex: 9999 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Plain overlay, no backdrop-blur — avoids focus-stealing on inputs */}
      <div className="fixed inset-0 bg-black/40" style={{ zIndex: -1 }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="glass-strong w-full max-w-sm p-6 space-y-4 relative"
        style={{ zIndex: 10000 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">
          Add Event — {format(selectedDate, 'MMM d')}
        </h3>
        <input
          value={newEventTitle}
          onChange={(e) => setNewEventTitle(e.target.value)}
          placeholder="Event title"
          autoFocus
          className="w-full px-4 py-3 rounded-2xl bg-muted/50 border border-border/30 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        />
        <div className="flex items-center gap-2">
          {EVENT_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setNewEventColor(color)}
              className={`w-7 h-7 rounded-full transition-transform ${
                newEventColor === color ? 'scale-125 ring-2 ring-primary/40' : ''
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="pill-button bg-muted text-foreground"
          >
            Cancel
          </button>
          <button onClick={onAdd} className="pill-button gradient-accent text-white">
            Add
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

export function CalendarView() {
  const { events, addEvent, deleteEvent } = useAppStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventColor, setNewEventColor] = useState(EVENT_COLORS[0]);

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const getEventsForDate = (date: Date) =>
    events.filter((e) => isSameDay(new Date(e.date), date));

  const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  const handleAddEvent = () => {
    if (!selectedDate || !newEventTitle.trim()) return;
    addEvent({
      title: newEventTitle.trim(),
      date: format(selectedDate, 'yyyy-MM-dd'),
      color: newEventColor,
    });
    setNewEventTitle('');
    setShowAddModal(false);
  };

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* Calendar Grid */}
      <div className="flex-1 p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">{format(currentMonth, 'MMMM yyyy')}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="pill-button bg-muted/50 text-sm text-foreground"
            >
              Today
            </button>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            const dayEvents = getEventsForDate(day);
            const inMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);
            const selected = selectedDate && isSameDay(day, selectedDate);

            return (
              <motion.button
                key={day.toISOString()}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.01 }}
                onClick={() => setSelectedDate(day)}
                className={`relative aspect-square p-1 rounded-xl text-sm transition-all ${
                  selected
                    ? 'bg-primary/10 ring-2 ring-primary/30'
                    : today
                    ? 'bg-primary/5'
                    : 'hover:bg-muted/30'
                } ${!inMonth ? 'opacity-30' : ''}`}
              >
                <span
                  className={`text-xs font-medium ${
                    today ? 'text-primary font-bold' : 'text-foreground'
                  }`}
                >
                  {format(day, 'd')}
                </span>
                {dayEvents.length > 0 && (
                  <div className="flex flex-col gap-0.5 mt-0.5 overflow-hidden">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className="text-[9px] leading-tight truncate rounded px-1 py-0.5 text-white font-medium"
                        style={{ backgroundColor: ev.color }}
                      >
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="text-[9px] text-muted-foreground">
                        +{dayEvents.length - 2} more
                      </span>
                    )}
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Side Panel */}
      <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-border/30 p-4 md:p-6">
        {selectedDate ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{format(selectedDate, 'EEEE, MMM d')}</h3>
              <button
                onClick={() => {
                  setNewEventTitle('');
                  setNewEventColor(EVENT_COLORS[0]);
                  setShowAddModal(true);
                }}
                className="p-1.5 rounded-xl gradient-accent text-white"
              >
                <Plus size={16} />
              </button>
            </div>
            {selectedEvents.length > 0 ? (
              <div className="space-y-2">
                {selectedEvents.map((ev, i) => (
                  <motion.div
                    key={ev.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="glass p-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                      <span className="text-sm font-medium">{ev.title}</span>
                    </div>
                    <button
                      onClick={() => deleteEvent(ev.id)}
                      className="p-1 rounded hover:bg-muted/50 text-muted-foreground"
                    >
                      <Trash2 size={14} />
                    </button>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No events this day</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Select a day to view events</p>
        )}
      </div>

      {/* Portal-based modal — renders above everything, no backdrop-blur */}
      <AnimatePresence>
        {showAddModal && selectedDate && (
          <AddEventModal
            selectedDate={selectedDate}
            newEventTitle={newEventTitle}
            setNewEventTitle={setNewEventTitle}
            newEventColor={newEventColor}
            setNewEventColor={setNewEventColor}
            onAdd={handleAddEvent}
            onClose={() => setShowAddModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
