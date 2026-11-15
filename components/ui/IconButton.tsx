import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const OPEN_DELAY_MS = 450;
const WARM_WINDOW_MS = 700;

type TooltipPlacement = 'bottom' | 'left';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  label: string;
  /** Where the tooltip opens relative to the button. */
  tooltipPlacement?: TooltipPlacement;
};

/**
 * Shared timestamp so moving along a row of icon buttons keeps the tooltips
 * instant after the first one; it feels like one tooltip following the pointer.
 */
let lastTooltipClosedAt = 0;

export function IconButton({
  active,
  className,
  label,
  tooltipPlacement = 'bottom',
  ...props
}: IconButtonProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      lastTooltipClosedAt = Date.now();
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const close = () => {
    clearTimer();
    if (open) lastTooltipClosedAt = Date.now();
    setOpen(false);
  };

  const schedule = (immediate: boolean) => {
    clearTimer();
    if (immediate || Date.now() - lastTooltipClosedAt < WARM_WINDOW_MS) {
      setOpen(true);
      return;
    }
    timer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={() => schedule(false)}
      onPointerLeave={close}
      onPointerDown={close}
      onFocus={() => schedule(true)}
      onBlur={close}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-muted transition-colors',
          'hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
          'disabled:cursor-not-allowed disabled:opacity-40',
          active && 'bg-selected text-ink',
          className,
        )}
        {...props}
      />
      {open ? (
        <span
          role="tooltip"
          id={tooltipId}
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-tooltip px-2 py-1 text-[11px] font-medium leading-none text-tooltip-ink shadow-lg',
            tooltipPlacement === 'left'
              ? 'right-[calc(100%+8px)] top-1/2 -translate-y-1/2'
              : 'left-1/2 top-[calc(100%+6px)] -translate-x-1/2',
          )}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
