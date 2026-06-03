import { useAuth as useClerkAuth, useClerk, useSignIn } from "@clerk/react";
import type { OAuthStrategy } from "@clerk/shared/types";
import { useCallback } from "react";
import { useLocation } from "react-router-dom";

const DISCORD_OAUTH_STRATEGY: OAuthStrategy = "oauth_discord";
const SSO_CALLBACK_PATH = "/sso-callback";

function buildReturnUrl(location: ReturnType<typeof useLocation>): string {
  return `${window.location.origin}${location.pathname}${location.search}${location.hash}`;
}

export function useAuth() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const location = useLocation();

  const signinRedirect = useCallback(async () => {
    if (!isLoaded) {
      throw new Error("Authentication is still loading");
    }

    const returnUrl = buildReturnUrl(location);
    const redirectCallbackUrl = `${window.location.origin}${SSO_CALLBACK_PATH}`;

    const { error } = await signIn.sso({
      strategy: DISCORD_OAUTH_STRATEGY,
      redirectCallbackUrl,
      redirectUrl: returnUrl,
    });

    if (error) {
      throw new Error(
        error.longMessage ?? error.message ?? "Discord sign in failed",
      );
    }
  }, [signIn, location, isLoaded]);

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
