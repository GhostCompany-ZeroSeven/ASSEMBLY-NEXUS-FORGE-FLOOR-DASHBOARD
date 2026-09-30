import { useId, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';

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
  label,
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
  noun,
}: {
  label: string;
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
  noun: string;
}) {
  const inputId = useId();
  return (
    <div className="filterbar" role="search" aria-label={label}>
      <div className="filterbar__row">
        <label className="filterbar__search" htmlFor={inputId}>
          <Icon name="command" size={14} />
          <span className="visually-hidden">Filter {noun}</span>
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={`Filter ${noun}…`}
            autoComplete="off"
          />
        </label>
        {quick && onQuick && (
          <div className="segmented" role="radiogroup" aria-label={`${label}: quick filter`}>
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
            <summary>More filters &amp; sorting</summary>
            <div className="filterbar__more-body">{more}</div>
          </details>
        )}
        <span className="filterbar__count" role="status" aria-live="polite">
          Showing {shown} of {total} {noun}
        </span>
        {activeCount > 0 && (
          <button type="button" className="btn btn--ghost filterbar__reset" onClick={onReset}>
            <Icon name="reset" size={13} /> Reset filters ({activeCount})
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
  total,
  noun,
  onReset,
  sourceEmptyText,
}: {
  total: number;
  noun: string;
  onReset: () => void;
  sourceEmptyText?: string;
}) {
  if (total === 0) {
    return (
      <div className="empty" data-empty="source">
        <div className="empty__title">No {noun} from the data source</div>
        <div className="empty__body">
          {sourceEmptyText ?? `The data source currently reports zero ${noun}.`}
        </div>
      </div>
    );
  }
  return (
    <div className="empty" data-empty="filtered">
      <div className="empty__title">No {noun} match these filters</div>
      <div className="empty__body">
        {total} {noun} are hidden by the current filters.{' '}
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          Reset filters
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
  return (
    <label className="select-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
