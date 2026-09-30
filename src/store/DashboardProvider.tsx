import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ConnectionStatus, DashboardAdapter } from '@/adapters/types';
import type { DashboardSnapshot } from '@/domain/snapshot';
import type { ApprovalDecision, ApprovalDecisionRecord, WorkerMessage } from '@/domain/types';
import { DashboardContext } from './contexts';

export interface DashboardContextValue {
  adapter: DashboardAdapter;
  snapshot: DashboardSnapshot | null;
  status: ConnectionStatus;
  error: string | null;
  decideApproval: (
    approvalId: string,
    decision: ApprovalDecision,
    decidedBy: string,
    note?: string,
  ) => Promise<ApprovalDecisionRecord>;
  acknowledgeAlert: (alertId: string, by: string) => Promise<void>;
  sendWorkerMessage:
    ((workerId: string, body: string, author: string) => Promise<WorkerMessage>) | null;
}

/**
 * Connects exactly one adapter and exposes its normalized snapshot to the UI.
 * Components never import adapters directly — they only see this context.
 */
export function DashboardProvider({
  adapter,
  children,
}: {
  adapter: DashboardAdapter;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = adapter.subscribe((update) => {
      if (cancelled) return;
      if (update.type === 'snapshot') setSnapshot(update.snapshot);
      else {
        setStatus(update.status);
        if (update.message) setError(update.message);
      }
    });
    adapter
      .connect()
      .then((initial) => {
        if (cancelled) return;
        setSnapshot(initial);
        setStatus('connected');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      unsubscribe();
      adapter.disconnect();
    };
  }, [adapter]);

  const decideApproval = useCallback<DashboardContextValue['decideApproval']>(
    (approvalId, decision, decidedBy, note) =>
      adapter.submitApprovalDecision({ approvalId, decision, decidedBy, note }),
    [adapter],
  );

  const acknowledgeAlert = useCallback<DashboardContextValue['acknowledgeAlert']>(
    (alertId, by) => adapter.acknowledgeAlert(alertId, by),
    [adapter],
  );

  const sendWorkerMessage = useMemo(() => {
    const send = adapter.sendWorkerMessage;
    if (!adapter.capabilities.messaging || !send) return null;
    return (workerId: string, body: string, author: string) =>
      send.call(adapter, workerId, body, author);
  }, [adapter]);

  const value = useMemo<DashboardContextValue>(
    () => ({
      adapter,
      snapshot,
      status,
      error,
      decideApproval,
      acknowledgeAlert,
      sendWorkerMessage,
    }),
    [adapter, snapshot, status, error, decideApproval, acknowledgeAlert, sendWorkerMessage],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
