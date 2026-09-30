import { useState } from 'react';
import { Panel } from '@/components/ui';
import { WORKER_STATE_META } from '@/domain/status';
import { WORKER_STATES, type WorkerState } from '@/domain/types';
import { useConfig, useSnapshot } from '@/store/hooks';
import { WorkerCard } from './WorkerCard';

export function WorkersPage() {
  const snapshot = useSnapshot();
  const { crews } = useConfig();
  const [state, setState] = useState<WorkerState | 'ALL'>('ALL');
  const present = WORKER_STATES.filter((s) => snapshot.workers.some((w) => w.state === s));
  const workers = snapshot.workers.filter((w) => state === 'ALL' || w.state === state);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">Crew roster</div>
          <h1 className="page__title">Workers</h1>
        </div>
        <label className="select-field">
          <span>State</span>
          <select value={state} onChange={(e) => setState(e.target.value as WorkerState | 'ALL')}>
            <option value="ALL">All states ({snapshot.workers.length})</option>
            {present.map((s) => (
              <option key={s} value={s}>
                {WORKER_STATE_META[s].label} ({snapshot.workers.filter((w) => w.state === s).length}
                )
              </option>
            ))}
          </select>
        </label>
      </header>

      {crews.map((crew) => {
        const members = workers.filter((w) => w.crewId === crew.id);
        if (members.length === 0 && crew.status !== 'reserved') return null;
        return (
          <Panel
            key={crew.id}
            eyebrow={crew.status === 'reserved' ? 'Reserved crew' : 'Crew'}
            title={crew.label}
            actions={crew.motto && <span className="crew-motto">{crew.motto}</span>}
          >
            {members.length === 0 ? (
              <p className="muted">No workers match the current filter.</p>
            ) : (
              <div className="worker-grid">
                {members.map((w) => (
                  <WorkerCard key={w.id} worker={w} />
                ))}
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
