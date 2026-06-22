import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Label } from "@/components/ui/label.tsx";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group.tsx";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type DuplicateUser = {
  _id: Id<"users">;
  name?: string;
  username?: string;
  email?: string;
  role?: "admin" | "event_mod" | "viewer" | "analytics";
  discordUserId?: string;
  discordUsername?: string;
  isClerkLinked: boolean;
  _creationTime: number;
};

interface MergeUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: readonly [DuplicateUser, DuplicateUser];
  onMerged?: () => void;
}

function roleLabel(role: DuplicateUser["role"]): string {
  if (role === "admin") return "Admin";
  if (role === "event_mod") return "Mod";
  if (role === "analytics") return "Analytics";
  return "Viewer";
}

function suggestPrimary(users: readonly [DuplicateUser, DuplicateUser]): DuplicateUser {
  return [...users].sort((a, b) => {
    if (a.isClerkLinked && !b.isClerkLinked) return -1;
    if (!a.isClerkLinked && b.isClerkLinked) return 1;
    if (a.username && !b.username) return -1;
    if (!a.username && b.username) return 1;
    return b._creationTime - a._creationTime;
  })[0];
}

function userLabel(user: {
  username?: string;
  name?: string;
  email?: string;
  _id: Id<"users">;
}): string {
  return user.username || user.name || user.email || user._id;
}

export default function MergeUsersDialog({
  open,
  onOpenChange,
  users,
  onMerged,
}: MergeUsersDialogProps) {
  const [primaryUserId, setPrimaryUserId] = useState<Id<"users">>(() =>
    suggestPrimary(users)._id,
  );
  const [isMerging, setIsMerging] = useState(false);

  const secondaryUserId = useMemo(
    () => (users[0]._id === primaryUserId ? users[1]._id : users[0]._id),
    [users, primaryUserId],
  );

  const preview = useQuery(
    api.userMerge.previewUserMerge,
    open ? { primaryUserId, secondaryUserId } : "skip",
  );
  const mergeUsers = useMutation(api.userMerge.mergeUsers);

  useEffect(() => {
    if (open) {
      setPrimaryUserId(suggestPrimary(users)._id);
    }
  }, [open, users]);

  const referenceTotal = preview
    ? Object.values(preview.referencesReassigned).reduce<number>(
        (sum, count) => sum + count,
        0,
      )
    : 0;

  const handleMerge = async () => {
    setIsMerging(true);
    try {
      const result = await mergeUsers({ primaryUserId, secondaryUserId });
      const reassigned = Object.values(result.referencesReassigned).reduce<number>(
        (sum, count) => sum + count,
        0,
      );
      toast.success(
        `Merged accounts. ${reassigned} linked record${reassigned === 1 ? "" : "s"} moved to the surviving account.`,
      );
      onOpenChange(false);
      onMerged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to merge users");
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge duplicate accounts</DialogTitle>
          <DialogDescription>
            Choose which account to keep. The other account will be deleted and its linked
            records moved to the surviving account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                Keep the account this person actually signs in with (usually the Clerk /
                Discord-linked one). Profile fields like username and role will be merged
                onto the surviving account.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Account to keep</Label>
            <RadioGroup
              value={primaryUserId}
              onValueChange={(value) => setPrimaryUserId(value as Id<"users">)}
            >
              {users.map((user) => (
                <label
                  key={user._id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
                >
                  <RadioGroupItem value={user._id} className="mt-1" />
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{userLabel(user)}</span>
                      <Badge variant="outline">{roleLabel(user.role)}</Badge>
                      {user.isClerkLinked ? (
                        <Badge variant="secondary">Clerk linked</Badge>
                      ) : (
                        <Badge variant="outline">Legacy</Badge>
                      )}
                      {user._id === suggestPrimary(users)._id && (
                        <Badge>Suggested</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {user.email || "No email"}
                      {user.discordUsername ? ` · Discord: ${user.discordUsername}` : ""}
                    </p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          {preview === undefined ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">Merge preview</p>
              <p className="mt-1 text-muted-foreground">
                Removing <span className="font-medium">{userLabel(preview.secondary)}</span>{" "}
                and moving {referenceTotal} linked record
                {referenceTotal === 1 ? "" : "s"} to{" "}
                <span className="font-medium">{userLabel(preview.primary)}</span>.
              </p>
              {preview.mergedRole && (
                <p className="mt-1 text-muted-foreground">
                  Surviving role: {roleLabel(preview.mergedRole)}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>
            Cancel
          </Button>
          <Button onClick={handleMerge} disabled={isMerging || preview === undefined}>
            {isMerging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Merging...
              </>
            ) : (
              "Merge accounts"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
