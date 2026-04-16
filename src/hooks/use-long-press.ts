import { useRef, useCallback } from "react";

/**
 * Long-press handler that works for touch + mouse. Fires `onLongPress` after
 * `delay` ms of held pointer; cancels if the pointer moves more than 8px
 * (so a scroll/swipe doesn't accidentally trigger it on mobile).
 *
 * Returns props you spread onto the target element. The element should still
 * accept normal taps for its primary action — long-press is additive.
 */
export function useLongPress(onLongPress: () => void, delay = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    startPos.current = null;
  }, []);

  const start = useCallback(
    (x: number, y: number) => {
      fired.current = false;
      startPos.current = { x, y };
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, delay);
    },
    [onLongPress, delay]
  );

  const move = useCallback(
    (x: number, y: number) => {
      if (!startPos.current) return;
      const dx = x - startPos.current.x;
      const dy = y - startPos.current.y;
      if (dx * dx + dy * dy > 64) clear();
    },
    [clear]
  );

  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start(t.clientX, t.clientY);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      move(t.clientX, t.clientY);
    },
    onTouchEnd: clear,
    onTouchCancel: clear,
    onMouseDown: (e: React.MouseEvent) => start(e.clientX, e.clientY),
    onMouseMove: (e: React.MouseEvent) => move(e.clientX, e.clientY),
    onMouseUp: clear,
    onMouseLeave: clear,
    /** Read after the press to know if a long-press fired (suppress click). */
    didLongPressRef: fired,
  };
}
