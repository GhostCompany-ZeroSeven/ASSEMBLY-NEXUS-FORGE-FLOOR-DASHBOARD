import { useMemo } from 'react';
import { flag, idOrAll, useUrlState, type Codec, type Schema } from '@/app/urlState';
import { Icon } from '@/components/Icon';
import { Panel } from '@/components/ui';
import { MAX_EVENTS } from '@/domain/snapshot';
import type { EventCategory } from '@/domain/events';
import { SelectFilter } from '@/features/filters/FilterBar';
import { useFocusTarget } from '@/hooks/useFocusTarget';
import { useI18n } from '@/i18n/useI18n';
import { useSnapshot } from '@/store/hooks';
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

interface ActivityView {
  cats: string;
  workerId: string;
  missionId: string;
  ticks: boolean;
}
const DEFAULT_VIEW: ActivityView = { cats: 'all', workerId: 'all', missionId: 'all', ticks: false };
const SCHEMA: Schema<ActivityView> = {
  cats: { key: 'cats', codec: categoriesCodec },
  workerId: { key: 'worker', codec: idOrAll },
  missionId: { key: 'mission', codec: idOrAll },
  ticks: { key: 'ticks', codec: flag },
};

export function ActivityPage() {
  const snapshot = useSnapshot();
  const { m } = useI18n();
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
  const filtered =
    view.cats !== 'all' || view.workerId !== 'all' || view.missionId !== 'all' || view.ticks;

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
        {filtered && (
          <button type="button" className="btn btn--ghost" onClick={() => set(DEFAULT_VIEW)}>
            <Icon name="reset" size={13} /> {t.reset}
          </button>
        )}
      </div>
      <Panel>
        <ActivityStream
          filter={{
            categories: active,
            includeLowSignal: lowSignal,
            workerId: view.workerId === 'all' ? undefined : view.workerId,
            missionId: view.missionId === 'all' ? undefined : view.missionId,
          }}
          limit={LIMIT}
        />
        <p className="small muted">{t.bounded(LIMIT, MAX_EVENTS)}</p>
      </Panel>
    </div>
  );
}
