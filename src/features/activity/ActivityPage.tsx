import { useState } from 'react';
import { Panel } from '@/components/ui';
import type { EventCategory } from '@/domain/events';
import { ActivityStream } from './ActivityStream';

const CATEGORIES: EventCategory[] = ['mission', 'worker', 'review', 'approval', 'alert', 'system'];

export function ActivityPage() {
  const [active, setActive] = useState<EventCategory[]>(CATEGORIES);
  const [lowSignal, setLowSignal] = useState(false);

  const toggle = (c: EventCategory) =>
    setActive((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">Operations log</div>
          <h1 className="page__title">Activity</h1>
        </div>
        <div className="filters" role="group" aria-label="Event categories">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className="filter-chip"
              data-category={c}
              aria-pressed={active.includes(c)}
              onClick={() => toggle(c)}
            >
              {c}
            </button>
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={lowSignal}
              onChange={(e) => setLowSignal(e.target.checked)}
            />
            Show progress ticks
          </label>
        </div>
      </header>
      <Panel>
        <ActivityStream filter={{ categories: active, includeLowSignal: lowSignal }} limit={200} />
      </Panel>
    </div>
  );
}
