import type { ReactNode } from 'react';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { KeyValue, Panel, StatusBadge } from '@/components/ui';
import type { TransportDiagnostics } from '@/adapters/types';
import { selectFreshness } from '@/domain/freshness';
import { WORKER_STATES } from '@/domain/types';
import { useFocusTarget } from '@/hooks/useFocusTarget';
import { LOCALE_NAMES, SUPPORTED_LOCALES, isLocalePreference } from '@/i18n/locales';
import { useI18n } from '@/i18n/useI18n';
import { useConfig, useDashboard, useNow, usePreferences } from '@/store/hooks';
import type { Density, MotionPreference } from '@/store/PreferencesProvider';

/**
 * Viewer preferences, truthful transport diagnostics, and a read-only view of
 * the active configuration. Configuration itself lives in code
 * (`src/config/*.config.ts`) so it is reviewable and versioned.
 */
export function SettingsPage() {
  const config = useConfig();
  const prefs = usePreferences();
  const i18n = useI18n();
  const { m } = i18n;
  const t = m.settings;
  const { adapter, snapshot, status } = useDashboard();
  const provenance = snapshot?.provenance ?? adapter.provenance();
  useFocusTarget();
  const yesNo = (b: boolean) => (
    <StatusBadge tone={b ? 'success' : 'muted'} size="sm">
      {b ? m.common.yes : m.common.no}
    </StatusBadge>
  );

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">{t.eyebrow}</div>
          <h1 className="page__title">{t.title}</h1>
          <p className="page__lede">{t.lede}</p>
        </div>
      </header>

      <div className="grid grid--settings">
        <Panel title={t.display}>
          <div className="form-grid">
            <label className="select-field">
              <span>{t.language}</span>
              <select
                value={i18n.preference}
                onChange={(e) => {
                  // Only known values are accepted; anything else is ignored.
                  if (isLocalePreference(e.target.value)) i18n.setPreference(e.target.value);
                }}
              >
                <option value="auto">{t.languageAuto(LOCALE_NAMES[i18n.browserLocale])}</option>
                {SUPPORTED_LOCALES.map((l) => (
                  <option key={l} value={l} lang={l}>
                    {LOCALE_NAMES[l]}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>{t.theme}</span>
              <select value={prefs.themeId} onChange={(e) => prefs.setThemeId(e.target.value)}>
                {config.themes.map((th) => (
                  <option key={th.id} value={th.id}>
                    {th.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>{t.motion}</span>
              <select
                value={prefs.motion}
                onChange={(e) => prefs.setMotion(e.target.value as MotionPreference)}
              >
                <option value="system">{t.motionSystem}</option>
                <option value="reduced">{t.motionReduced}</option>
                <option value="full">{t.motionFull}</option>
              </select>
            </label>
            <label className="select-field">
              <span>{t.density}</span>
              <select
                value={prefs.density}
                onChange={(e) => prefs.setDensity(e.target.value as Density)}
              >
                <option value="comfortable">{t.comfortable}</option>
                <option value="compact">{t.compact}</option>
              </select>
            </label>
          </div>
          <p className="small muted">
            {config.themes.find((th) => th.id === prefs.themeId)?.description}
            {t.motionNow(prefs.reducedMotion)}
          </p>
        </Panel>

        <TransportPanel diagnostics={adapter.diagnostics?.()} />

        <Panel title={t.dataSource}>
          <KeyValue
            items={[
              [t.adapter, `${adapter.label} (${adapter.id})`],
              [t.mode, m.provenance.mode[provenance.mode]],
              [t.verified, yesNo(provenance.verifiedBackend)],
              [t.connection, m.connection[status] ?? status],
              [t.realtime, yesNo(adapter.capabilities.realtime)],
              [t.approvalDelivery, yesNo(adapter.capabilities.approvals)],
              [t.alertAck, yesNo(adapter.capabilities.alertAcknowledgement)],
              [t.messaging, yesNo(adapter.capabilities.messaging)],
            ]}
          />
          {provenance.note && <p className="small muted">{provenance.note}</p>}
        </Panel>

        <Panel title={t.governance}>
          <KeyValue
            items={[
              [t.humanAuthority, <strong>{config.governance.humanAuthority}</strong>],
              [t.confirmation, yesNo(config.governance.requireConfirmation)],
              [
                t.noteRequired,
                config.governance.noteRequiredFor.map((d) => m.decision.label[d]).join(', ') ||
                  m.common.none,
              ],
            ]}
          />
          <p className="small muted">{t.governanceNote}</p>
        </Panel>

        <Panel title={t.flags}>
          <KeyValue
            items={Object.entries(config.features).map(([k, v]) => [
              <span className="mono">{k}</span>,
              yesNo(Boolean(v)),
            ])}
          />
        </Panel>

        <Panel title={t.branding} className="span-2">
          <KeyValue
            items={[
              [t.product, config.branding.productName],
              [t.surface, config.branding.surfaceName],
              [t.monogram, config.branding.monogram],
              [t.tagline, config.branding.tagline ?? '—'],
            ]}
          />
          {config.branding.hierarchy.length > 0 && (
            <ol className="hierarchy hierarchy--large" aria-label={m.nav.identityHierarchy}>
              {config.branding.hierarchy.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title={t.rooms} className="span-2">
          <div className="table-scroll" tabIndex={0} role="region" aria-label={t.rooms}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t.room}</th>
                  <th scope="col">{t.kind}</th>
                  <th scope="col">{t.equipment}</th>
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
          </div>
          <h3 className="subhead">{t.stateRoom}</h3>
          <div className="chips">
            {WORKER_STATES.map((s) => (
              <span key={s} className="chip">
                {m.status.worker[s]}: <span className="mono">{config.floor.stateRoutes[s]}</span>
              </span>
            ))}
          </div>
        </Panel>

        <Panel title={t.characters} className="span-2">
          <p className="small muted">{t.charactersNote}</p>
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

        <Panel title={t.mapping} className="span-2">
          <p className="small muted">{t.mappingNote}</p>
          <div className="chips">
            {Object.entries(config.statusMapping).map(([raw, s]) => (
              <span key={raw} className="chip">
                <span className="mono">{raw}</span>: {m.status.worker[s]}
              </span>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/**
 * Truthful transport diagnostics. Every value comes from the adapter; anything
 * it does not report shows as UNKNOWN rather than a guess.
 */
function TransportPanel({ diagnostics: d }: { diagnostics: TransportDiagnostics | undefined }) {
  const { m, rel } = useI18n();
  const t = m.settings;
  const { snapshot, status } = useDashboard();
  const now = useNow(5000);
  const unknown = <span className="muted">{t.unknown}</span>;
  const time = (iso: string | undefined, known: boolean): ReactNode =>
    iso ? (
      <time dateTime={iso} title={iso}>
        {rel(iso, now)}
      </time>
    ) : known ? (
      t.never
    ) : (
      unknown
    );
  const secs = (ms: number | undefined) =>
    ms === undefined ? unknown : t.seconds(Math.round(ms / 1000));
  const freshness = snapshot ? selectFreshness(snapshot, status, now) : undefined;
  const simulated = d?.configured === 'simulated';
  const streamConfigured = d?.configured === 'polling+stream';
  const na = <span className="muted">{t.notApplicable}</span>;

  const rows: [ReactNode, ReactNode][] = [
    [
      t.freshness,
      freshness ? (
        <span className="chips">
          <span className="chip" data-freshness-source={freshness.source}>
            {freshness.source === 'SIMULATED'
              ? m.provenance.mode.demo
              : m.provenance.mode[
                  freshness.source.toLowerCase() as 'live' | 'disconnected' | 'replay'
                ]}
          </span>
          {freshness.qualifiers.map((q) => (
            <span key={q} className="chip" data-freshness-qualifier={q}>
              {m.provenance.qualifier[q]}
            </span>
          ))}
          {!simulated && (
            <span className="chip" data-complete={freshness.complete}>
              {freshness.complete ? t.complete : t.incomplete}
            </span>
          )}
        </span>
      ) : (
        unknown
      ),
    ],
    [t.connectionState, m.connection[status] ?? status],
    [t.configured, d ? t.configuredValue[d.configured] : unknown],
    [t.active, d ? <strong>{t.activeValue[d.active]}</strong> : unknown],
  ];
  if (!simulated) {
    rows.push(
      [
        t.fallback,
        !d ? unknown : d.active === 'polling-fallback' ? t.fallbackActive : t.fallbackNone,
      ],
      [t.streamState, !d ? unknown : d.streamState ? t.streamStateValue[d.streamState] : unknown],
      [t.attempts, !streamConfigured ? na : (d?.streamAttempts ?? unknown)],
      [t.lastMessage, !streamConfigured ? na : time(d?.lastStreamMessageAt, true)],
      [t.lastEvent, !streamConfigured ? na : time(d?.lastStreamEventAt, true)],
      [t.rejected, !streamConfigured ? na : (d?.rejectedStreamMessages ?? unknown)],
      [t.lastVerified, time(d?.lastRestVerificationAt, d !== undefined)],
      [t.lastAttempt, time(d?.lastRestAttemptAt, d !== undefined)],
      [t.lastSync, time(snapshot?.quality.lastSuccessfulSyncAt, true)],
      [t.staleAfter, secs(snapshot?.quality.staleAfterMs)],
      [t.pollInterval, secs(d?.pollIntervalMs)],
      [t.resyncInterval, !streamConfigured ? na : secs(d?.resyncIntervalMs)],
      [t.heartbeat, !streamConfigured ? na : secs(d?.heartbeatTimeoutMs)],
      [t.maxRetries, !streamConfigured ? na : (d?.maxRetries ?? unknown)],
    );
  }

  return (
    <Panel title={t.transport} id="transport" focusId="transport" className="span-2">
      <p className="small muted">{t.transportNote}</p>
      <KeyValue items={rows} />
      {streamConfigured && <p className="small muted">{t.resyncNote}</p>}
    </Panel>
  );
}
