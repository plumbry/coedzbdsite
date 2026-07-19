import { AuthenticateWithRedirectCallback } from "@clerk/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";

const STUCK_AFTER_MS = 12_000;

/**
 * Completes Clerk Discord OAuth after authenticateWithRedirect().
 * Must use AuthenticateWithRedirectCallback (not HandleSSOCallback) to match
 * the legacy redirect ticket flow started in use-auth.ts.
 */
export default function SsoCallbackPage() {
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsStuck(true), STUCK_AFTER_MS);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-8">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Completing sign in…</p>
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl="/summer-slam"
        signUpFallbackRedirectUrl="/summer-slam"
      />
      {/* Required when Discord OAuth transfers into a new Clerk sign-up (bot protection). */}
      <div id="clerk-captcha" />
      {isStuck ? (
        <div className="mt-2 flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            Sign-in is taking longer than expected. Try again from Summer Slam, or open the site in a
            fresh browser tab.
          </p>
          <Button asChild variant="outline">
            <Link to="/summer-slam">Back to Summer Slam</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
