import { useEffect, useState, useLayoutEffect } from 'react';
import type { CollabCursor } from '@/hooks/use-collab-presence';

interface Props {
  cursors: CollabCursor[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  getBlockEl: (blockId: string) => HTMLElement | null | undefined;
}

interface PositionedCursor {
  cursor: CollabCursor;
  top: number;
  left: number;
  height: number;
  width: number;
}

/**
 * Compute pixel position of a (blockEl, charOffset) pair relative to the
 * container. Walks the block's text nodes to find the offset.
 */
function locate(
  blockEl: HTMLElement,
  offset: number,
  selectionLength: number,
  containerRect: DOMRect
): { top: number; left: number; height: number; width: number } | null {
  // Find the text node that contains `offset`.
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  let consumed = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  while (node) {
    const text = node as Text;
    const len = text.data.length;
    if (consumed + len >= offset) {
      startNode = text;
      startOffset = offset - consumed;
      break;
    }
    consumed += len;
    node = walker.nextNode();
  }

  // Empty block — anchor at the block's top-left padding box.
  if (!startNode) {
    const r = blockEl.getBoundingClientRect();
    return {
      top: r.top - containerRect.top,
      left: r.left - containerRect.left,
      height: r.height || 20,
      width: 0,
    };
  }

  const range = document.createRange();
  try {
    range.setStart(startNode, Math.min(startOffset, startNode.data.length));
    if (selectionLength > 0) {
      // Find end node similarly.
      const endTotal = offset + selectionLength;
      const walker2 = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
      let n: Node | null = walker2.nextNode();
      let consumed2 = 0;
      let endNode: Text | null = null;
      let endOffset = 0;
      while (n) {
        const t = n as Text;
        const len = t.data.length;
        if (consumed2 + len >= endTotal) {
          endNode = t;
          endOffset = endTotal - consumed2;
          break;
        }
        consumed2 += len;
        n = walker2.nextNode();
      }
      if (endNode) {
        range.setEnd(endNode, Math.min(endOffset, endNode.data.length));
      } else {
        range.setEnd(startNode, Math.min(startOffset, startNode.data.length));
      }
    } else {
      range.setEnd(startNode, Math.min(startOffset, startNode.data.length));
    }
  } catch {
    return null;
  }

  const rects = range.getClientRects();
  const r = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
  return {
    top: r.top - containerRect.top,
    left: r.left - containerRect.left,
    height: r.height || 20,
    width: selectionLength > 0 ? r.width : 0,
  };
}

export function CollabCursors({ cursors, containerRef, getBlockEl }: Props) {
  const [positions, setPositions] = useState<PositionedCursor[]>([]);

  // Recompute on cursor changes, scroll, or resize.
  useLayoutEffect(() => {
    const compute = () => {
      const container = containerRef.current;
      if (!container) {
        setPositions([]);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const next: PositionedCursor[] = [];
      for (const c of cursors) {
        if (!c.blockId) continue;
        const el = getBlockEl(c.blockId);
        if (!el) continue;
        const pos = locate(el, c.offset, c.selectionLength, containerRect);
        if (!pos) continue;
        next.push({ cursor: c, ...pos });
      }
      setPositions(next);
    };
    compute();

    const onScroll = () => compute();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', compute);
    };
  }, [cursors, containerRef, getBlockEl]);

  // Hide labels after a short idle period — keep just the caret.
  const [labelsVisible, setLabelsVisible] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const visibleNow: Record<string, boolean> = {};
    for (const p of positions) visibleNow[p.cursor.userId] = true;
    setLabelsVisible(visibleNow);
    const t = setTimeout(() => {
      const next: Record<string, boolean> = {};
      for (const p of positions) next[p.cursor.userId] = false;
      setLabelsVisible(next);
    }, 1800);
    return () => clearTimeout(t);
  }, [positions]);

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {positions.map(({ cursor, top, left, height, width }) => (
        <div key={cursor.userId}>
          {width > 0 && (
            <div
              className="absolute rounded-sm"
              style={{
                top,
                left,
                width,
                height,
                background: cursor.color,
                opacity: 0.18,
              }}
            />
          )}
          <div
            className="absolute"
            style={{
              top,
              left,
              width: 2,
              height,
              background: cursor.color,
              transition: 'top 80ms linear, left 80ms linear, height 80ms linear',
            }}
          />
          <div
            className="absolute -translate-y-full text-[10px] font-medium text-white px-1.5 py-0.5 rounded-md whitespace-nowrap shadow-sm"
            style={{
              top,
              left,
              background: cursor.color,
              opacity: labelsVisible[cursor.userId] ? 1 : 0,
              transition: 'opacity 220ms ease',
            }}
          >
            {cursor.name}
          </div>
        </div>
      ))}
    </div>
  );
}
