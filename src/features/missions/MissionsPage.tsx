import { Panel } from '@/components/ui';
import { ShowMore } from '@/components/ShowMore';
import { useUrlState } from '@/app/urlState';
import { resourceUnavailable } from '@/domain/selectors';
import { FilterBar, FilteredEmpty, SelectFilter } from '@/features/filters/FilterBar';
import {
  activeFilterCount,
  DEFAULT_MISSION_FILTER,
  filterMissions,
  missionMatchesGroup,
  type MissionGroup,
} from '@/features/filters/filters';
import { MISSION_SCHEMA } from '@/features/filters/urlSchemas';
import { useIncremental } from '@/hooks/useIncremental';
import { cap } from '@/i18n/format';
import { useI18n } from '@/i18n/useI18n';
import { useSnapshot } from '@/store/hooks';
import { MissionCard } from './MissionCard';
import { useMissionMarkers } from './useMissionMarkers';

const GROUPS: MissionGroup[] = [
  'all',
  'founder',
  'review',
  'in-flight',
  'blocked',
  'queued',
  'complete',
  'failed',
];

export function MissionsPage() {
  const snapshot = useSnapshot();
  const { m } = useI18n();
  const t = m.missions;
  // Filters, sorting and search text live in the URL (?group=&priority=&worker=&sort=&q=).
  const [f, setF] = useUrlState(DEFAULT_MISSION_FILTER, MISSION_SCHEMA);
  const intel = useMissionMarkers();
  const missions = filterMissions(snapshot, f, undefined, m, intel);
  const page = useIncremental(missions, 60);
  const set: typeof setF = (patch, mode) => {
    setF(patch, mode);
    page.reset();
  };
  const hasUnknown = snapshot.missions.some((x) => x.status === 'UNKNOWN');
  const groups: MissionGroup[] =
    hasUnknown || f.group === 'unknown' ? [...GROUPS, 'unknown'] : GROUPS;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">{t.eyebrow}</div>
          <h1 className="page__title">{t.title}</h1>
        </div>
      </header>
      <FilterBar
        resource="missions"
        query={f.q}
        onQuery={(q) => set({ q }, 'replace')}
        quick={groups.map((g) => ({
          value: g,
          label: t.group[g],
          count: snapshot.missions.filter((x) => missionMatchesGroup(x, g, snapshot)).length,
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
              label={t.priority}
              value={f.priority}
              onChange={(priority) => set({ priority })}
              options={[
                { value: 'all', label: t.anyPriority },
                ...(['critical', 'high', 'normal', 'low'] as const).map((p) => ({
                  value: p,
                  label: cap(m.status.priority[p]),
                })),
              ]}
            />
            <SelectFilter
              label={t.worker}
              value={f.workerId}
              onChange={(workerId) => set({ workerId })}
              options={[
                { value: 'all', label: t.anyWorker },
                ...snapshot.workers.map((w) => ({ value: w.id, label: w.name })),
              ]}
            />
            <SelectFilter
              label={t.since}
              value={f.since}
              onChange={(since) => set({ since })}
              options={(['all', 'new', 'changed'] as const).map((v) => ({
                value: v,
                label: t.sinceOption[v],
              }))}
            />
            <SelectFilter
              label={m.filters.sortBy}
              value={f.sort}
              onChange={(sort) => set({ sort })}
              options={(['status', 'priority', 'activity', 'elapsed', 'newest', 'id'] as const).map(
                (s) => ({
                  value: s,
                  label: t.sort[s],
                }),
              )}
            />
          </>
        }
      />
      <Panel family="ops">
        {missions.length === 0 ? (
          <FilteredEmpty
            resource="missions"
            total={snapshot.missions.length}
            unavailable={resourceUnavailable(snapshot, 'missions')}
            onReset={() => set(DEFAULT_MISSION_FILTER)}
          />
        ) : (
          <>
            <div className="mission-list">
              {page.visible.map((x) => (
                <MissionCard key={x.id} mission={x} markers={intel.markers.get(x.id)} />
              ))}
            </div>
            <ShowMore hidden={page.hidden} onClick={page.showMore} />
          </>
        )}
      </Panel>
    </div>
  );
}
