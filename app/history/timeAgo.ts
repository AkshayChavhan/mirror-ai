/** "just now", "5 min ago" or "3 h ago". Try-ons are at most 24 h old, so hours are the largest unit. */
export function timeAgo(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}
