import { useState } from 'react';
import { Panel, StatusBadge } from '@/components/ui';
import { findWorker } from '@/domain/selectors';
import { WORKER_STATE_META } from '@/domain/status';
import { WORKER_STATES } from '@/domain/types';
import { WorkerCard } from '@/features/workers/WorkerCard';
import { useConfig, useSnapshot } from '@/store/hooks';
import { ForgeFloorMap } from './ForgeFloorMap';

export function ForgeFloorPage() {
  const snapshot = useSnapshot();
  const { crews } = useConfig();
  const [selected, setSelected] = useState<string | null>(null);
  const worker = findWorker(snapshot, selected ?? undefined);
  const forge = crews.find((c) => c.id === 'forge');

  return (
    <div className="page page--wide">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">Visual operations</div>
          <h1 className="page__title">Forge Floor</h1>
          {forge?.motto && <p className="page__lede crew-motto">{forge.motto}</p>}
        </div>
        <ul className="legend" aria-label="Worker state legend">
          {WORKER_STATES.map((s) => (
            <li key={s}>
              <StatusBadge tone={WORKER_STATE_META[s].tone} size="sm">
                {WORKER_STATE_META[s].label}
              </StatusBadge>
            </li>
          ))}
        </ul>
      </header>

      <div className="floor-layout">
        <Panel className="floor-panel">
          <ForgeFloorMap
            selectedId={selected}
            onSelect={(id) => setSelected((cur) => (cur === id ? null : id))}
          />
        </Panel>
        <aside className="floor-aside" aria-label="Selected worker">
          {worker ? (
            <WorkerCard worker={worker} />
          ) : (
            <Panel title="Select a worker">
              <p className="muted">
                Click any crew member on the floor to inspect them. Workers walk between rooms as
                their state changes; those waiting on a human decision gather at the Founder Gate.
              </p>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
