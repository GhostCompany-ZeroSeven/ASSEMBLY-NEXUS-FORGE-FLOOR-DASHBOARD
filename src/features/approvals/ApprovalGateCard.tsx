import { useId, useState } from 'react';
import { href } from '@/app/router';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { Icon } from '@/components/Icon';
import { SimulatedTag, StatusBadge } from '@/components/ui';
import { findWorker } from '@/domain/selectors';
import { APPROVAL_STATUS_META, RISK_TONE } from '@/domain/status';
import { formatRelative } from '@/domain/time';
import type { ApprovalDecision, ApprovalRequest } from '@/domain/types';
import { useConfig, useDashboard, useNow, useSnapshot } from '@/store/hooks';

const DECISION_COPY: Record<
  ApprovalDecision,
  { label: string; verb: string; icon: 'check' | 'x' | 'hold' }
> = {
  APPROVE: { label: 'Approve', verb: 'approve', icon: 'check' },
  DENY: { label: 'Deny', verb: 'deny', icon: 'x' },
  HOLD: { label: 'Hold / Review', verb: 'place on hold', icon: 'hold' },
};

/**
 * Founder decision surface. Approval is governance, not decoration:
 * - decisions require an explicit confirmation step (configurable),
 * - notes can be mandatory per decision type,
 * - the requesting worker's capabilities are shown separately from authority,
 * - the result reports honestly whether a backend received the decision.
 */
export function ApprovalGateCard({ request }: { request: ApprovalRequest }) {
  const snapshot = useSnapshot();
  const { governance } = useConfig();
  const { decideApproval, adapter } = useDashboard();
  const now = useNow(5000);
  const [pending, setPending] = useState<ApprovalDecision | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();

  const requester = findWorker(snapshot, request.requestedBy);
  const meta = APPROVAL_STATUS_META[request.status];
  const open = request.status === 'PENDING' || request.status === 'HELD';
  const noteRequired = pending !== null && governance.noteRequiredFor.includes(pending);
  const canDecide = adapter.capabilities.approvals && open;

  const submit = async (decision: ApprovalDecision) => {
    if (governance.noteRequiredFor.includes(decision) && !note.trim()) {
      setError('A note is required for this decision.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await decideApproval(
        request.id,
        decision,
        governance.humanAuthority,
        note.trim() || undefined,
      );
      setPending(null);
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const choose = (decision: ApprovalDecision) => {
    setError(null);
    if (governance.requireConfirmation) setPending(decision);
    else void submit(decision);
  };

  return (
    <article className="gate" data-status={request.status} data-risk={request.risk}>
      <header className="gate__head">
        <div className="gate__ids">
          <span className="mono">{request.id}</span>
          {request.missionId && (
            <a className="mono" href={href.mission(request.missionId)}>
              {request.missionId}
            </a>
          )}
        </div>
        <StatusBadge tone={meta.tone} pulse={request.status === 'PENDING'}>
          {meta.label}
        </StatusBadge>
      </header>

      <h3 className="gate__title">{request.title}</h3>

      <div className="gate__body">
        <div className="gate__action">
          <div className="gate__label">If approved, this will happen</div>
          <p>{request.action}</p>
          <div className="gate__label">Rationale</div>
          <p>{request.rationale}</p>
        </div>
        <dl className="gate__facts">
          <div>
            <dt>Risk</dt>
            <dd>
              <StatusBadge tone={RISK_TONE[request.risk]} size="sm">
                {request.risk.toUpperCase()}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt>Reversible</dt>
            <dd className={request.reversible ? '' : 'text-danger'}>
              {request.reversible ? 'Yes' : 'No — irreversible'}
            </dd>
          </div>
          <div>
            <dt>Requested</dt>
            <dd>{formatRelative(request.requestedAt, now)}</dd>
          </div>
          <div>
            <dt>Decision authority</dt>
            <dd>
              <strong>{request.requiredAuthority}</strong>
            </dd>
          </div>
        </dl>
      </div>

      <div className="gate__requester">
        {requester && (
          <CharacterAvatar characterId={requester.characterId} state={requester.state} size={34} />
        )}
        <div>
          <div>
            Requested by{' '}
            {requester ? (
              <a href={href.worker(requester.id)}>{requester.name}</a>
            ) : (
              request.requestedBy
            )}
            {requester && <span className="muted"> · {requester.role}</span>}
          </div>
          <div className="gate__authority-note">
            <Icon name="shield" size={12} /> Capabilities:{' '}
            {requester?.capabilities.map((c) => c.label).join(', ') || 'none reported'} ·{' '}
            <strong>Authority grants: {requester?.authority.length ?? 0}</strong>. Requesting
            approval grants no authority.
          </div>
        </div>
      </div>

      {request.decision && (
        <div className="gate__decision" data-decision={request.decision.decision}>
          <strong>{DECISION_COPY[request.decision.decision].label}</strong> by{' '}
          {request.decision.decidedBy} · {formatRelative(request.decision.decidedAt, now)}
          {request.decision.delivery === 'simulated' && (
            <SimulatedTag>Simulated — no backend received this decision</SimulatedTag>
          )}
          {request.decision.note && (
            <p className="gate__decision-note">“{request.decision.note}”</p>
          )}
        </div>
      )}

      {canDecide && pending === null && (
        <div className="gate__buttons" role="group" aria-label={`Decide ${request.id}`}>
          {(['APPROVE', 'DENY', 'HOLD'] as const)
            .filter((d) => !(d === 'HOLD' && request.status === 'HELD'))
            .map((d) => (
              <button
                key={d}
                type="button"
                className={`gate-btn gate-btn--${d.toLowerCase()}`}
                onClick={() => choose(d)}
                disabled={busy}
              >
                <Icon name={DECISION_COPY[d].icon} size={20} />
                {DECISION_COPY[d].label}
              </button>
            ))}
        </div>
      )}

      {canDecide && pending !== null && (
        <div
          className="gate__confirm"
          data-decision={pending}
          role="group"
          aria-label="Confirm decision"
        >
          <p>
            Confirm: <strong>{governance.humanAuthority}</strong> will{' '}
            <strong>{DECISION_COPY[pending].verb}</strong> “{request.title}”.
            {!request.reversible && pending === 'APPROVE' && (
              <strong className="text-danger"> This action cannot be undone.</strong>
            )}
          </p>
          <label htmlFor={noteId} className="gate__label">
            Note {noteRequired ? '(required)' : '(optional)'}
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            required={noteRequired}
          />
          <div className="gate__confirm-actions">
            <button
              type="button"
              className={`gate-btn gate-btn--${pending.toLowerCase()}`}
              onClick={() => void submit(pending)}
              disabled={busy}
            >
              Confirm {DECISION_COPY[pending].label}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setPending(null)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
          {snapshot.provenance.mode === 'demo' && (
            <p className="muted small">
              Demo mode: the decision is recorded locally and marked simulated. Nothing outside this
              browser is affected.
            </p>
          )}
        </div>
      )}

      {open && !adapter.capabilities.approvals && (
        <p className="muted">This adapter cannot deliver decisions. Decide in the source system.</p>
      )}

      {error && (
        <p className="text-danger" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
