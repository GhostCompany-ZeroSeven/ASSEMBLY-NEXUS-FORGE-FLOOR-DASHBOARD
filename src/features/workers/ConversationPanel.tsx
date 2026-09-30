import { useId, useState, type FormEvent } from 'react';
import { Icon } from '@/components/Icon';
import { EmptyState, SimulatedTag } from '@/components/ui';
import { useI18n } from '@/i18n/useI18n';
import type { Worker } from '@/domain/types';
import { useConfig, useDashboard, useSnapshot } from '@/store/hooks';

/**
 * Worker conversation surface. It only sends when the adapter declares
 * messaging support, and it never fabricates replies. Delivery state is shown
 * per message so a simulated send is never mistaken for a real one.
 */
export function ConversationPanel({ worker }: { worker: Worker }) {
  const snapshot = useSnapshot();
  const { features, governance } = useConfig();
  const { sendWorkerMessage } = useDashboard();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const i18n = useI18n();
  const t = i18n.m.convo;
  const time = i18n.time;
  const messages = snapshot.messages.filter((m) => m.workerId === worker.id);
  const enabled = features.workerMessaging && sendWorkerMessage !== null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !sendWorkerMessage) return;
    setBusy(true);
    setError(null);
    try {
      await sendWorkerMessage(worker.id, body, governance.humanAuthority);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="convo">
      <ol className="convo__log" aria-live="polite" aria-label={t.log(worker.name)}>
        {messages.length === 0 && <EmptyState title={t.none} />}
        {messages.map((m) => (
          <li key={m.id} className="convo__msg" data-direction={m.direction}>
            <div className="convo__meta">
              <strong>{m.author}</strong> <span className="mono">{time(m.sentAt)}</span>
              {m.delivery === 'simulated' && (
                <SimulatedTag>{m.direction === 'to-worker' ? t.notDelivered : t.demo}</SimulatedTag>
              )}
              {m.delivery === 'failed' && <span className="text-danger small">{t.failed}</span>}
            </div>
            <div className="convo__body">{m.body}</div>
          </li>
        ))}
      </ol>
      {enabled ? (
        <form className="convo__form" onSubmit={submit}>
          <label htmlFor={inputId} className="visually-hidden">
            {t.label(worker.name)}
          </label>
          <input
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t.placeholder(worker.name.split(' ')[0]!)}
            autoComplete="off"
            disabled={busy}
          />
          <button type="submit" className="btn" disabled={busy || !draft.trim()}>
            <Icon name="send" size={14} /> {t.send}
          </button>
        </form>
      ) : (
        <p className="muted small">{t.unsupported}</p>
      )}
      {enabled && snapshot.provenance.mode === 'demo' && (
        <p className="muted small">{t.demoNote}</p>
      )}
      {error && (
        <p className="text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
