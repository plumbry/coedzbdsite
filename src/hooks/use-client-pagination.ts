import { useEffect, useMemo, useState } from "react";

export const DEFAULT_PAGE_SIZE = 50;

export type ClientPaginationResult<T> = {
  pageItems: T[] | undefined;
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  totalCount: number;
  startIndex: number;
  endIndex: number;
  pageSize: number;
  resetPage: () => void;
};

export function useClientPagination<T>(
  items: T[] | undefined,
  options?: {
    pageSize?: number;
    resetDeps?: readonly unknown[];
  },
): ClientPaginationResult<T> {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls when to reset via resetDeps
  }, options?.resetDeps ?? []);

  const totalCount = items?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    if (!items) return undefined;
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const startIndex = totalCount === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);

  return {
    pageItems,
    page: safePage,
    setPage,
    totalPages,
    totalCount,
    startIndex,
    endIndex,
    pageSize,
    resetPage: () => setPage(1),
  };
}
