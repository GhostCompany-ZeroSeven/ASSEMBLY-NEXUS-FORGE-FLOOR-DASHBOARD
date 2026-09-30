import { Dialog } from '@/components/Dialog';
import { usePreferences } from '@/store/hooks';
import { GO_KEYS } from './commands';

/** In-app keyboard reference. Also lets users turn single-key shortcuts off (WCAG 2.1.4). */
export function ShortcutsDialog({
  onClose,
  hasSimulation,
}: {
  onClose: () => void;
  hasSimulation: boolean;
}) {
  const prefs = usePreferences();
  const single = prefs.singleKeyShortcuts;
  const rows: [string, string, boolean][] = [
    ['Ctrl + K  /  ⌘ + K', 'Open command palette', true],
    ['/', 'Open command palette (search)', false],
    ['?', 'Show this keyboard reference', false],
    ...GO_KEYS.map((g): [string, string, boolean] => [
      `G then ${g.key.toUpperCase()}`,
      `Go to ${g.label}`,
      false,
    ]),
    ...(hasSimulation
      ? ([
          ['P', 'Pause / resume demo simulation', false],
          ['N', 'Advance demo simulation one step', false],
        ] as [string, string, boolean][])
      : []),
    ['Esc', 'Close dialog · leave worker focus view', true],
    ['Tab / Shift + Tab', 'Move between controls', true],
  ];
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} className="shortcuts">
      <table className="table shortcuts__table">
        <caption className="visually-hidden">Keyboard shortcuts</caption>
        <thead>
          <tr>
            <th scope="col">Keys</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([keys, action, always]) => (
            <tr key={keys} data-disabled={!always && !single ? true : undefined}>
              <td>
                <kbd>{keys}</kbd>
              </td>
              <td>
                {action}
                {!always && !single && <span className="muted small"> (off)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <label className="check shortcuts__toggle">
        <input
          type="checkbox"
          checked={single}
          onChange={(e) => prefs.setSingleKeyShortcuts(e.target.checked)}
        />
        Enable single-key shortcuts (can conflict with speech input or other assistive tech)
      </label>
      <p className="small muted">
        Shortcuts are ignored while typing in a field and never use browser or OS chords apart from
        Ctrl/⌘ + K.
      </p>
    </Dialog>
  );
}
