import { AuthSync } from "../auth-sync.tsx";
import { Toaster } from "../ui/sonner.tsx";
import { TooltipProvider } from "../ui/tooltip.tsx";
import { AuthProvider } from "./auth.tsx";
import { ConvexProvider } from "./convex.tsx";
import { QueryClientProvider } from "./query-client.tsx";
import { ThemeProvider } from "next-themes";

export function DefaultProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ConvexProvider>
        <QueryClientProvider>
          <TooltipProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
            >
              <Toaster />
              <AuthSync />
              {children}
            </ThemeProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ConvexProvider>
    </AuthProvider>
  );
}
