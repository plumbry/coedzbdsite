import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import PageShell from "@/components/page-shell.tsx";

export default function NotFound() {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <PageShell>
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold text-muted-foreground">404</h1>
          <h2 className="text-xl font-semibold">Page Not Found</h2>
        </div>
        <p className="text-sm text-muted-foreground max-w-md">
          This page does not exist.
        </p>
        <Button asChild size="sm">
          <Link to="/">Return to Home</Link>
        </Button>
      </div>
    </PageShell>
  );
}
