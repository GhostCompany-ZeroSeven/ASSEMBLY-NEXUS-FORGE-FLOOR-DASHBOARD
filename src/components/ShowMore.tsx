export function ShowMore({
  hidden,
  onClick,
  noun,
}: {
  hidden: number;
  onClick: () => void;
  noun: string;
}) {
  if (hidden <= 0) return null;
  return (
    <button type="button" className="btn btn--ghost show-more" onClick={onClick}>
      Show more {noun} ({hidden} not shown)
    </button>
  );
}
