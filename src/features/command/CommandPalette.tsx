import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Dialog } from '@/components/Dialog';
import { filterCommands, type Command } from './commands';

/**
 * Command palette (WAI-ARIA combobox + listbox inside a modal dialog).
 * Arrow keys move, Enter runs, Escape closes. Results are announced.
 */
export function CommandPalette({
  commands,
  onClose,
}: {
  commands: Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const statusId = useId();
  const results = useMemo(() => filterCommands(commands, query), [commands, query]);
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
      title="Command palette"
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
        aria-label="Search commands, workers and missions"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={results.length ? optionId(current) : undefined}
        placeholder="Type a command, worker or mission…"
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
        {results.length === 0 ? 'No matching commands' : `${results.length} results`}
      </div>
      <ul id={listId} role="listbox" aria-label="Commands" className="palette__list">
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
            <span className="palette__group">{c.group}</span>
            <span className="palette__title">{c.title}</span>
            {c.hint && <span className="palette__hint">{c.hint}</span>}
            {c.shortcut && <kbd className="palette__kbd">{c.shortcut}</kbd>}
          </li>
        ))}
        {results.length === 0 && <li className="palette__empty">No matching commands</li>}
      </ul>
      <p className="palette__foot small muted">
        <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to run · <kbd>Esc</kbd> to close
      </p>
    </Dialog>
  );
}
