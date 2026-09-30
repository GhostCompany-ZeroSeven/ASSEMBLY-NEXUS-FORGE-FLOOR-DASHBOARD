import { useId, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { useI18n } from '@/i18n/useI18n';

/** Filterable list surfaces (also the keys of their localized filter copy). */
export type FilterResource = 'missions' | 'workers' | 'approvals' | 'alerts';

export interface QuickFilter<V extends string> {
  value: V;
  label: string;
  count?: number;
}

/**
 * Shared filter bar with progressive disclosure:
 * - always visible: text filter, quick filters (radio group) and result count;
 * - "More filters" (native <details>) reveals selects and sorting;
 * - "Reset" only when something is active.
 * Everything is native form controls, so it works fully by keyboard.
 */
export function FilterBar<V extends string>({
  resource,
  query,
  onQuery,
  quick,
  quickValue,
  onQuick,
  more,
  activeCount,
  onReset,
  shown,
  total,
}: {
  resource: FilterResource;
  query: string;
  onQuery: (q: string) => void;
  quick?: QuickFilter<V>[];
  quickValue?: V;
  onQuick?: (v: V) => void;
  more?: ReactNode;
  activeCount: number;
  onReset: () => void;
  shown: number;
  total: number;
}) {
  const inputId = useId();
  const f = useI18n().m.filters;
  const label = f.label[resource];
  return (
    <div className="filterbar" role="search" aria-label={label}>
      <div className="filterbar__row">
        <label className="filterbar__search" htmlFor={inputId}>
          <Icon name="command" size={14} />
          <span className="visually-hidden">{label}</span>
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={f.filterPlaceholder[resource]}
            autoComplete="off"
          />
        </label>
        {quick && onQuick && (
          <div className="segmented" role="radiogroup" aria-label={f.quick(label)}>
            {quick.map((q) => (
              <button
                key={q.value}
                type="button"
                role="radio"
                aria-checked={quickValue === q.value}
                className="segmented__item"
                onClick={() => onQuick(q.value)}
              >
                {q.label}
                {q.count !== undefined && <span className="segmented__count">{q.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="filterbar__row filterbar__row--meta">
        {more && (
          <details className="filterbar__more">
            <summary>{f.more}</summary>
            <div className="filterbar__more-body">{more}</div>
          </details>
        )}
        <span className="filterbar__count" role="status" aria-live="polite">
          {f.showing(shown, total)}
        </span>
        {activeCount > 0 && (
          <button type="button" className="btn btn--ghost filterbar__reset" onClick={onReset}>
            <Icon name="reset" size={13} /> {f.reset(activeCount)}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Empty state that distinguishes "your filters hide everything" from
 * "the data source has nothing".
 */
export function FilteredEmpty({
  resource,
  total,
  onReset,
  unavailable = false,
}: {
  resource: FilterResource;
  total: number;
  onReset: () => void;
  /** The latest fetch of this resource failed: an empty list is NOT "zero". */
  unavailable?: boolean;
}) {
  const f = useI18n().m.filters;
  if (total === 0 && unavailable) {
    return (
      <div className="empty" data-empty="unavailable" role="status">
        <div className="empty__title">{f.unavailableTitle[resource]}</div>
        <div className="empty__body">{f.unavailableBody}</div>
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className="empty" data-empty="source">
        <div className="empty__title">{f.sourceEmptyTitle[resource]}</div>
        <div className="empty__body">{f.sourceEmptyBody[resource]}</div>
      </div>
    );
  }
  return (
    <div className="empty" data-empty="filtered">
      <div className="empty__title">{f.filteredTitle[resource]}</div>
      <div className="empty__body">
        {f.filteredBody(total)}{' '}
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          {f.resetPlain}
        </button>
      </div>
    </div>
  );
}

export function SelectFilter<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const f = useI18n().m.filters;
  // A value from the URL that the current data does not contain is shown as
  // such. It is never turned into a real-looking option.
  const shown = options.some((o) => o.value === value)
    ? options
    : [...options, { value, label: f.notInData(value) }];
  return (
    <label className="select-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {shown.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
