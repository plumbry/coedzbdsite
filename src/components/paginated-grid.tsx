import type { ReactNode } from "react";
import { useClientPagination } from "@/hooks/use-client-pagination.ts";
import TablePagination from "@/components/table-pagination.tsx";
import { cn } from "@/lib/utils.ts";

type PaginatedGridProps<T> = {
  items: T[];
  resetDeps?: readonly unknown[];
  itemLabel?: string;
  className?: string;
  children: (item: T) => ReactNode;
};

export default function PaginatedGrid<T>({
  items,
  resetDeps,
  itemLabel = "items",
  className,
  children,
}: PaginatedGridProps<T>) {
  const pagination = useClientPagination(items, { resetDeps });

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className={cn("grid gap-6 md:grid-cols-2 lg:grid-cols-3", className)}>
        {(pagination.pageItems ?? []).map((item) => children(item))}
      </div>
      <TablePagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalCount={pagination.totalCount}
        startIndex={pagination.startIndex}
        endIndex={pagination.endIndex}
        onPageChange={pagination.setPage}
        itemLabel={itemLabel}
      />
    </div>
  );
}
