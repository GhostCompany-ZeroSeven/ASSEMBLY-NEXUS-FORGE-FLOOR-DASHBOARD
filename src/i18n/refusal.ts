import type { DecisionCheck } from '@/domain/governance';
import type { ApprovalRequest } from '@/domain/types';
import type { Messages } from './en';

/**
 * Localized explanation of a governance refusal, chosen by its CODE. The code
 * (not this text) is what governance returns and enforces.
 */
export function refusalText(
  m: Messages,
  check: DecisionCheck,
  request: ApprovalRequest,
  statusLabel: string,
): string {
  const r = m.refusal;
  switch (check.code) {
    case 'not-open':
      return r['not-open'](request.id, statusLabel);
    case 'missing-authority':
      return r['missing-authority'](request.id);
    case 'wrong-authority':
      return r['wrong-authority'](request.id, request.requiredAuthority ?? '');
    case 'unknown-request':
    case 'invalid-decision':
    case 'worker-cannot-decide':
      return r[check.code];
    default:
      return check.reason ?? '';
  }
}
