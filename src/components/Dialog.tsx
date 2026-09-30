import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useI18n } from '@/i18n/useI18n';
import { Icon } from './Icon';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal dialog:
 * - role="dialog", aria-modal, labelled by its title
 * - focus moves into the dialog on open and returns to the opener on close
 * - Tab/Shift+Tab stay inside the dialog; Escape closes it
 * - the caller makes the background inert while it is open (see Shell)
 */
export function Dialog({
  title,
  onClose,
  children,
  initialFocusRef,
  className = '',
  describedBy,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  describedBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { m } = useI18n();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const target =
      initialFocusRef?.current ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE) ?? ref.current;
    target?.focus();
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [initialFocusRef]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !el.hasAttribute('hidden'),
    );
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="dialog__header">
          <h2 id={titleId} className="dialog__title">
            {title}
          </h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label={m.common.closeDialog}
          >
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="dialog__body">{children}</div>
      </div>
    </div>
  );
}
