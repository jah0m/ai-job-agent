import type { ApplicationListItem } from "./types";

export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function groupNextActions(items: ApplicationListItem[], today: string) {
  const active = items.filter(
    (item) => !["rejected", "withdrawn", "closed"].includes(item.status),
  );
  const pending = active
    .filter((item) => item.next_action.title && !item.next_action.completed_at)
    .sort(
      (a, b) =>
        (a.next_action.due_date ?? "9999").localeCompare(
          b.next_action.due_date ?? "9999",
        ) || a.company.localeCompare(b.company),
    );
  return {
    overdue: pending.filter(
      (item) => item.next_action.due_date && item.next_action.due_date < today,
    ),
    dueToday: pending.filter((item) => item.next_action.due_date === today),
    upcoming: pending.filter(
      (item) => item.next_action.due_date && item.next_action.due_date > today,
    ),
    undated: pending.filter((item) => !item.next_action.due_date),
    unset: active.length - pending.length,
  };
}
