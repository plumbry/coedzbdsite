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
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { CheckCircle, XCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce.ts";

export default function EditUsernameDialog() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const [open, setOpen] = useState(false);
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

  const isValidFormat = /^[a-zA-Z0-9_]+$/.test(username.trim());
  const isValidLength = username.trim().length >= 3 && username.trim().length <= 20;
  const isAvailable = availability?.available === true;
  const canSubmit = isValidFormat && isValidLength && isAvailable && !isSubmitting;

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && currentUser?.username) {
      setUsername(currentUser.username);
    }
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError("");

    try {
      await setUsernameMutation({ username: username.trim() });
      toast.success("Username updated!");
      setOpen(false);
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

  if (!currentUser) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 cursor-pointer px-2 sm:px-3">
          <Pencil className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{currentUser.username ? "Edit Username" : "Set Username"}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit username</DialogTitle>
          <DialogDescription>
            Choose a new username. It must be unique.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-username">Username</Label>
            <div className="relative">
              <Input
                id="edit-username"
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

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="cursor-pointer"
              disabled={!canSubmit}
            >
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
