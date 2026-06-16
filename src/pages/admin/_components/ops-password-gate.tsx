import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { ConvexError } from "convex/values";
import AuthGate from "@/components/auth-gate.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { LayoutDashboard } from "lucide-react";

interface OpsPasswordGateProps {
  onUnlock: (token: string) => void;
  showStaffSignIn?: boolean;
}

export default function OpsPasswordGate({
  onUnlock,
  showStaffSignIn = false,
}: OpsPasswordGateProps) {
  const createSession = useMutation(api.eventBans.viewerAuth.createViewerSession);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { token } = await createSession({ password });
      onUnlock(token);
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { message?: string };
        setError(data.message ?? "Could not sign in");
      } else {
        setError("Could not sign in. Try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthGate
      title="Staff Resources"
      description="Enter the same view password used for Event Bans, or sign in with a mod or admin account."
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-left">
        <div className="space-y-2">
          <Label htmlFor="ops-hub-password">Password</Label>
          <Input
            id="ops-hub-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
            className="h-10"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="submit"
          className="w-full cursor-pointer"
          disabled={isSubmitting || !password.trim()}
        >
          <LayoutDashboard className="mr-2 h-4 w-4" />
          {isSubmitting ? "Checking..." : "Unlock resources"}
        </Button>
      </form>
      {showStaffSignIn && (
        <div className="pt-4 border-t space-y-2 text-center">
          <p className="text-xs text-muted-foreground">Site administrators</p>
          <SignInButton
            variant="outline"
            className="cursor-pointer"
            signInText="Sign in with admin account"
          />
        </div>
      )}
    </AuthGate>
  );
}
