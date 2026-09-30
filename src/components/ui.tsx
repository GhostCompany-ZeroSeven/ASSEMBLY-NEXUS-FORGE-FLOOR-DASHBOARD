import { useId, type ReactNode } from 'react';
import type { Tone } from '@/domain/status';
import { formatClock } from '@/domain/time';
import { Icon, type IconName } from './Icon';

export function Panel({
  title,
  eyebrow,
  actions,
  children,
  className = '',
  tone,
  id,
  focusId,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: Tone;
  id?: string;
  /** Deep-link target id (see useFocusTarget). */
  focusId?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      className={`panel ${className}`}
      data-tone={tone}
      aria-labelledby={title ? headingId : undefined}
      id={id}
      data-focus-id={focusId}
    >
      {(title || actions || eyebrow) && (
        <header className="panel__header">
          <div>
            {eyebrow && <div className="panel__eyebrow">{eyebrow}</div>}
            {title && (
              <h2 className="panel__title" id={headingId}>
                {title}
              </h2>
            )}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function StatusBadge({
  tone,
  children,
  pulse = false,
  size = 'md',
}: {
  tone: Tone;
  children: ReactNode;
  pulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span className={`badge badge--${size}`} data-tone={tone}>
      <span className={`badge__dot${pulse ? ' badge__dot--pulse' : ''}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Progress bar that renders an explicit "no data" state instead of 0%. */
export function ProgressBar({
  value,
  tone = 'active',
  label,
  showValue = true,
}: {
  value: number | null | undefined;
  tone?: Tone;
  label: string;
  showValue?: boolean;
}) {
  if (value === null || value === undefined) {
    return (
      <div className="progress progress--unknown" aria-label={`${label}: not reported`}>
        <div className="progress__track">
          <div className="progress__indeterminate" />
        </div>
        {showValue && <span className="progress__value">n/a</span>}
      </div>
    );
  }
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="progress" data-tone={tone}>
      <div
        className="progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="progress__fill" style={{ width: `${pct}%` }} />
      </div>
      {showValue && <span className="progress__value">{pct}%</span>}
    </div>
  );
}

/**
 * Command-center instrument readout (circuit-board style seven-segment feel).
 * `ms === null` renders dashes: we never fake a number the backend did not give.
 */
export function SegmentClock({
  ms,
  label,
  tone = 'active',
  size = 'md',
  caption,
}: {
  ms: number | null;
  label: string;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  caption?: ReactNode;
}) {
  const labelId = useId();
  const text = ms === null ? '--:--:--' : formatClock(ms);
  return (
    <div
      className={`segclock segclock--${size}`}
      data-tone={tone}
      role="group"
      aria-labelledby={labelId}
    >
      <div className="segclock__label" id={labelId}>
        {label}
      </div>
      <div className="segclock__face">
        <span className="segclock__ghost" aria-hidden="true">
          88:88:88
        </span>
        <span className="segclock__digits" aria-hidden={ms === null ? true : undefined}>
          {text}
        </span>
        {ms === null && <span className="visually-hidden">not available</span>}
      </div>
      {caption && <div className="segclock__caption">{caption}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  tone = 'neutral',
  icon,
  hint,
  href,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  icon?: IconName;
  hint?: ReactNode;
  href?: string;
}) {
  const content = (
    <>
      <div className="stat__top">
        {icon && <Icon name={icon} size={16} />}
        <span className="stat__label">{label}</span>
      </div>
      <div className="stat__value">{value}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </>
  );
  return href ? (
    <a className="stat" data-tone={tone} href={href}>
      {content}
    </a>
  ) : (
    <div className="stat" data-tone={tone}>
      {content}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {children && <div className="empty__body">{children}</div>}
    </div>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v], i) => (
        <div className="kv__row" key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SimulatedTag({ children = 'Simulated' }: { children?: ReactNode }) {
  return (
    <span className="sim-tag" title="Produced by the local demo adapter. No backend involved.">
      {children}
    </span>
  );
}
