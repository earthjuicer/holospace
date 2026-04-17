import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DOMPurify from 'dompurify';
import { useAppStore, type Block, type Doc } from '@/store/app-store';
import { useCollabPresence } from '@/hooks/use-collab-presence';
import { CollabCursors } from '@/components/CollabCursors';
import {
  Type, Heading1, Heading2, Heading3, List, ListOrdered, Quote,
  Code, Minus, ChevronRight, Bold, Italic, Underline, Save, RefreshCw,
} from 'lucide-react';

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'a', 'br', 'span', 'code'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
};

const sanitize = (html: string) => DOMPurify.sanitize(html, SANITIZE_CONFIG);

const BLOCK_TYPES = [
  { type: 'paragraph', label: 'Text', icon: Type, description: 'Plain text' },
  { type: 'heading1', label: 'Heading 1', icon: Heading1, description: 'Large heading' },
  { type: 'heading2', label: 'Heading 2', icon: Heading2, description: 'Medium heading' },
  { type: 'heading3', label: 'Heading 3', icon: Heading3, description: 'Small heading' },
  { type: 'bullet', label: 'Bullet List', icon: List, description: 'Unordered list item' },
  { type: 'numbered', label: 'Numbered List', icon: ListOrdered, description: 'Ordered list item' },
  { type: 'quote', label: 'Quote', icon: Quote, description: 'Block quote' },
  { type: 'code', label: 'Code', icon: Code, description: 'Code block' },
  { type: 'divider', label: 'Divider', icon: Minus, description: 'Horizontal rule' },
] as const;

const EMOJIS = ['📄', '📝', '💡', '🚀', '📚', '🎯', '💻', '🎨', '🔥', '⭐', '📊', '🗂️', '✨', '🌟', '💎', '🎉'];

interface BlockEditorProps {
  doc: Doc;
}

export function BlockEditor({ doc }: BlockEditorProps) {
  const { updateDocument, addBlock, updateBlock, deleteBlock } = useAppStore();
  const [slashMenuBlockId, setSlashMenuBlockId] = useState<string | null>(null);
  const [slashFilter, setSlashFilter] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [staleBlockId, setStaleBlockId] = useState<string | null>(null);
  const blockRefs = useRef<Map<string, HTMLElement>>(new Map());
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const focusedBlockIdRef = useRef<string | null>(null);
  // Last content we wrote into the DOM for each block — lets us detect
  // remote/store-driven changes vs. local typing.
  const lastSyncedContentRef = useRef<Map<string, string>>(new Map());
  const blocksContainerRef = useRef<HTMLDivElement>(null);

  // Realtime presence for collaborative cursors on this doc.
  const { remote: remoteCursors, broadcastCursor } = useCollabPresence(doc.id);

  const getBlockEl = useCallback(
    (blockId: string) => blockRefs.current.get(blockId),
    []
  );

  const triggerSave = useCallback(() => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      setSavedIndicator(true);
      setTimeout(() => setSavedIndicator(false), 1500);
    }, 500);
  }, []);

  const focusBlock = useCallback((blockId: string, toEnd = true) => {
    requestAnimationFrame(() => {
      const el = blockRefs.current.get(blockId);
      if (!el) return;
      el.focus();
      if (toEnd && el.textContent) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(el);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    });
  }, []);

  const handleBlockKeyDown = useCallback(
    (e: React.KeyboardEvent, block: Block, index: number) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const newId = addBlock(doc.id, block.id);
        setTimeout(() => focusBlock(newId), 30);
        triggerSave();
        return;
      }

      if (e.key === 'Backspace') {
        const el = e.currentTarget as HTMLElement;
        if (!el.textContent && doc.blocks.length > 1) {
          e.preventDefault();
          const prevBlock = doc.blocks[index - 1];
          deleteBlock(doc.id, block.id);
          if (prevBlock) focusBlock(prevBlock.id);
          triggerSave();
          return;
        }
      }

      if (e.key === 'ArrowUp' && index > 0) {
        const sel = window.getSelection();
        if (sel && sel.anchorOffset === 0) {
          e.preventDefault();
          focusBlock(doc.blocks[index - 1].id);
        }
      }

      if (e.key === 'ArrowDown' && index < doc.blocks.length - 1) {
        const sel = window.getSelection();
        const el = e.currentTarget as HTMLElement;
        if (sel && sel.anchorOffset === (el.textContent?.length || 0)) {
          e.preventDefault();
          focusBlock(doc.blocks[index + 1].id, false);
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        document.execCommand('bold');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        document.execCommand('italic');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'u') {
        e.preventDefault();
        document.execCommand('underline');
      }
    },
    [doc, addBlock, deleteBlock, focusBlock, triggerSave]
  );

  const handleBlockInput = useCallback(
    (block: Block, e: React.FormEvent) => {
      const el = e.currentTarget as HTMLElement;
      const content = sanitize(el.innerHTML);

      // Detect slash command
      if (el.textContent === '/') {
        setSlashMenuBlockId(block.id);
        setSlashFilter('');
        return;
      }
      if (slashMenuBlockId === block.id && el.textContent?.startsWith('/')) {
        setSlashFilter(el.textContent.slice(1).toLowerCase());
        return;
      }
      if (slashMenuBlockId === block.id) {
        setSlashMenuBlockId(null);
      }

      // Track what we just wrote so the ref reconciler can distinguish
      // local typing from remote/store updates.
      lastSyncedContentRef.current.set(block.id, content);
      // The user just typed — clear any 'updated elsewhere' hint for this block.
      setStaleBlockId((cur) => (cur === block.id ? null : cur));
      updateBlock(doc.id, block.id, { content });
      triggerSave();
    },
    [doc.id, updateBlock, slashMenuBlockId, triggerSave]
  );

  const handleSlashSelect = useCallback(
    (blockId: string, type: string) => {
      const el = blockRefs.current.get(blockId);
      if (el) el.innerHTML = '';
      updateBlock(doc.id, blockId, { type: type as Block['type'], content: '' });
      setSlashMenuBlockId(null);
      setSlashFilter('');
      focusBlock(blockId);
      triggerSave();
    },
    [doc.id, updateBlock, focusBlock, triggerSave]
  );

  const filteredBlockTypes = slashFilter
    ? BLOCK_TYPES.filter(
        (bt) =>
          bt.label.toLowerCase().includes(slashFilter) ||
          bt.type.includes(slashFilter)
      )
    : BLOCK_TYPES;

  const setBlockRef = useCallback((blockId: string, initialHtml: string) => (el: HTMLElement | null) => {
    if (el) {
      blockRefs.current.set(blockId, el);
      // Only set innerHTML on mount or when external content differs from DOM.
      // Never overwrite during typing — that resets the caret to position 0
      // and makes characters appear reversed.
      const sanitized = sanitize(initialHtml);
      if (el.innerHTML !== sanitized && document.activeElement !== el) {
        el.innerHTML = sanitized;
      }
    } else {
      blockRefs.current.delete(blockId);
    }
  }, []);

  const renderBlockElement = (block: Block, index: number) => {
    if (block.type === 'divider') {
      return (
        <div className="py-3 group cursor-pointer" key={block.id}>
          <hr className="border-border/50" />
        </div>
      );
    }

    const baseClasses =
      'outline-none w-full leading-relaxed';
    const typeClasses: Record<string, string> = {
      heading1: 'text-3xl font-bold',
      heading2: 'text-2xl font-semibold',
      heading3: 'text-xl font-semibold',
      paragraph: 'text-base',
      bullet: 'text-base',
      numbered: 'text-base',
      quote: 'text-base italic border-l-3 border-primary/40 pl-4 text-muted-foreground',
      code: 'font-mono text-sm bg-muted/50 rounded-lg p-3',
    };

    return (
      <div key={block.id} className="group relative flex gap-2 py-0.5">
        {block.type === 'bullet' && (
          <span className="text-muted-foreground mt-0.5 select-none">•</span>
        )}
        {block.type === 'numbered' && (
          <span className="text-muted-foreground mt-0.5 select-none min-w-[1.2em]">
            {doc.blocks.filter((b, i) => b.type === 'numbered' && i <= index).length}.
          </span>
        )}
        <div className="flex-1 relative">
          <div
            ref={setBlockRef(block.id, block.content)}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => handleBlockInput(block, e)}
            onKeyDown={(e) => handleBlockKeyDown(e, block, index)}
            data-placeholder={
              block.type === 'heading1'
                ? 'Heading 1'
                : block.type === 'heading2'
                ? 'Heading 2'
                : block.type === 'heading3'
                ? 'Heading 3'
                : "Type '/' for commands…"
            }
            className={`${baseClasses} ${typeClasses[block.type] || ''} empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40`}
          />

          {/* Slash Menu */}
          <AnimatePresence>
            {slashMenuBlockId === block.id && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="absolute left-0 top-full mt-1 z-20 glass-strong w-64 py-2 max-h-72 overflow-y-auto"
              >
                {filteredBlockTypes.map((bt) => (
                  <button
                    key={bt.type}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSlashSelect(block.id, bt.type);
                    }}
                    className="flex items-center gap-3 w-full px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
                      <bt.icon size={16} className="text-muted-foreground" />
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{bt.label}</div>
                      <div className="text-xs text-muted-foreground">{bt.description}</div>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      {/* Cover */}
      {doc.coverGradient && (
        <div
          className="w-full h-40 md:h-52 rounded-2xl mb-6 relative overflow-hidden"
          style={{ background: doc.coverGradient }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />
        </div>
      )}

      {/* Icon + Title */}
      <div className="mb-6">
        <div className="relative inline-block">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="text-5xl hover:scale-110 transition-transform cursor-pointer"
          >
            {doc.icon}
          </button>
          <AnimatePresence>
            {showEmojiPicker && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="absolute top-full left-0 mt-2 z-20 glass-strong p-3 grid grid-cols-8 gap-1"
              >
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      updateDocument(doc.id, { icon: emoji });
                      setShowEmojiPicker(false);
                    }}
                    className="text-2xl hover:scale-125 transition-transform p-1"
                  >
                    {emoji}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <input
          value={doc.title}
          onChange={(e) => {
            updateDocument(doc.id, { title: e.target.value });
            triggerSave();
          }}
          placeholder="Untitled"
          className="block w-full text-4xl font-bold bg-transparent outline-none mt-2 placeholder:text-muted-foreground/30"
        />
      </div>

      {/* Save indicator */}
      <AnimatePresence>
        {savedIndicator && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4"
          >
            <Save size={12} />
            <span>Saved</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Blocks */}
      <div className="space-y-1">
        {doc.blocks.map((block, i) => renderBlockElement(block, i))}
      </div>
    </div>
  );
}
