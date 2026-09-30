import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Dialog } from '@/components/Dialog';
import { useI18n } from '@/i18n/useI18n';
import { filterCommands, type Command } from './commands';

/**
 * Command palette (WAI-ARIA combobox + listbox inside a modal dialog).
 * Arrow keys move, Enter runs, Escape closes. Results are announced.
 */
export function CommandPalette({
  commands,
  search,
  onClose,
}: {
  commands: Command[];
  /** Entity search (missions, workers, rooms, alerts, gates, artifacts, events). */
  search?: (query: string) => Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const statusId = useId();
  const { m } = useI18n();
  const p = m.palette;
  const results = useMemo(() => {
    const cmds = filterCommands(commands, query, query.trim() ? 6 : 50);
    return query.trim() && search ? [...cmds, ...search(query)] : cmds;
  }, [commands, search, query]);
  const current = Math.min(active, Math.max(0, results.length - 1));

  const run = (cmd: Command | undefined) => {
    if (!cmd) return;
    onClose();
    // Run after the dialog has unmounted so focus restoration does not fight navigation.
    queueMicrotask(cmd.run);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const last = results.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive(current >= last ? 0 : current + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive(current <= 0 ? last : current - 1);
        break;
      case 'Home':
        if (e.ctrlKey) {
          e.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (e.ctrlKey) {
          e.preventDefault();
          setActive(last);
        }
        break;
      case 'Enter':
        e.preventDefault();
        run(results[current]);
        break;
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <Dialog
      title={p.title}
      onClose={onClose}
      initialFocusRef={inputRef}
      className="palette"
      describedBy={statusId}
    >
      <input
        ref={inputRef}
        className="palette__input"
        type="text"
        role="combobox"
        aria-label={p.input}
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={results.length ? optionId(current) : undefined}
        placeholder={p.placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      <div id={statusId} className="visually-hidden" role="status" aria-live="polite">
        {results.length === 0 ? p.none : p.count(results.length)}
      </div>
      <ul id={listId} role="listbox" aria-label={p.list} className="palette__list">
        {results.map((c, i) => (
          <li
            key={c.id}
            id={optionId(i)}
            role="option"
            aria-selected={i === current}
            className="palette__item"
            onMouseMove={() => setActive(i)}
            onClick={() => run(c)}
          >
            <span className="palette__group">{c.result ? c.result.type : p.group[c.group]}</span>
            <span className="palette__title">{c.title}</span>
            {c.result ? (
              <span className="palette__hint">
                {c.result.provenance && (
                  <>
                    <span className="palette__prov">{c.result.provenance}</span> ·{' '}
                  </>
                )}
                <span className="palette__status">{c.result.status}</span> ·{' '}
                {p.opens(c.result.surface)}
                {c.result.context && <> · {c.result.context}</>}
              </span>
            ) : (
              c.hint && <span className="palette__hint">{c.hint}</span>
            )}
            {c.shortcut && <kbd className="palette__kbd">{c.shortcut}</kbd>}
          </li>
        ))}
        {results.length === 0 && <li className="palette__empty">{p.none}</li>}
      </ul>
      <p className="palette__foot small muted">
        <kbd>↑</kbd> <kbd>↓</kbd> {p.move} · <kbd>Enter</kbd> {p.run} · <kbd>Esc</kbd> {p.close}
      </p>
    </Dialog>
  );
}
