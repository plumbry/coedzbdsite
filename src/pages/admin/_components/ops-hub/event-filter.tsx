import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";

export const ALL_EVENTS = "__all__";
export const UNASSIGNED_EVENT = "__unassigned__";

export function collectEventNames(
  values: Array<string | undefined | null>,
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of values) {
    const name = raw?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

export function matchesEventFilter(
  event: string | undefined,
  filter: string,
): boolean {
  const trimmed = event?.trim() ?? "";
  if (filter === ALL_EVENTS) return true;
  if (filter === UNASSIGNED_EVENT) return trimmed === "";
  return trimmed.toLowerCase() === filter.toLowerCase();
}

export function formatUsd(amount: number): string {
  const abs = Math.abs(amount).toFixed(2);
  return amount < 0 ? `-$${abs}` : `$${abs}`;
}

export function EventFilterSelect({
  value,
  events,
  onChange,
}: {
  value: string;
  events: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 w-full sm:w-auto">
      <span className="text-xs font-medium text-muted-foreground shrink-0">
        Event
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label="Filter by event"
          className="h-9 w-full sm:w-[200px] cursor-pointer"
        >
          <SelectValue placeholder="All events" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_EVENTS}>All events</SelectItem>
          <SelectItem value={UNASSIGNED_EVENT}>Unassigned</SelectItem>
          {events.length > 0 && <SelectSeparator />}
          {events.map((event) => (
            <SelectItem key={event} value={event}>
              {event}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
