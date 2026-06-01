import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { useCallback } from "react";
import { useLocation } from "react-router-dom";

function buildReturnUrl(location: ReturnType<typeof useLocation>): string {
  return `${window.location.origin}${location.pathname}${location.search}${location.hash}`;
}

export function useAuth() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const clerk = useClerk();
  const location = useLocation();

  const signinRedirect = useCallback(async () => {
    const returnUrl = buildReturnUrl(location);
    await clerk.redirectToSignIn({
      signInForceRedirectUrl: returnUrl,
      signUpForceRedirectUrl: returnUrl,
    });
  }, [clerk, location]);

  const signout = useCallback(async () => {
    await clerk.signOut({ redirectUrl: window.location.origin });
  }, [clerk]);

  return {
    isAuthenticated: isSignedIn === true,
    isLoading: !isLoaded,
    signinRedirect,
    signout,
    error: undefined as Error | undefined,
  };
}
