import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { useCallback } from "react";
import { useLocation } from "react-router-dom";

const SSO_CALLBACK_PATH = "/sso-callback";

type DiscordRedirectSignIn = {
  authenticateWithRedirect: (params: {
    strategy: "oauth_discord";
    redirectUrl: string;
    redirectUrlComplete: string;
  }) => Promise<void>;
};

function buildReturnUrl(location: ReturnType<typeof useLocation>): string {
  return `${window.location.origin}${location.pathname}${location.search}${location.hash}`;
}

export function useAuth() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const clerk = useClerk();
  const location = useLocation();

  const signinRedirect = useCallback(async () => {
    if (!isLoaded) {
      throw new Error("Authentication is still loading");
    }

    const returnUrl = buildReturnUrl(location);
    const redirectCallbackUrl = `${window.location.origin}${SSO_CALLBACK_PATH}`;

    const redirectSignIn = clerk.client?.signIn as unknown as DiscordRedirectSignIn | undefined;
    if (!redirectSignIn?.authenticateWithRedirect) {
      throw new Error("Discord sign in is not ready");
    }

    await redirectSignIn.authenticateWithRedirect({
      strategy: "oauth_discord",
      redirectUrl: redirectCallbackUrl,
      redirectUrlComplete: returnUrl,
    });
  }, [clerk.client?.signIn, location, isLoaded]);

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
