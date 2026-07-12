'use client';

import {
  type KeyboardEvent,
  type MouseEventHandler,
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useRef,
} from 'react';

type FocusDialogProps = {
  children: ReactNode;
  className: string;
  labelledBy?: string;
  initialFocusRef?: MutableRefObject<HTMLElement | null>;
  onEscape?: () => void;
  onClick?: MouseEventHandler<HTMLDivElement>;
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('disabled') && !element.hidden);
}

export function FocusDialog({
  children,
  className,
  labelledBy,
  initialFocusRef,
  onEscape,
  onClick,
}: FocusDialogProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const root = rootRef.current;
    if (!root) return;

    const initial = initialFocusRef?.current ?? getFocusable(root)[0] ?? root;
    initial.focus();

    return () => {
      const opener = openerRef.current;
      if (opener && document.contains(opener)) {
        opener.focus();
      }
    };
  }, [initialFocusRef]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && onEscape) {
      event.preventDefault();
      onEscape();
      return;
    }

    if (event.key !== 'Tab') return;

    const root = rootRef.current;
    if (!root) return;

    const focusable = getFocusable(root);
    if (focusable.length === 0) {
      event.preventDefault();
      root.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={rootRef}
      className={className}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
