import { useState } from 'react';
import { Panel } from '@/components/ui';
import { ShowMore } from '@/components/ShowMore';
import { resourceUnavailable } from '@/domain/selectors';
import { FilterBar, FilteredEmpty, SelectFilter } from '@/features/filters/FilterBar';
import {
  activeFilterCount,
  DEFAULT_MISSION_FILTER,
  filterMissions,
  missionMatchesGroup,
  type MissionFilter,
  type MissionGroup,
} from '@/features/filters/filters';
import { useIncremental } from '@/hooks/useIncremental';
import { useSnapshot } from '@/store/hooks';
import { MissionCard } from './MissionCard';

const GROUPS: { value: MissionGroup; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'founder', label: 'Awaiting Founder' },
  { value: 'in-flight', label: 'In flight' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'queued', label: 'Queued' },
  { value: 'complete', label: 'Complete' },
  { value: 'failed', label: 'Failed' },
];

export function MissionsPage() {
  const snapshot = useSnapshot();
  const [f, setF] = useState<MissionFilter>(DEFAULT_MISSION_FILTER);
  const missions = filterMissions(snapshot, f);
  const page = useIncremental(missions, 60);
  const set = (patch: Partial<MissionFilter>) => {
    setF((cur) => ({ ...cur, ...patch }));
    page.reset();
  };
  const hasUnknown = snapshot.missions.some((m) => m.status === 'UNKNOWN');
  const groups = hasUnknown
    ? [...GROUPS, { value: 'unknown' as const, label: 'Unknown status' }]
    : GROUPS;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">Mission Control</div>
          <h1 className="page__title">Missions</h1>
        </div>
      </header>
      <FilterBar
        label="Filter missions"
        noun="missions"
        query={f.q}
        onQuery={(q) => set({ q })}
        quick={groups.map((g) => ({
          ...g,
          count: snapshot.missions.filter((m) => missionMatchesGroup(m, g.value, snapshot)).length,
        }))}
        quickValue={f.group}
        onQuick={(group) => set({ group })}
        activeCount={activeFilterCount(f, DEFAULT_MISSION_FILTER)}
        onReset={() => set(DEFAULT_MISSION_FILTER)}
        shown={missions.length}
        total={snapshot.missions.length}
        more={
          <>
            <SelectFilter
              label="Priority"
              value={f.priority}
              onChange={(priority) => set({ priority })}
              options={[
                { value: 'all', label: 'Any priority' },
                { value: 'critical', label: 'Critical' },
                { value: 'high', label: 'High' },
                { value: 'normal', label: 'Normal' },
                { value: 'low', label: 'Low' },
              ]}
            />
            <SelectFilter
              label="Worker"
              value={f.workerId}
              onChange={(workerId) => set({ workerId })}
              options={[
                { value: 'all', label: 'Any worker' },
                ...snapshot.workers.map((w) => ({ value: w.id, label: w.name })),
              ]}
            />
            <SelectFilter
              label="Sort by"
              value={f.sort}
              onChange={(sort) => set({ sort })}
              options={[
                { value: 'status', label: 'Needs attention first' },
                { value: 'priority', label: 'Priority' },
                { value: 'elapsed', label: 'Longest running' },
                { value: 'newest', label: 'Newest' },
                { value: 'id', label: 'Mission id' },
              ]}
            />
          </>
        }
      />
      <Panel>
        {missions.length === 0 ? (
          <FilteredEmpty
            total={snapshot.missions.length}
            unavailable={resourceUnavailable(snapshot, 'missions')}
            noun="missions"
            onReset={() => set(DEFAULT_MISSION_FILTER)}
          />
        ) : (
          <>
            <div className="mission-list">
              {page.visible.map((m) => (
                <MissionCard key={m.id} mission={m} />
              ))}
            </div>
            <ShowMore hidden={page.hidden} onClick={page.showMore} noun="missions" />
          </>
        )}
      </Panel>
    </div>
  );
}
