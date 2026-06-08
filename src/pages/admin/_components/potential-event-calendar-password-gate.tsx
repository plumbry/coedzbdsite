import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { ConvexError } from "convex/values";
import AuthGate from "@/components/auth-gate.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { CalendarDays } from "lucide-react";

interface PotentialEventCalendarPasswordGateProps {
  onUnlock: (token: string) => void;
  showStaffSignIn?: boolean;
}

export default function PotentialEventCalendarPasswordGate({
  onUnlock,
  showStaffSignIn = false,
}: PotentialEventCalendarPasswordGateProps) {
  const createSession = useMutation(
    api.potentialEventCalendar.viewerAuth.createViewerSession,
  );
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
      title="Event Calendar"
      description="Enter the view password to see the planning calendar. This access is read-only."
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-left">
        <div className="space-y-2">
          <Label htmlFor="event-calendar-view-password">Password</Label>
          <Input
            id="event-calendar-view-password"
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
          <CalendarDays className="mr-2 h-4 w-4" />
          {isSubmitting ? "Checking..." : "View event calendar"}
        </Button>
      </form>
      {showStaffSignIn && (
        <div className="pt-4 border-t space-y-2 text-center">
          <p className="text-xs text-muted-foreground">Event mods and admins</p>
          <SignInButton
            variant="outline"
            className="cursor-pointer"
            signInText="Sign in to manage events"
          />
        </div>
      )}
    </AuthGate>
  );
}
