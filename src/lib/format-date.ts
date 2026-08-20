export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Local datetime string for <input type="datetime-local"> (YYYY-MM-DDTHH:mm). */
export function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Short "when does it start" label for an upcoming game. */
export function upcomingWhenLabel(dateStr: string, now = Date.now()): string {
  const diffDays = Math.ceil((new Date(dateStr).getTime() - now) / 86400000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays < 14) return `in ${diffDays} days`;
  return formatDate(dateStr);
}

/**
 * Local datetime with a timezone hint, e.g. "Aug 17, 2026, 6:00 PM (GMT-7)".
 * Falls back to plain local formatting when the tz name is unavailable.
 */
export function formatDateTimeWithTz(dateStr: string): string {
  const d = new Date(dateStr);
  const base = d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  let tz = "";
  try {
    const name = d.toLocaleTimeString(undefined, { timeZoneName: "short" }).split(" ").pop();
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
    const mm = String(Math.abs(offset) % 60).padStart(2, "0");
    tz = name && /GMT|UTC|CEST|CET|PDT|PST|EDT|EST|BST|IST|JST|AEST/.test(name) ? name : `GMT${sign}${hh}:${mm}`;
  } catch {
    tz = "";
  }
  return tz ? `${base} (${tz})` : base;
}

/** Compact "time from now" label, e.g. "in 2h 15m", "in 3d", "now", "1d ago". */
export function countdownLabel(dateStr: string, now = Date.now()): string {
  const diffMs = new Date(dateStr).getTime() - now;
  const abs = Math.abs(diffMs);
  const mins = Math.floor(abs / 60000);
  if (mins < 1) return diffMs >= 0 ? "now" : "just now";
  if (mins < 60) return diffMs >= 0 ? `in ${mins}m` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return diffMs >= 0 ? `in ${hours}h ${mins % 60}m` : `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return diffMs >= 0 ? `in ${days}d` : `${days}d ago`;
}

/** Convert a datetime-local input value (or null) to an ISO UTC string. */
export function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
