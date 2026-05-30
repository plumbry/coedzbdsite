import { ClerkProvider } from "@clerk/react";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error(
    "Missing VITE_CLERK_PUBLISHABLE_KEY. Add it to your .env file (see .env.example).",
  );
}

/**
 * Clerk Discord-only auth is configured in the Clerk Dashboard (Phase 1):
 * - SSO: Discord only, all other strategies disabled
 * - Restrictions: Restricted sign-up
 * - JWT template "convex": add discord_id claim (see IMPLEMENTATION_PHASE_1.md §2.6)
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
