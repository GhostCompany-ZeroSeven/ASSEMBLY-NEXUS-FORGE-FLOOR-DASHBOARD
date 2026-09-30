import { useUrlState } from '@/app/urlState';
import { EmptyState, Panel } from '@/components/ui';
import { resourceUnavailable } from '@/domain/selectors';
import { FilterBar, FilteredEmpty, SelectFilter } from '@/features/filters/FilterBar';
import {
  activeFilterCount,
  approvalMatchesView,
  DEFAULT_APPROVAL_FILTER,
  filterApprovals,
  type ApprovalView,
} from '@/features/filters/filters';
import { APPROVAL_SCHEMA } from '@/features/filters/urlSchemas';
import { useFocusTarget } from '@/hooks/useFocusTarget';
import { cap } from '@/i18n/format';
import { useI18n } from '@/i18n/useI18n';
import { useConfig, useSnapshot } from '@/store/hooks';
import { ApprovalGateCard } from './ApprovalGateCard';

const VIEWS: ApprovalView[] = ['all', 'open', 'held', 'decided'];

export function ApprovalsPage() {
  useFocusTarget();
  const snapshot = useSnapshot();
  const { governance } = useConfig();
  const { m } = useI18n();
  const t = m.approvals;
  // Filters, sorting and search text live in the URL (?view=&risk=&sort=&q=).
  // URL state only filters what is shown; it can never decide or authorize anything.
  const [f, set] = useUrlState(DEFAULT_APPROVAL_FILTER, APPROVAL_SCHEMA);
  const matches = filterApprovals(snapshot, f);
  const open = matches.filter((a) => a.status === 'PENDING' || a.status === 'HELD');
  const unknown = matches.filter((a) => a.status === 'UNKNOWN');
  const decided = matches
    .filter((a) => approvalMatchesView(a, 'decided'))
    .sort((a, b) => (b.decision?.decidedAt ?? '').localeCompare(a.decision?.decidedAt ?? ''));
  const views: ApprovalView[] =
    snapshot.approvals.some((a) => a.status === 'UNKNOWN') || f.view === 'unknown'
      ? [...VIEWS, 'unknown']
      : VIEWS;
  const reset = () => set(DEFAULT_APPROVAL_FILTER);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">{t.eyebrow}</div>
          <h1 className="page__title">{t.title}</h1>
          <p className="page__lede">
            {t.ledeOnly} <strong>{governance.humanAuthority}</strong> {t.ledeRest}
          </p>
        </div>
      </header>

      <FilterBar
        resource="approvals"
        query={f.q}
        onQuery={(q) => set({ q }, 'replace')}
        quick={views.map((v) => ({
          value: v,
          label: t.view[v],
          count: snapshot.approvals.filter((a) => approvalMatchesView(a, v)).length,
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
              label={t.risk}
              value={f.risk}
              onChange={(risk) => set({ risk })}
              options={[
                { value: 'all', label: t.anyRisk },
                ...(['critical', 'high', 'medium', 'low'] as const).map((r) => ({
                  value: r,
                  label: cap(m.status.risk[r]),
                })),
              ]}
            />
            <SelectFilter
              label={m.filters.sortBy}
              value={f.sort}
              onChange={(sort) => set({ sort })}
              options={(['oldest', 'risk', 'newest'] as const).map((s) => ({
                value: s,
                label: t.sort[s],
              }))}
            />
          </>
        }
      />

      {matches.length === 0 ? (
        <Panel>
          <FilteredEmpty
            resource="approvals"
            total={snapshot.approvals.length}
            unavailable={resourceUnavailable(snapshot, 'approvals')}
            onReset={reset}
          />
        </Panel>
      ) : (
        <>
          {(f.view === 'all' || f.view === 'open' || f.view === 'held') && (
            <Panel title={t.sectionOpen(open.length)} tone={open.length ? 'warning' : undefined}>
              {open.length === 0 ? (
                <EmptyState title={t.noneOpen}>{t.noneOpenBody}</EmptyState>
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
            <Panel title={t.sectionUnknown(unknown.length)} tone="warning">
              <p className="small muted">{t.unknownNote}</p>
              <div className="gate-list">
                {unknown.map((r) => (
                  <ApprovalGateCard key={r.id} request={r} />
                ))}
              </div>
            </Panel>
          )}
          {(f.view === 'all' || f.view === 'decided') && (
            <Panel title={t.sectionHistory(decided.length)}>
              {decided.length === 0 ? (
                <EmptyState title={t.noneDecided} />
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
