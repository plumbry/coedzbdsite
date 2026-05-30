import { useAuth as useClerkAuth, useClerk } from "@clerk/react";

export function useAuth() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const clerk = useClerk();

  return {
    isAuthenticated: isSignedIn === true,
    isLoading: !isLoaded,
    signinRedirect: async () => {
      await clerk.redirectToSignIn({ redirectUrl: window.location.href });
    },
    signout: async () => {
      await clerk.signOut({ redirectUrl: window.location.origin });
    },
    error: undefined as Error | undefined,
  };
}
