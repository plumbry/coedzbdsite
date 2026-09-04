import SiteWordmark from "@/components/site-wordmark.tsx";

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-card">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 md:px-6">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <SiteWordmark compact />
          <p className="text-sm text-muted-foreground">
            Mixed-gender Fortnite Zero Build hub.
          </p>
        </div>
        <p className="text-sm text-muted-foreground sm:shrink-0">
          Use creator code{" "}
          <span className="font-semibold text-foreground">coedzbd</span>{" "}
          <span className="text-xs">#ad</span>
        </p>
      </div>
    </footer>
  );
}
