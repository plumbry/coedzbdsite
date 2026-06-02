import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

type TablePaginationProps = {
  page: number;
  totalPages: number;
  totalCount: number;
  startIndex: number;
  endIndex: number;
  onPageChange: (page: number) => void;
  className?: string;
  itemLabel?: string;
  /** Hide the "Showing X–Y of Z" summary when false */
  showSummary?: boolean;
};

export default function TablePagination({
  page,
  totalPages,
  totalCount,
  startIndex,
  endIndex,
  onPageChange,
  className,
  itemLabel = "items",
  showSummary = true,
}: TablePaginationProps) {
  if (totalCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {showSummary && (
        <p className="text-sm text-muted-foreground">
          Showing {startIndex + 1}–{endIndex} of {totalCount} {itemLabel}
        </p>
      )}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : showSummary ? null : (
        <p className="text-sm text-muted-foreground">
          {totalCount} {itemLabel}
        </p>
      )}
    </div>
  );
}
