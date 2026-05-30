import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { ConvexError } from "convex/values";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce.ts";

export default function UsernameSetupDialog() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const [username, setUsername] = useState("");
  const [debouncedUsername] = useDebounce(username, 500);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setUsernameMutation = useMutation(api.users.setUsername);

  const availability = useQuery(
    api.users.checkUsernameAvailable,
    debouncedUsername.trim().length >= 3
      ? { username: debouncedUsername.trim() }
      : "skip"
  );

  // Only show when user exists but has no username
  const isOpen = currentUser !== undefined && currentUser !== null && !currentUser.username;

  const isValidFormat = /^[a-zA-Z0-9_]+$/.test(username.trim());
  const isValidLength = username.trim().length >= 3 && username.trim().length <= 20;
  const isAvailable = availability?.available === true;
  const canSubmit = isValidFormat && isValidLength && isAvailable && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError("");

    try {
      await setUsernameMutation({ username: username.trim() });
      toast.success("Username set successfully!");
    } catch (err) {
      if (err instanceof ConvexError) {
        const { message } = err.data as { code: string; message: string };
        setError(message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Choose a username</DialogTitle>
          <DialogDescription>
            Pick a unique username for your account. You can change it later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <div className="relative">
              <Input
                id="username"
                placeholder="e.g. cool_player99"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
                maxLength={20}
                autoFocus
              />
              {username.trim().length >= 3 && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isAvailable && isValidFormat ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : availability !== undefined ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : null}
                </div>
              )}
            </div>

            {/* Validation hints */}
            <div className="space-y-1 text-xs">
              {username.trim().length > 0 && !isValidLength && (
                <p className="text-muted-foreground">Must be 3-20 characters</p>
              )}
              {username.trim().length >= 3 && !isValidFormat && (
                <p className="text-destructive">Only letters, numbers, and underscores allowed</p>
              )}
              {username.trim().length >= 3 && isValidFormat && availability?.available === false && (
                <p className="text-destructive">Username is already taken</p>
              )}
              {error && <p className="text-destructive">{error}</p>}
            </div>
          </div>

          <Button
            type="submit"
            className="w-full cursor-pointer"
            disabled={!canSubmit}
          >
            {isSubmitting ? "Setting username..." : "Set Username"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
