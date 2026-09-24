/** "3m ago" / "2d ago" style, with a sensible cutoff to an absolute date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 45) return "just now";
  const minutes = Math.round(diffSec / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return absoluteTime(iso, { dateOnly: true });
}

export function absoluteTime(iso: string, opts: { dateOnly?: boolean } = {}): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(opts.dateOnly ? {} : { hour: "numeric", minute: "2-digit" }),
  });
}
