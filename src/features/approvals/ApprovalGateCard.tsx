import { useId, useState } from 'react';
import { href, withQuery } from '@/app/router';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { Icon } from '@/components/Icon';
import { ActionClassTag } from '@/components/ActionClassTag';
import { SimulatedTag, StatusBadge } from '@/components/ui';
import { checkDecision, isOpenForDecision } from '@/domain/governance';
import { classifyOperation } from '@/domain/operational';
import { findWorker } from '@/domain/selectors';
import { APPROVAL_STATUS_META, RISK_TONE } from '@/domain/status';
import type { ApprovalDecision, ApprovalRequest } from '@/domain/types';
import { refusalText } from '@/i18n/refusal';
import { useI18n } from '@/i18n/useI18n';
import { useConfig, useDashboard, useNow, useSnapshot } from '@/store/hooks';
import { useMissionLabel } from '@/hooks/useMissionLabel';

const DECISION_ICON: Record<ApprovalDecision, 'check' | 'x' | 'hold'> = {
  APPROVE: 'check',
  DENY: 'x',
  HOLD: 'hold',
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
  const missionRef = useMissionLabel();
  // Only alerts that explicitly name this gate as affected (no inferred links).
  const relatedAlerts = snapshot.alerts.filter((al) =>
    al.affected.some((x) => x.kind === 'approval' && x.id === request.id),
  );
  const { governance } = useConfig();
  const { decideApproval, adapter } = useDashboard();
  const now = useNow(5000);
  const [pending, setPending] = useState<ApprovalDecision | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();
  const actionNoteId = useId();
  const { m, rel } = useI18n();
  const t = m.gate;
  // Display text for a decision. The decision itself is always the enum value `d`.
  const decisionLabel = (d: ApprovalDecision) => m.decision.label[d];

  const requester = findWorker(snapshot, request.requestedBy);
  const meta = APPROVAL_STATUS_META[request.status];
  const open = isOpenForDecision(request);
  // Same rule the adapters enforce: only the named human authority, never a worker.
  const authorityCheck = checkDecision(request, governance.humanAuthority, snapshot.workers);
  const noteRequired = pending !== null && governance.noteRequiredFor.includes(pending);
  const canDecide = adapter.capabilities.approvals && open && authorityCheck.ok;
  // What a decision button really does here: a simulation in demo mode, a
  // Founder-gated operation on a connected backend.
  const action = classifyOperation('approval-decision', {
    mode: snapshot.provenance.mode,
    capabilities: adapter.capabilities,
  });

  const submit = async (decision: ApprovalDecision) => {
    if (governance.noteRequiredFor.includes(decision) && !note.trim()) {
      setError(t.noteRequired);
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
    <article
      className="gate"
      data-status={request.status}
      data-risk={request.risk}
      data-focus-id={request.id}
      aria-labelledby={`gate-title-${request.id}`}
    >
      <header className="gate__head">
        <div className="gate__ids">
          <span className="mono">{request.id}</span>
          {request.missionId && (
            <a className="mono" href={href.mission(request.missionId)}>
              {missionRef(request.missionId)}
            </a>
          )}
          <a className="target small" href={withQuery(href.activity(), { approval: request.id })}>
            {m.activity.openTimeline}
          </a>
        </div>
        <StatusBadge tone={meta.tone} pulse={request.status === 'PENDING'}>
          {m.status.approval[request.status]}
        </StatusBadge>
      </header>

      <h3 className="gate__title" id={`gate-title-${request.id}`}>
        {request.title}
      </h3>
      {relatedAlerts.length > 0 && (
        <p className="gate__related small">
          <span className="muted">{t.relatedAlerts}:</span>{' '}
          {relatedAlerts.map((al, i) => (
            <span key={al.id}>
              {i > 0 && ', '}
              <a className="target" href={withQuery(href.alerts(), { focus: al.id })}>
                {al.title}
              </a>
            </span>
          ))}
        </p>
      )}

      <div className="gate__body">
        <div className="gate__action">
          <div className="gate__label">{t.ifApproved}</div>
          <p>{request.action}</p>
          <div className="gate__label">{t.rationale}</div>
          <p>{request.rationale}</p>
        </div>
        <dl className="gate__facts">
          <div>
            <dt>{t.risk}</dt>
            <dd>
              <StatusBadge tone={RISK_TONE[request.risk]} size="sm">
                {m.status.risk[request.risk].toUpperCase()}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt>{t.reversible}</dt>
            <dd className={request.reversible ? '' : 'text-danger'}>
              {request.reversible ? m.common.yes : t.irreversible}
            </dd>
          </div>
          <div>
            <dt>{t.requested}</dt>
            <dd>{rel(request.requestedAt, now)}</dd>
          </div>
          <div>
            <dt>{m.ops.gate.expires}</dt>
            <dd data-testid="gate-expiry">
              {request.expiresAt ? (
                <time dateTime={request.expiresAt}>{rel(request.expiresAt, now)}</time>
              ) : (
                <span className="muted">{m.ops.gate.noExpiry}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>{t.authority}</dt>
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
            {t.requestedBy}{' '}
            {requester ? (
              <a href={href.worker(requester.id)}>{requester.name}</a>
            ) : (
              request.requestedBy
            )}
            {requester && <span className="muted"> · {requester.role}</span>}
          </div>
          <div className="gate__authority-note">
            <Icon name="shield" size={12} /> {t.capabilities}{' '}
            {requester?.capabilities.map((c) => c.label).join(', ') || t.noneReported} ·{' '}
            <strong>{t.grants(requester?.authority.length ?? 0)}</strong>. {t.grantsNothing}
          </div>
        </div>
      </div>

      {request.decision && (
        <div className="gate__decision" data-decision={request.decision.decision}>
          <strong>{decisionLabel(request.decision.decision)}</strong>
          {t.decidedBy(request.decision.decidedBy)} · {rel(request.decision.decidedAt, now)}
          {request.decision.delivery === 'simulated' && <SimulatedTag>{t.simulated}</SimulatedTag>}
          {request.decision.note && (
            <p className="gate__decision-note">“{request.decision.note}”</p>
          )}
        </div>
      )}

      {canDecide && pending === null && (
        <div className="gate__buttons" role="group" aria-label={t.decide(request.id)}>
          {(['APPROVE', 'DENY', 'HOLD'] as const)
            .filter((d) => !(d === 'HOLD' && request.status === 'HELD'))
            .map((d) => (
              <button
                key={d}
                type="button"
                className={`gate-btn gate-btn--${d.toLowerCase()}`}
                onClick={() => choose(d)}
                disabled={busy}
                data-action-class={action.cls}
                aria-describedby={action.cls === 'DEMO_SIMULATION' ? actionNoteId : undefined}
              >
                <Icon name={DECISION_ICON[d]} size={20} />
                {decisionLabel(d)}
              </button>
            ))}
        </div>
      )}
      {canDecide && pending === null && (
        <p className="action-note small" id={actionNoteId}>
          <ActionClassTag c={action} />{' '}
          {action.cls === 'DEMO_SIMULATION' && (
            <span className="muted">{m.ops.actionNote.approval}</span>
          )}
        </p>
      )}

      {canDecide && pending !== null && (
        <div
          className="gate__confirm"
          data-decision={pending}
          role="group"
          aria-label={t.confirmGroup}
        >
          <p>
            {t.confirm} <strong>{governance.humanAuthority}</strong> {t.will}{' '}
            <strong>{m.decision.verb[pending]}</strong> “{request.title}”.
            {!request.reversible && pending === 'APPROVE' && (
              <strong className="text-danger">{t.cannotUndo}</strong>
            )}
          </p>
          <label htmlFor={noteId} className="gate__label">
            {t.note} {noteRequired ? t.required : t.optional}
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
              {t.confirmButton(decisionLabel(pending))}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setPending(null)}
              disabled={busy}
            >
              {m.common.cancel}
            </button>
          </div>
          {snapshot.provenance.mode === 'demo' && <p className="muted small">{t.demoNote}</p>}
        </div>
      )}

      {open && !adapter.capabilities.approvals && (
        <p className="gate__blocked" role="note">
          <Icon name="lock" size={14} /> {t.unsupported}
        </p>
      )}
      {open && adapter.capabilities.approvals && !authorityCheck.ok && (
        <p className="gate__blocked" role="note">
          <Icon name="lock" size={14} />{' '}
          {t.unavailable(
            refusalText(m, authorityCheck, request, m.status.approval[request.status]),
          )}
        </p>
      )}
      {request.status === 'UNKNOWN' && (
        <p className="gate__blocked" role="note">
          <Icon name="lock" size={14} /> {t.unknownStatus}
        </p>
      )}

      {error && (
        <p className="text-danger" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
