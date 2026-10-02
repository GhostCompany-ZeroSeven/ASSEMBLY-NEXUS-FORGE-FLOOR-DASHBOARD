import { useEffect, useRef, useState } from 'react';
import { href, replaceHashQuery, useHashQuery, withQuery } from '@/app/router';
import { Icon } from '@/components/Icon';
import { selectFreshness } from '@/domain/freshness';
import { useI18n } from '@/i18n/useI18n';
import { useDashboard, useNow, useSnapshot } from '@/store/hooks';
import {
  buildVisualState,
  CREW_NAMED_STATIONS,
  formatClock,
  PREVIEW_PRESETS,
  ROSTER,
  STAGES,
  type PreviewPreset,
  type StageStatus,
  type StationBinding,
  type VisualState,
} from './model';
import { ForgeScene } from './scene/ForgeScene';
import { SCENE_H, SCENE_W, STATIONS, stationBox, type Station } from './scene/stations';
import '@/styles/visual-floor.css';

/**
 * VISUAL Forge Floor: a presentation/observation layer over the dashboard's
 * own data (the factual pages stay authoritative). The scene is decorative;
 * every state it shows is also stated in text in the HUD panels, with its
 * provenance. Preview presets are labelled as presets, never as data.
 *
 * URL: ?preview=countdown|countdown-critical|accomplished|red-alert,
 * ?mission=<id>, ?station=<id>|mission-board|alerts-board|systems-board.
 */
type Selection = string | null;
const BOARDS = ['mission-board', 'alerts-board', 'systems-board'] as const;

const STAGE_ICON: Record<StageStatus, 'check' | 'activity' | 'clock' | 'x' | 'info' | 'expand'> = {
  done: 'check',
  active: 'activity',
  pending: 'clock',
  blocked: 'x',
  unknown: 'info',
  'not-required': 'expand',
};

export function VisualForgeFloorPage() {
  const snapshot = useSnapshot();
  const { status } = useDashboard();
  const { m, num } = useI18n();
  const t = m.visual;
  const query = useHashQuery();
  const now = useNow(1000);
  const [openedAt] = useState(() => Date.now());
  const preset = (PREVIEW_PRESETS as readonly string[]).includes(query.preview ?? '')
    ? (query.preview as PreviewPreset)
    : undefined;
  const selection: Selection = query.station ?? null;
  const freshness = selectFreshness(snapshot, status, now);
  const v = buildVisualState(snapshot, freshness, status, now, {
    preset,
    missionId: query.mission,
    presetElapsedMs: now - openedAt,
  });
  const detailRef = useRef<HTMLHeadingElement>(null);
  const stageScrollRef = useRef<HTMLDivElement>(null);

  const setQuery = (patch: Record<string, string | undefined>) =>
    replaceHashQuery({
      preview: preset,
      mission: query.mission,
      station: selection ?? undefined,
      ...patch,
    });
  const select = (id: string | null) => setQuery({ station: id ?? undefined });

  useEffect(() => {
    if (selection) detailRef.current?.focus();
  }, [selection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selection) select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const stage = stageScrollRef.current;
    if (
      !stage ||
      typeof window.matchMedia !== 'function' ||
      !window.matchMedia('(max-width: 640px)').matches
    )
      return;
    stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
  }, []);

  return (
    <div className="page vf" data-mode={v.mode} data-source={v.source}>
      <header className="page__header vf__header">
        <div>
          <div className="page__eyebrow">{t.eyebrow}</div>
          <h1 className="page__title">{t.title}</h1>
          <p className="page__lede">{t.lede}</p>
        </div>
        <div className="vf__provenance" role="status">
          <span className="vf__chip" data-provenance={v.provenance}>
            {t.provenance[v.provenance]}
          </span>
          {v.source === 'preset' && (
            <span className="vf__chip vf__chip--preset" data-preset={v.preset}>
              {t.presetBadge}
            </span>
          )}
        </div>
      </header>

      <fieldset className="vf__presets">
        <legend>{t.stateLabel}</legend>
        {(['data', ...PREVIEW_PRESETS] as const).map((p) => (
          <label key={p} className="vf__preset">
            <input
              type="radio"
              name="vf-preset"
              value={p}
              checked={(preset ?? 'data') === p}
              onChange={() => setQuery({ preview: p === 'data' ? undefined : p })}
            />
            <span>{t.preset[p]}</span>
          </label>
        ))}
      </fieldset>

      {v.mode === 'red-alert' && (
        <div className="vf__redalert" role="alert">
          <Icon name="alert" size={18} />
          <strong>{v.source === 'preset' ? t.redAlert.preset : t.redAlert.data}</strong>
        </div>
      )}

      <p className="vf__firewall small">{t.firewall}</p>

      <div className="vf__stage-wrap">
        <div
          className="vf__stage-scroll"
          role="region"
          aria-label={t.sceneLabel}
          tabIndex={0}
          ref={stageScrollRef}
        >
          <div className="vf__canvas" style={{ aspectRatio: `${SCENE_W} / ${SCENE_H}` }}>
            <div className="vf__art" translate="no">
              <ForgeScene mode={v.mode} />
            </div>
            {STATIONS.map((st) => {
              const b = v.stations.find((x) => x.stationId === st.id);
              return (
                <StationHotspot
                  key={st.id}
                  st={st}
                  binding={b}
                  selected={selection === st.id}
                  onSelect={() => select(selection === st.id ? null : st.id)}
                />
              );
            })}
          </div>
        </div>
        <div className="vf__huds">
          <MissionBoard v={v} onDetails={() => select('mission-board')} />
          <AlertsBoard v={v} onDetails={() => select('alerts-board')} />
          <SystemsBoard v={v} onDetails={() => select('systems-board')} />
        </div>
      </div>
      <p className="vf__pan small muted">{t.panHint}</p>

      <div className="vf__below">
        {selection && (
          <section className="vf__panel vf__detail" aria-labelledby="vf-detail-title">
            <div className="vf__panel-head">
              <h2 id="vf-detail-title" tabIndex={-1} ref={detailRef}>
                {t.detail.title}
              </h2>
              <button type="button" className="btn btn--ghost" onClick={() => select(null)}>
                <Icon name="x" size={14} /> {t.detail.close}
              </button>
            </div>
            <Detail selection={selection} v={v} />
          </section>
        )}
        <section className="vf__panel vf__flow" aria-labelledby="vf-flow-title">
          <h2 id="vf-flow-title">{t.flow.title}</h2>
          <ol className="vf__flow-list">
            {v.board.stages.map((s) => (
              <li key={s.key} data-stage={s.key} data-status={s.status}>
                <Icon name={STAGE_ICON[s.status]} size={14} />
                <span className="vf__flow-name">{t.stage[s.key]}</span>
                <span className="vf__flow-status">{t.stageStatus[s.status]}</span>
              </li>
            ))}
          </ol>
          <p className="small muted">{v.source === 'preset' ? t.flow.presetNote : t.flow.note}</p>
        </section>
        <section className="vf__panel vf__roster" aria-labelledby="vf-roster-title">
          <h2 id="vf-roster-title">{t.roster.title}</h2>
          <ul>
            {ROSTER.map((name) => (
              <li key={name} data-presence="UNKNOWN">
                <span translate="no">{name}</span>
                <span className="vf__state" data-state="UNKNOWN">
                  {t.roster.presence}
                </span>
                <span className="muted small">{t.roster.presenceNote}</span>
              </li>
            ))}
            <li>
              <span>{t.roster.forge}</span>
              <span className="vf__state" data-state={v.crew.forge === null ? 'UNKNOWN' : 'DATA'}>
                {v.crew.forge === null ? t.roster.presence : t.roster.inData(num(v.crew.forge))}
              </span>
            </li>
            <li>
              <span>{t.roster.snow}</span>
              <span
                className="vf__state"
                data-state={v.crew.snowWolf === null ? 'UNKNOWN' : 'DATA'}
              >
                {v.crew.snowWolf === null
                  ? t.roster.presence
                  : t.roster.inData(num(v.crew.snowWolf))}
              </span>
            </li>
          </ul>
          <p className="small muted">{t.roster.note}</p>
        </section>
        <section className="vf__panel vf__attention" aria-labelledby="vf-attn-title">
          <h2 id="vf-attn-title">{t.attention.title}</h2>
          {v.attentionIncomplete && <p className="vf__warn">{t.attention.incomplete}</p>}
          {v.attention.length === 0 ? (
            <p className="small">{t.attention.none}</p>
          ) : (
            <ul>
              {v.attention.map((a) => (
                <li key={a.key}>
                  <a href={a.href}>
                    <span className="mono" translate="no">
                      {a.id}
                    </span>{' '}
                    {a.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {v.mode === 'red-alert' && v.source === 'preset' && (
            <p className="small muted">{t.attention.presetNote}</p>
          )}
        </section>
      </div>
    </div>
  );
}

/** Display name of a scene character (its class, persona or generation). */
function useWho(st: Station | undefined): string {
  const { m } = useI18n();
  const t = m.visual.station;
  if (!st) return t.scientist;
  if (st.kind === 'wisp') return t.wisp;
  if (st.kind === 'bandit') return `${t.bandit} · ${t.persona[st.look.persona]}`;
  const base = `${t.scientist} · ${t.at(t.role[st.role])}`;
  return st.look.generation === 'young' ? `${base} (${t.young})` : base;
}

function StationHotspot({
  st,
  binding,
  selected,
  onSelect,
}: {
  st: Station;
  binding: StationBinding | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const { m } = useI18n();
  const t = m.visual.station;
  const id = st.id;
  const box = stationBox(st);
  const who = useWho(st);
  // Visual characters are never bound to factual workers (Phase 11).
  const label = t.decorative(who);
  return (
    <button
      type="button"
      className="vf__hotspot"
      data-station={id}
      data-kind={binding?.kind ?? st.kind}
      data-bound="false"
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      style={{
        left: `${(box.x / SCENE_W) * 100}%`,
        top: `${(box.y / SCENE_H) * 100}%`,
        width: `${(box.w / SCENE_W) * 100}%`,
        height: `${(box.h / SCENE_H) * 100}%`,
      }}
    >
      {st.kind === 'scientist' && (
        <span className="vf__nameplate vf__nameplate--role" aria-hidden="true" data-role={st.role}>
          {t.role[st.role]}
        </span>
      )}
    </button>
  );
}

function BoardHead({ id, title, onDetails }: { id: string; title: string; onDetails: () => void }) {
  const { m } = useI18n();
  return (
    <div className="vf__panel-head">
      <h2 id={id}>{title}</h2>
      <button type="button" className="vf__details-btn" onClick={onDetails}>
        <Icon name="info" size={13} />
        <span>{m.visual.detail.boardDetails}</span>
        <span className="visually-hidden">: {title}</span>
      </button>
    </div>
  );
}

function MissionBoard({ v, onDetails }: { v: VisualState; onDetails: () => void }) {
  const { m } = useI18n();
  const t = m.visual.board;
  const timer = v.board.timer;
  return (
    <section
      className="vf__panel vf__board vf__hud vf__hud--mission"
      aria-labelledby="vf-board-title"
      data-timer={timer.kind}
      data-critical={timer.kind === 'time-left' && timer.critical ? 'true' : undefined}
    >
      <BoardHead id="vf-board-title" title={t.title} onDetails={onDetails} />
      <div className="vf__mission-name">
        {v.source === 'preset' ? (
          <span translate="no">{t.presetMission}</span>
        ) : v.board.missionId ? (
          <a href={href.mission(v.board.missionId)}>
            <span className="mono" translate="no">
              {v.board.missionId}
            </span>{' '}
            {v.board.title}
          </a>
        ) : (
          <span>{t.none}</span>
        )}
      </div>
      {timer.kind === 'done' ? (
        <div className="vf__timer vf__timer--done" role="timer" aria-live="off">
          <span className="vf__timer-label">{t.accomplished}</span>
          <span className="vf__clock mono">00:00:00</span>
          <span className="small">{t.accomplishedNote}</span>
        </div>
      ) : timer.kind === 'unknown' ? (
        <div className="vf__timer" role="timer" aria-live="off" data-unknown="true">
          <span className="vf__timer-label">{t.timeLeft}</span>
          <span className="vf__clock mono">{t.unknownTimer}</span>
          <span className="small">{t.unknownTimerNote}</span>
        </div>
      ) : timer.kind === 'overdue' ? (
        <div className="vf__timer vf__timer--critical" role="timer" aria-live="off">
          <span className="vf__timer-label">{t.overdue}</span>
          <span className="vf__clock mono">{formatClock(timer.ms)}</span>
        </div>
      ) : (
        <div
          className={`vf__timer${timer.critical ? ' vf__timer--critical' : ''}`}
          role="timer"
          aria-live="off"
        >
          <span className="vf__timer-label">
            {t.timeLeft}
            {timer.critical && <strong className="vf__crit"> · {t.critical}</strong>}
          </span>
          <span className="vf__clock mono">{formatClock(timer.ms)}</span>
        </div>
      )}
      <ul className="vf__stages">
        {STAGES.map((key) => {
          const s = v.board.stages.find((x) => x.key === key)!;
          return (
            <li key={key} data-status={s.status}>
              <span>{m.visual.stage[key]}</span>
              <span className="vf__stage-status">
                <Icon name={STAGE_ICON[s.status]} size={12} />
                {m.visual.stageStatus[s.status]}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AlertsBoard({ v, onDetails }: { v: VisualState; onDetails: () => void }) {
  const { m, num } = useI18n();
  const t = m.visual.alerts;
  const rows: [string, number | null, string][] = [
    [t.requiresReview, v.alerts.requiresReview, 'review'],
    [t.blocked, v.alerts.blocked, 'blocked'],
    [t.inProgress, v.alerts.inProgress, 'progress'],
    [t.queued, v.alerts.queued, 'queued'],
  ];
  return (
    <section className="vf__panel vf__hud vf__hud--alerts" aria-labelledby="vf-alerts-title">
      <BoardHead id="vf-alerts-title" title={t.title} onDetails={onDetails} />
      <ul className="vf__alert-rows">
        {rows.map(([label, n, k]) => (
          <li key={k} data-kind={k} data-unknown={n === null ? 'true' : undefined}>
            <span>{label}</span>
            <strong className="mono">{n === null ? t.unknown : num(n)}</strong>
          </li>
        ))}
      </ul>
      <p className="small muted">
        {t.note} <a href={withQuery(href.missions(), {})}>{t.open}</a>
      </p>
    </section>
  );
}

function SystemsBoard({ v, onDetails }: { v: VisualState; onDetails: () => void }) {
  const { m } = useI18n();
  const t = m.visual.systems;
  return (
    <section className="vf__panel vf__hud vf__hud--systems" aria-labelledby="vf-systems-title">
      <BoardHead id="vf-systems-title" title={t.title} onDetails={onDetails} />
      <ul className="vf__systems">
        {v.systems.map((s) => (
          <li key={s.row} data-row={s.row} data-state={s.state}>
            <span className="vf__sys-name" translate="no">
              {t.row[s.row]}
            </span>
            <span className="vf__state" data-state={s.state}>
              {t.state[s.state]}
            </span>
            <span className="vf__sys-basis small muted">{t.basis[s.basis]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const CREW_NAMED: readonly string[] = CREW_NAMED_STATIONS;

function Detail({ selection, v }: { selection: string; v: VisualState }) {
  const { m } = useI18n();
  const t = m.visual.detail;
  const st = STATIONS.find((x) => x.id === selection);
  const who = useWho(st);
  if ((BOARDS as readonly string[]).includes(selection)) {
    const text =
      selection === 'mission-board'
        ? t.missionBoard
        : selection === 'alerts-board'
          ? t.alertsBoard
          : t.systemsBoard;
    return (
      <div>
        <p>{text}</p>
        {selection === 'mission-board' && v.board.missionId && (
          <a className="btn" href={href.mission(v.board.missionId)}>
            {t.openMission}
          </a>
        )}
      </div>
    );
  }
  const b = v.stations.find((x) => x.stationId === selection);
  const crew = st?.kind === 'bandit';
  const named = crew && CREW_NAMED.includes(st.id);
  const scientist = st?.kind === 'scientist';
  return (
    <div>
      <p className="vf__detail-name">
        <strong>{who}</strong>
      </p>
      <p>{b?.kind === 'wisp' ? t.wisp : t.decorative}</p>
      {scientist && <p className="small">{t.stationNote}</p>}
      {named && <p className="small">{t.named}</p>}
      {crew && <p className="small muted">{t.wardrobe}</p>}
      {b?.kind !== 'wisp' && (
        <a className="btn" href={href.workers()}>
          {t.openWorkers}
        </a>
      )}
    </div>
  );
}
