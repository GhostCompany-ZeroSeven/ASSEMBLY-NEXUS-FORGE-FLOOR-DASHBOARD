import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { KeyValue, Panel, StatusBadge } from '@/components/ui';
import { WORKER_STATE_META } from '@/domain/status';
import { WORKER_STATES } from '@/domain/types';
import { useConfig, useDashboard, usePreferences } from '@/store/hooks';
import type { Density, MotionPreference } from '@/store/PreferencesProvider';

const yesNo = (b: boolean) => (
  <StatusBadge tone={b ? 'success' : 'muted'} size="sm">
    {b ? 'Yes' : 'No'}
  </StatusBadge>
);

/**
 * Viewer preferences plus a read-only view of the active configuration.
 * Configuration itself lives in code (`src/config/*.config.ts`) so it is
 * reviewable and versioned — see docs/CONFIGURATION.md.
 */
export function SettingsPage() {
  const config = useConfig();
  const prefs = usePreferences();
  const { adapter, snapshot, status } = useDashboard();
  const provenance = snapshot?.provenance ?? adapter.provenance();

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">Configuration</div>
          <h1 className="page__title">Settings</h1>
          <p className="page__lede">
            Preferences are stored in this browser only. Everything else is defined in the dashboard
            config file.
          </p>
        </div>
      </header>

      <div className="grid grid--settings">
        <Panel title="Display">
          <div className="form-grid">
            <label className="select-field">
              <span>Theme</span>
              <select value={prefs.themeId} onChange={(e) => prefs.setThemeId(e.target.value)}>
                {config.themes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>Motion</span>
              <select
                value={prefs.motion}
                onChange={(e) => prefs.setMotion(e.target.value as MotionPreference)}
              >
                <option value="system">Follow system setting</option>
                <option value="reduced">Reduced</option>
                <option value="full">Full</option>
              </select>
            </label>
            <label className="select-field">
              <span>Density</span>
              <select
                value={prefs.density}
                onChange={(e) => prefs.setDensity(e.target.value as Density)}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
          </div>
          <p className="small muted">
            {config.themes.find((t) => t.id === prefs.themeId)?.description} Motion is currently{' '}
            {prefs.reducedMotion ? 'reduced' : 'full'}.
          </p>
        </Panel>

        <Panel title="Data source">
          <KeyValue
            items={[
              ['Adapter', `${adapter.label} (${adapter.id})`],
              ['Mode', provenance.mode.toUpperCase()],
              ['Verified backend', yesNo(provenance.verifiedBackend)],
              ['Connection', status],
              ['Realtime updates', yesNo(adapter.capabilities.realtime)],
              ['Approval delivery', yesNo(adapter.capabilities.approvals)],
              ['Alert acknowledgement', yesNo(adapter.capabilities.alertAcknowledgement)],
              ['Worker messaging', yesNo(adapter.capabilities.messaging)],
            ]}
          />
          {provenance.note && <p className="small muted">{provenance.note}</p>}
        </Panel>

        <Panel title="Governance">
          <KeyValue
            items={[
              ['Human authority', <strong>{config.governance.humanAuthority}</strong>],
              ['Confirmation step', yesNo(config.governance.requireConfirmation)],
              ['Note required for', config.governance.noteRequiredFor.join(', ') || 'none'],
            ]}
          />
          <p className="small muted">
            Workers may hold capabilities but never inherit this authority. The dashboard does not
            grant authority.
          </p>
        </Panel>

        <Panel title="Feature flags">
          <KeyValue
            items={Object.entries(config.features).map(([k, v]) => [k, yesNo(Boolean(v))])}
          />
        </Panel>

        <Panel title="Branding" className="span-2">
          <KeyValue
            items={[
              ['Product', config.branding.productName],
              ['Surface', config.branding.surfaceName],
              ['Monogram', config.branding.monogram],
              ['Tagline', config.branding.tagline ?? '—'],
            ]}
          />
          {config.branding.hierarchy.length > 0 && (
            <ol className="hierarchy hierarchy--large" aria-label="Identity hierarchy">
              {config.branding.hierarchy.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Rooms & state routing" className="span-2">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Room</th>
                <th scope="col">Kind</th>
                <th scope="col">Equipment</th>
              </tr>
            </thead>
            <tbody>
              {config.floor.rooms.map((r) => (
                <tr key={r.id}>
                  <td>{r.label}</td>
                  <td className="mono">{r.kind}</td>
                  <td className="small">{r.equipment.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="subhead">State → room</h3>
          <div className="chips">
            {WORKER_STATES.map((s) => (
              <span key={s} className="chip">
                {WORKER_STATE_META[s].label} → {config.floor.stateRoutes[s]}
              </span>
            ))}
          </div>
        </Panel>

        <Panel title="Characters" className="span-2">
          <p className="small muted">
            Placeholder art is procedural SVG. Replace any entry with an <code>image</code>{' '}
            definition to use production assets — no component changes needed.
          </p>
          <ul className="character-grid">
            {Object.entries(config.characters).map(([id, def]) => (
              <li key={id}>
                <CharacterAvatar characterId={id} state="WORKING" size={48} />
                <span className="mono small">{id}</span>
                <span className="small muted">{def.kind}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Status mapping" className="span-2">
          <p className="small muted">
            How raw backend state strings normalize into dashboard states.
          </p>
          <div className="chips">
            {Object.entries(config.statusMapping).map(([raw, s]) => (
              <span key={raw} className="chip">
                <span className="mono">{raw}</span> → {s}
              </span>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
