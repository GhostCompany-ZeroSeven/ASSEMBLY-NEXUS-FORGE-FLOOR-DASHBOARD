import { EmptyState, Panel } from '@/components/ui';
import { pendingApprovals } from '@/domain/selectors';
import { useConfig, useSnapshot } from '@/store/hooks';
import { ApprovalGateCard } from './ApprovalGateCard';

export function ApprovalsPage() {
  const snapshot = useSnapshot();
  const { governance } = useConfig();
  const pending = pendingApprovals(snapshot);
  const decided = snapshot.approvals
    .filter((a) => a.status !== 'PENDING' && a.status !== 'HELD')
    .sort((a, b) => (b.decision?.decidedAt ?? '').localeCompare(a.decision?.decidedAt ?? ''));

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

      <Panel
        title={`Awaiting decision (${pending.length})`}
        tone={pending.length ? 'warning' : undefined}
      >
        {pending.length === 0 ? (
          <EmptyState title="No gates waiting">Nothing requires a decision right now.</EmptyState>
        ) : (
          <div className="gate-list">
            {pending.map((r) => (
              <ApprovalGateCard key={r.id} request={r} />
            ))}
          </div>
        )}
      </Panel>

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
    </div>
  );
}
