import { Dialog } from '@/components/Dialog';
import { useI18n } from '@/i18n/useI18n';
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
  const { m } = useI18n();
  const t = m.shortcuts;
  const rows: [string, string, boolean][] = [
    [t.ctrlK, t.palette, true],
    ['/', t.paletteSearch, false],
    ['?', t.reference, false],
    ...GO_KEYS.map((g): [string, string, boolean] => [
      t.thenKey(g.key.toUpperCase()),
      t.goTo(m.nav[g.nav]),
      false,
    ]),
    ...(hasSimulation
      ? ([
          ['P', t.pause, false],
          ['N', t.step, false],
        ] as [string, string, boolean][])
      : []),
    ['Esc', t.esc, true],
    ['Tab / Shift + Tab', t.tab, true],
  ];
  return (
    <Dialog title={t.title} onClose={onClose} className="shortcuts">
      <table className="table shortcuts__table">
        <caption className="visually-hidden">{t.title}</caption>
        <thead>
          <tr>
            <th scope="col">{t.keys}</th>
            <th scope="col">{t.action}</th>
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
                {!always && !single && <span className="muted small">{t.off}</span>}
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
        {t.toggle}
      </label>
      <p className="small muted">{t.note}</p>
    </Dialog>
  );
}
