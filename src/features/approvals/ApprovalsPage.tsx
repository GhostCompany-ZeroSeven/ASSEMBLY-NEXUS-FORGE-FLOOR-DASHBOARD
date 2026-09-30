import { useState } from 'react';
import { EmptyState, Panel } from '@/components/ui';
import { resourceUnavailable } from '@/domain/selectors';
import { FilterBar, FilteredEmpty, SelectFilter } from '@/features/filters/FilterBar';
import {
  activeFilterCount,
  approvalMatchesView,
  DEFAULT_APPROVAL_FILTER,
  filterApprovals,
  type ApprovalFilter,
  type ApprovalView,
} from '@/features/filters/filters';
import { useFocusTarget } from '@/hooks/useFocusTarget';
import { useConfig, useSnapshot } from '@/store/hooks';
import { ApprovalGateCard } from './ApprovalGateCard';

const VIEWS: { value: ApprovalView; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Awaiting decision' },
  { value: 'held', label: 'On hold' },
  { value: 'decided', label: 'Decided' },
];

export function ApprovalsPage() {
  useFocusTarget();
  const snapshot = useSnapshot();
  const { governance } = useConfig();
  const [f, setF] = useState<ApprovalFilter>(DEFAULT_APPROVAL_FILTER);
  const set = (patch: Partial<ApprovalFilter>) => setF((cur) => ({ ...cur, ...patch }));
  const matches = filterApprovals(snapshot, f);
  const open = matches.filter((a) => a.status === 'PENDING' || a.status === 'HELD');
  const unknown = matches.filter((a) => a.status === 'UNKNOWN');
  const decided = matches
    .filter((a) => approvalMatchesView(a, 'decided'))
    .sort((a, b) => (b.decision?.decidedAt ?? '').localeCompare(a.decision?.decidedAt ?? ''));
  const views = snapshot.approvals.some((a) => a.status === 'UNKNOWN')
    ? [...VIEWS, { value: 'unknown' as const, label: 'Unknown status' }]
    : VIEWS;
  const reset = () => set(DEFAULT_APPROVAL_FILTER);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">Governance</div>
          <h1 className="page__title">Approval Gates</h1>
          <p className="page__lede">
            Only <strong>{governance.humanAuthority}</strong> opens a gate. Workers can request;
            they cannot approve. Capability is not authority.
          </p>
        </div>
      </header>

      <FilterBar
        label="Filter approval gates"
        noun="approval gates"
        query={f.q}
        onQuery={(q) => set({ q })}
        quick={views.map((v) => ({
          ...v,
          count: snapshot.approvals.filter((a) => approvalMatchesView(a, v.value)).length,
        }))}
        quickValue={f.view}
        onQuick={(view) => set({ view })}
        activeCount={activeFilterCount(f, DEFAULT_APPROVAL_FILTER)}
        onReset={reset}
        shown={matches.length}
        total={snapshot.approvals.length}
        more={
          <>
            <SelectFilter
              label="Risk"
              value={f.risk}
              onChange={(risk) => set({ risk })}
              options={[
                { value: 'all', label: 'Any risk' },
                { value: 'critical', label: 'Critical' },
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
              ]}
            />
            <SelectFilter
              label="Sort by"
              value={f.sort}
              onChange={(sort) => set({ sort })}
              options={[
                { value: 'oldest', label: 'Waiting longest' },
                { value: 'risk', label: 'Highest risk' },
                { value: 'newest', label: 'Newest' },
              ]}
            />
          </>
        }
      />

      {matches.length === 0 ? (
        <Panel>
          <FilteredEmpty
            total={snapshot.approvals.length}
            unavailable={resourceUnavailable(snapshot, 'approvals')}
            noun="approval gates"
            onReset={reset}
            sourceEmptyText="No approval requests have been made."
          />
        </Panel>
      ) : (
        <>
          {(f.view === 'all' || f.view === 'open' || f.view === 'held') && (
            <Panel
              title={`Awaiting decision (${open.length})`}
              tone={open.length ? 'warning' : undefined}
            >
              {open.length === 0 ? (
                <EmptyState title="No gates waiting">
                  Nothing requires a decision right now.
                </EmptyState>
              ) : (
                <div className="gate-list">
                  {open.map((r) => (
                    <ApprovalGateCard key={r.id} request={r} />
                  ))}
                </div>
              )}
            </Panel>
          )}
          {unknown.length > 0 && (
            <Panel title={`Unknown status (${unknown.length})`} tone="warning">
              <p className="small muted">
                The data source reported statuses this dashboard does not recognise. These requests
                cannot be decided here.
              </p>
              <div className="gate-list">
                {unknown.map((r) => (
                  <ApprovalGateCard key={r.id} request={r} />
                ))}
              </div>
            </Panel>
          )}
          {(f.view === 'all' || f.view === 'decided') && (
            <Panel title={`Decision history (${decided.length})`}>
              {decided.length === 0 ? (
                <EmptyState title="No decisions yet" />
              ) : (
                <div className="gate-list">
                  {decided.map((r) => (
                    <ApprovalGateCard key={r.id} request={r} />
                  ))}
                </div>
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
