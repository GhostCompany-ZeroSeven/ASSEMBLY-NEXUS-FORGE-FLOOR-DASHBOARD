import { useMemo } from 'react';
import { useUrlState } from '@/app/urlState';
import { ShowMore } from '@/components/ShowMore';
import { Panel } from '@/components/ui';
import { resourceUnavailable } from '@/domain/selectors';
import { WORKER_STATES } from '@/domain/types';
import { FilterBar, FilteredEmpty, SelectFilter } from '@/features/filters/FilterBar';
import {
  activeFilterCount,
  DEFAULT_WORKER_FILTER,
  filterWorkers,
  workerMatchesFlag,
  type WorkerFlag,
} from '@/features/filters/filters';
import { WORKER_SCHEMA } from '@/features/filters/urlSchemas';
import { layoutFloor } from '@/features/forge-floor/layout';
import { useIncremental } from '@/hooks/useIncremental';
import { useI18n } from '@/i18n/useI18n';
import { useConfig, useSnapshot } from '@/store/hooks';
import { WorkerCard } from './WorkerCard';

const FLAGS: WorkerFlag[] = ['all', 'founder', 'blocked', 'active', 'idle', 'failed'];

export function WorkersPage() {
  const snapshot = useSnapshot();
  const { crews, floor } = useConfig();
  const { m } = useI18n();
  const t = m.workers;
  // Filters, sorting and search text live in the URL (?show=&state=&room=&crew=&authority=&sort=&q=).
  const [f, setF] = useUrlState(DEFAULT_WORKER_FILTER, WORKER_SCHEMA);
  const placements = useMemo(() => layoutFloor(snapshot.workers, floor), [snapshot.workers, floor]);
  const workers = filterWorkers(snapshot, f, (w) => placements.get(w.id)?.roomId, m);
  const page = useIncremental(workers, 48);
  const set: typeof setF = (patch, mode) => {
    setF(patch, mode);
    page.reset();
  };
  const visible = new Set(page.visible.map((w) => w.id));
  const flags: WorkerFlag[] =
    snapshot.workers.some((w) => w.state === 'UNKNOWN') || f.flag === 'unknown'
      ? [...FLAGS, 'unknown']
      : FLAGS;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">{t.eyebrow}</div>
          <h1 className="page__title">{t.title}</h1>
        </div>
      </header>
      <FilterBar
        resource="workers"
        query={f.q}
        onQuery={(q) => set({ q }, 'replace')}
        quick={flags.map((x) => ({
          value: x,
          label: t.flag[x],
          count: snapshot.workers.filter((w) => workerMatchesFlag(w, x, snapshot)).length,
        }))}
        quickValue={f.flag}
        onQuick={(flag) => set({ flag })}
        activeCount={activeFilterCount(f, DEFAULT_WORKER_FILTER)}
        onReset={() => set(DEFAULT_WORKER_FILTER)}
        shown={workers.length}
        total={snapshot.workers.length}
        more={
          <>
            <SelectFilter
              label={t.state}
              value={f.state}
              onChange={(state) => set({ state })}
              options={[
                { value: 'all', label: t.anyState },
                ...WORKER_STATES.map((s) => ({ value: s, label: m.status.worker[s] })),
              ]}
            />
            <SelectFilter
              label={t.room}
              value={f.roomId}
              onChange={(roomId) => set({ roomId })}
              options={[
                { value: 'all', label: t.anyRoom },
                ...floor.rooms.map((r) => ({ value: r.id, label: r.label })),
              ]}
            />
            <SelectFilter
              label={t.crew}
              value={f.crewId}
              onChange={(crewId) => set({ crewId })}
              options={[
                { value: 'all', label: t.anyCrew },
                ...crews.map((c) => ({ value: c.id, label: c.label })),
              ]}
            />
            <SelectFilter
              label={t.authority}
              value={f.authority}
              onChange={(authority) => set({ authority })}
              options={[
                { value: 'all', label: m.filters.any },
                { value: 'none', label: t.authorityNone },
                { value: 'granted', label: t.authorityGranted },
              ]}
            />
            <SelectFilter
              label={m.filters.sort}
              value={f.sort}
              onChange={(sort) => set({ sort })}
              options={(['attention', 'name', 'longest-in-state'] as const).map((s) => ({
                value: s,
                label: t.sort[s],
              }))}
            />
          </>
        }
      />

      {workers.length === 0 ? (
        <Panel>
          <FilteredEmpty
            resource="workers"
            total={snapshot.workers.length}
            unavailable={resourceUnavailable(snapshot, 'workers')}
            onReset={() => set(DEFAULT_WORKER_FILTER)}
          />
        </Panel>
      ) : (
        crews.map((crew) => {
          const members = page.visible.filter((w) => w.crewId === crew.id);
          if (members.length === 0 && crew.status !== 'reserved') return null;
          return (
            <Panel
              key={crew.id}
              eyebrow={crew.status === 'reserved' ? t.reservedCrew : t.crewEyebrow}
              title={crew.label}
              actions={crew.motto && <span className="crew-motto">{crew.motto}</span>}
            >
              {members.length === 0 ? (
                <p className="muted">{t.noCrewMatch}</p>
              ) : (
                <div className="worker-grid">
                  {members.map((w) => (
                    <WorkerCard key={w.id} worker={w} />
                  ))}
                </div>
              )}
            </Panel>
          );
        })
      )}
      {/* Workers whose crew is not configured still appear. */}
      {page.visible.some((w) => !crews.some((c) => c.id === w.crewId)) && (
        <Panel title={t.other}>
          <div className="worker-grid">
            {page.visible
              .filter((w) => visible.has(w.id) && !crews.some((c) => c.id === w.crewId))
              .map((w) => (
                <WorkerCard key={w.id} worker={w} />
              ))}
          </div>
        </Panel>
      )}
      <ShowMore hidden={page.hidden} onClick={page.showMore} />
    </div>
  );
}
