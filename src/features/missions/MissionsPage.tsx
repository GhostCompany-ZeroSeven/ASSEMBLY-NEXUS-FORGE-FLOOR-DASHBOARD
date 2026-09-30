import { useState } from 'react';
import { EmptyState, Panel } from '@/components/ui';
import { isMissionInFlight, sortMissions } from '@/domain/selectors';
import { useSnapshot } from '@/store/hooks';
import { MissionCard } from './MissionCard';

type Filter = 'in-flight' | 'queued' | 'finished' | 'all';

export function MissionsPage() {
  const snapshot = useSnapshot();
  const [filter, setFilter] = useState<Filter>('all');
  const missions = sortMissions(snapshot.missions).filter((m) => {
    if (filter === 'all') return true;
    if (filter === 'in-flight') return isMissionInFlight(m);
    if (filter === 'queued') return m.status === 'QUEUED';
    return m.status === 'COMPLETE' || m.status === 'FAILED' || m.status === 'CANCELLED';
  });

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">Mission Control</div>
          <h1 className="page__title">Missions</h1>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Filter missions">
          {(['all', 'in-flight', 'queued', 'finished'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              className="segmented__item"
              onClick={() => setFilter(f)}
            >
              {f.replace('-', ' ')}
            </button>
          ))}
        </div>
      </header>
      <Panel>
        {missions.length === 0 ? (
          <EmptyState title="No missions match this filter" />
        ) : (
          <div className="mission-list">
            {missions.map((m) => (
              <MissionCard key={m.id} mission={m} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
