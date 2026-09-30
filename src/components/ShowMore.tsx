import { useI18n } from '@/i18n/useI18n';

export function ShowMore({ hidden, onClick }: { hidden: number; onClick: () => void }) {
  const { m } = useI18n();
  if (hidden <= 0) return null;
  return (
    <button type="button" className="btn btn--ghost show-more" onClick={onClick}>
      {m.filters.showMore(hidden)}
    </button>
  );
}
