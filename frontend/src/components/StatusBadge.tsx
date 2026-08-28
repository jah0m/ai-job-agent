export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: string;
}) {
  return (
    <span className={`status-badge status-${tone}`}>
      <span className="status-badge-dot" />
      {label}
    </span>
  );
}
