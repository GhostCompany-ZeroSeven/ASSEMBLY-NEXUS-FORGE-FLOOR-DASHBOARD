import { useMemo } from 'react';
import { flag, idOrAll, oneOf, useUrlState, type Codec, type Schema } from '@/app/urlState';
import { Icon } from '@/components/Icon';
import { Panel } from '@/components/ui';
import { MAX_EVENTS } from '@/domain/snapshot';
import type { EventCategory, EventVia } from '@/domain/events';
import { SelectFilter } from '@/features/filters/FilterBar';
import { useFocusTarget } from '@/hooks/useFocusTarget';
import { useI18n } from '@/i18n/useI18n';
import { useLastView, useNow, useSnapshot } from '@/store/hooks';
import { ActivityStream } from './ActivityStream';

const CATEGORIES: EventCategory[] = ['mission', 'worker', 'review', 'approval', 'alert', 'system'];
const LIMIT = 200;

/** Known categories as one canonical, ordered, comma-separated value (`all` = every category). */
const categoriesCodec: Codec<string> = {
  parse: (raw) => {
    if (raw === undefined) return undefined;
    if (raw === 'all') return 'all';
    const picked = CATEGORIES.filter((c) => raw.split(',').includes(c));
    return picked.length === CATEGORIES.length ? 'all' : picked.join(',');
  },
  format: (v) => v,
};

const RANGES = ['all', '15m', '1h', '6h', '24h', 'last-view'] as const;
type Range = (typeof RANGES)[number];
const RANGE_MS: Partial<Record<Range, number>> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
};
const VIAS = ['all', 'stream', 'poll', 'simulated'] as const;

interface ActivityView {
  cats: string;
  workerId: string;
  missionId: string;
  ticks: boolean;
  range: Range;
  via: (typeof VIAS)[number];
  details: boolean;
}
const DEFAULT_VIEW: ActivityView = {
  cats: 'all',
  workerId: 'all',
  missionId: 'all',
  ticks: false,
  range: 'all',
  via: 'all',
  details: false,
};
const SCHEMA: Schema<ActivityView> = {
  cats: { key: 'cats', codec: categoriesCodec },
  workerId: { key: 'worker', codec: idOrAll },
  missionId: { key: 'mission', codec: idOrAll },
  ticks: { key: 'ticks', codec: flag },
  range: { key: 'range', codec: oneOf(RANGES) },
  via: { key: 'via', codec: oneOf(VIAS) },
  details: { key: 'details', codec: flag },
};

export function ActivityPage() {
  const snapshot = useSnapshot();
  const { m, dateTime } = useI18n();
  const { baseline } = useLastView();
  const nowMs = useNow(30_000);
  const t = m.activity;
  // A deep link to a specific event shows everything so the target is present.
  const [view, set] = useUrlState(DEFAULT_VIEW, SCHEMA);
  useFocusTarget();
  const active = view.cats === 'all' ? CATEGORIES : (view.cats.split(',') as EventCategory[]);
  const lowSignal = view.ticks || window.location.hash.includes('focus=');

  const toggle = (c: EventCategory) => {
    const next = active.includes(c) ? active.filter((x) => x !== c) : [...active, c];
    const canonical = CATEGORIES.filter((x) => next.includes(x));
    set({ cats: canonical.length === CATEGORIES.length ? 'all' : canonical.join(',') });
  };
  const workers = useMemo(
    () => [...new Set(snapshot.events.map((e) => e.workerId).filter(Boolean))] as string[],
    [snapshot.events],
  );
  const missions = useMemo(
    () => [...new Set(snapshot.events.map((e) => e.missionId).filter(Boolean))].sort() as string[],
    [snapshot.events],
  );
  const filtered = (Object.keys(DEFAULT_VIEW) as (keyof ActivityView)[]).some(
    (k) => view[k] !== DEFAULT_VIEW[k],
  );
  // Time range applies to EVENT time. "Since my last view" needs a recorded view.
  const lastViewMissing = view.range === 'last-view' && !baseline;
  const since =
    view.range === 'last-view'
      ? baseline?.at
      : RANGE_MS[view.range] !== undefined
        ? new Date(nowMs - RANGE_MS[view.range]!).toISOString()
        : undefined;
  const oldest = snapshot.events.reduce<string | undefined>(
    (min, e) => (min === undefined || e.at < min ? e.at : min),
    undefined,
  );

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">{t.eyebrow}</div>
          <h1 className="page__title">{t.title}</h1>
        </div>
        <div className="filters" role="group" aria-label={t.categories}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className="filter-chip"
              data-category={c}
              aria-pressed={active.includes(c)}
              onClick={() => toggle(c)}
            >
              {m.status.category[c]}
            </button>
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={lowSignal}
              onChange={(e) => set({ ticks: e.target.checked })}
            />
            {t.progressTicks}
          </label>
        </div>
      </header>
      <div className="filterbar__row activity-filters">
        <SelectFilter
          label={t.worker}
          value={view.workerId}
          onChange={(workerId) => set({ workerId })}
          options={[
            { value: 'all', label: t.anyWorker },
            ...workers.map((id) => ({
              value: id,
              label: snapshot.workers.find((w) => w.id === id)?.name ?? id,
            })),
          ]}
        />
        <SelectFilter
          label={t.mission}
          value={view.missionId}
          onChange={(missionId) => set({ missionId })}
          options={[
            { value: 'all', label: t.anyMission },
            ...missions.map((id) => ({ value: id, label: id })),
          ]}
        />
        <SelectFilter
          label={t.range}
          value={view.range}
          onChange={(range) => set({ range: range as Range })}
          options={RANGES.map((r) => ({ value: r, label: t.rangeOption[r] }))}
        />
        <SelectFilter
          label={t.viaFilter}
          value={view.via}
          onChange={(via) => set({ via: via as ActivityView['via'] })}
          options={VIAS.map((v) => ({
            value: v,
            label: v === 'all' ? t.anyVia : t.viaOption[v],
          }))}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={view.details}
            onChange={(e) => set({ details: e.target.checked })}
          />
          {t.details}
        </label>
        {filtered && (
          <button type="button" className="btn btn--ghost" onClick={() => set(DEFAULT_VIEW)}>
            <Icon name="reset" size={13} /> {t.reset}
          </button>
        )}
      </div>
      <Panel>
        {lastViewMissing && (
          <p className="brief__warning" role="note">
            {t.noLastView}
          </p>
        )}
        <ActivityStream
          filter={{
            categories: active,
            includeLowSignal: lowSignal,
            workerId: view.workerId === 'all' ? undefined : view.workerId,
            missionId: view.missionId === 'all' ? undefined : view.missionId,
            since,
            via: view.via === 'all' ? undefined : (view.via as EventVia),
          }}
          limit={LIMIT}
          showNow
          details={view.details}
        />
        <p className="small muted">{t.bounded(LIMIT, MAX_EVENTS)}</p>
        {oldest && <p className="small muted">{t.retained(dateTime(oldest))}</p>}
        {snapshot.events.length >= MAX_EVENTS && (
          <p className="small muted">{t.atCapacity(MAX_EVENTS)}</p>
        )}
      </Panel>
    </div>
  );
}
