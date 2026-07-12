import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

export type OpsTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  searchValue?: (row: T) => string;
  /** Used for sorting; falls back to searchValue when omitted. */
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  sortable?: boolean;
};

type SortDirection = "asc" | "desc";

type SortState = {
  key: string;
  direction: SortDirection;
};

type OpsDataTableProps<T extends { _id: string }> = {
  title: string;
  description?: string;
  data: T[] | undefined;
  columns: OpsTableColumn<T>[];
  searchPlaceholder?: string;
  onAdd?: () => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  addLabel?: string;
  emptyMessage?: string;
  /** Footer cells keyed by column key; computed from the currently filtered rows. */
  footer?: (rows: T[]) => Partial<Record<string, React.ReactNode>>;
};

function compareSortValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getColumnSortValue<T>(
  row: T,
  col: OpsTableColumn<T>,
): string | number | null | undefined {
  if (col.sortValue) return col.sortValue(row);
  if (col.searchValue) return col.searchValue(row);
  return null;
}

export function OpsDataTable<T extends { _id: string }>({
  title,
  description,
  data,
  columns,
  searchPlaceholder = "Search…",
  onAdd,
  onEdit,
  onDelete,
  addLabel = "Add",
  emptyMessage = "No entries yet.",
  footer,
}: OpsDataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);

  const filtered = useMemo(() => {
    if (!data) return undefined;
    const q = search.trim().toLowerCase();
    let rows = data;
    if (q) {
      rows = data.filter((row) =>
        columns.some((col) => {
          const value = col.searchValue?.(row) ?? String(col.render(row) ?? "");
          return value.toLowerCase().includes(q);
        }),
      );
    }
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col || col.sortable === false) return rows;
    return [...rows].sort((a, b) => {
      const cmp = compareSortValues(
        getColumnSortValue(a, col),
        getColumnSortValue(b, col),
      );
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [data, search, columns, sort]);

  const footerCells = useMemo(() => {
    if (!footer || !filtered || filtered.length === 0) return undefined;
    return footer(filtered);
  }, [footer, filtered]);

  const handleSort = (key: string) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  };

  const sortIcon = (key: string) => {
    if (sort?.key !== key) {
      return <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 opacity-40" />;
    }
    return sort.direction === "asc" ? (
      <ArrowUp className="ml-1.5 h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="ml-1.5 h-3.5 w-3.5" />
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {onAdd && (
          <Button size="sm" className="cursor-pointer shrink-0" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-1.5" />
            {addLabel}
          </Button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 pl-8 text-sm"
        />
      </div>

      {filtered === undefined ? (
        <Skeleton className="h-48 w-full" />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center border rounded-md">
          {search ? "No matches." : emptyMessage}
        </p>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.key} className={col.className}>
                    {col.sortable === false ? (
                      col.header
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center cursor-pointer select-none hover:text-foreground"
                        onClick={() => handleSort(col.key)}
                      >
                        {col.header}
                        {sortIcon(col.key)}
                      </button>
                    )}
                  </TableHead>
                ))}
                {(onEdit || onDelete) && (
                  <TableHead className="w-[90px] text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row._id}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.render(row)}
                    </TableCell>
                  ))}
                  {(onEdit || onDelete) && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {onEdit && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 cursor-pointer"
                            onClick={() => onEdit(row)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {onDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive cursor-pointer"
                            onClick={() => onDelete(row)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            {footerCells && (
              <TableFooter>
                <TableRow>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {footerCells[col.key] ?? null}
                    </TableCell>
                  ))}
                  {(onEdit || onDelete) && <TableCell />}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      )}
    </div>
  );
}

export function formatOpsTimestamp(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function OpsAuditMeta({
  createdAt,
  updatedAt,
  updatedBy,
}: {
  createdAt: number;
  updatedAt: number;
  updatedBy?: string;
}) {
  return (
    <span className="text-[10px] text-muted-foreground block mt-0.5">
      Updated {formatOpsTimestamp(updatedAt)}
      {updatedBy ? ` · ${updatedBy}` : ""}
      {updatedAt !== createdAt ? "" : " (new)"}
    </span>
  );
}
