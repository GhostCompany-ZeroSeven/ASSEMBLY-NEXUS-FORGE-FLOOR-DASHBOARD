import { useMemo, useState } from 'react';
import { ShowMore } from '@/components/ShowMore';
import { Panel } from '@/components/ui';
import { resourceUnavailable } from '@/domain/selectors';
import { WORKER_STATE_META } from '@/domain/status';
import { WORKER_STATES } from '@/domain/types';
import { FilterBar, FilteredEmpty, SelectFilter } from '@/features/filters/FilterBar';
import {
  activeFilterCount,
  DEFAULT_WORKER_FILTER,
  filterWorkers,
  workerMatchesFlag,
  type WorkerFilter,
  type WorkerFlag,
} from '@/features/filters/filters';
import { layoutFloor } from '@/features/forge-floor/layout';
import { useIncremental } from '@/hooks/useIncremental';
import { useConfig, useSnapshot } from '@/store/hooks';
import { WorkerCard } from './WorkerCard';

const FLAGS: { value: WorkerFlag; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'founder', label: 'Waiting for Founder' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'active', label: 'Active' },
  { value: 'idle', label: 'Idle / done' },
  { value: 'failed', label: 'Failed / stopped' },
];

export function WorkersPage() {
  const snapshot = useSnapshot();
  const { crews, floor } = useConfig();
  const [f, setF] = useState<WorkerFilter>(DEFAULT_WORKER_FILTER);
  const placements = useMemo(() => layoutFloor(snapshot.workers, floor), [snapshot.workers, floor]);
  const workers = filterWorkers(snapshot, f, (w) => placements.get(w.id)?.roomId);
  const page = useIncremental(workers, 48);
  const set = (patch: Partial<WorkerFilter>) => {
    setF((cur) => ({ ...cur, ...patch }));
    page.reset();
  };
  const visible = new Set(page.visible.map((w) => w.id));
  const flags = snapshot.workers.some((w) => w.state === 'UNKNOWN')
    ? [...FLAGS, { value: 'unknown' as const, label: 'Unknown state' }]
    : FLAGS;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">Crew roster</div>
          <h1 className="page__title">Workers</h1>
        </div>
      </header>
      <FilterBar
        label="Filter workers"
        noun="workers"
        query={f.q}
        onQuery={(q) => set({ q })}
        quick={flags.map((x) => ({
          ...x,
          count: snapshot.workers.filter((w) => workerMatchesFlag(w, x.value, snapshot)).length,
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
              label="State"
              value={f.state}
              onChange={(state) => set({ state })}
              options={[
                { value: 'all', label: 'Any state' },
                ...WORKER_STATES.map((s) => ({ value: s, label: WORKER_STATE_META[s].label })),
              ]}
            />
            <SelectFilter
              label="Room"
              value={f.roomId}
              onChange={(roomId) => set({ roomId })}
              options={[
                { value: 'all', label: 'Any room' },
                ...floor.rooms.map((r) => ({ value: r.id, label: r.label })),
              ]}
            />
            <SelectFilter
              label="Crew"
              value={f.crewId}
              onChange={(crewId) => set({ crewId })}
              options={[
                { value: 'all', label: 'Any crew' },
                ...crews.map((c) => ({ value: c.id, label: c.label })),
              ]}
            />
            <SelectFilter
              label="Authority"
              value={f.authority}
              onChange={(authority) => set({ authority })}
              options={[
                { value: 'all', label: 'Any' },
                { value: 'none', label: 'No authority granted' },
                { value: 'granted', label: 'Has human-granted authority' },
              ]}
            />
            <SelectFilter
              label="Sort"
              value={f.sort}
              onChange={(sort) => set({ sort })}
              options={[
                { value: 'attention', label: 'Needs attention first' },
                { value: 'name', label: 'Name' },
                { value: 'longest-in-state', label: 'Longest in current state' },
              ]}
            />
          </>
        }
      />

      {workers.length === 0 ? (
        <Panel>
          <FilteredEmpty
            total={snapshot.workers.length}
            unavailable={resourceUnavailable(snapshot, 'workers')}
            noun="workers"
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
              eyebrow={crew.status === 'reserved' ? 'Reserved crew' : 'Crew'}
              title={crew.label}
              actions={crew.motto && <span className="crew-motto">{crew.motto}</span>}
            >
              {members.length === 0 ? (
                <p className="muted">No workers from this crew match the current filters.</p>
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
        <Panel title="Other workers">
          <div className="worker-grid">
            {page.visible
              .filter((w) => visible.has(w.id) && !crews.some((c) => c.id === w.crewId))
              .map((w) => (
                <WorkerCard key={w.id} worker={w} />
              ))}
          </div>
        </Panel>
      )}
      <ShowMore hidden={page.hidden} onClick={page.showMore} noun="workers" />
    </div>
  );
}
