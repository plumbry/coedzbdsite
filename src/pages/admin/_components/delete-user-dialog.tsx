import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton.tsx";

interface DeleteUserDialogProps {
  userId: Id<"users"> | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

function userLabel(user: {
  username?: string;
  name?: string;
  email?: string;
  _id: Id<"users">;
}): string {
  return user.username || user.name || user.email || user._id;
}

export default function DeleteUserDialog({
  userId,
  onOpenChange,
  onDeleted,
}: DeleteUserDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const preview = useQuery(
    api.users.previewUserDelete,
    userId ? { userId } : "skip",
  );
  const deleteUser = useMutation(api.users.deleteUser);

  const handleDelete = async () => {
    if (!userId) return;

    setIsDeleting(true);
    try {
      await deleteUser({ userId });
      toast.success("Account deleted. The user can sign in again to create a fresh account.");
      onOpenChange(false);
      onDeleted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={userId !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this account?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              {preview === undefined ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <>
                  <p>
                    This removes{" "}
                    <span className="font-medium text-foreground">
                      {userLabel(preview.user)}
                    </span>{" "}
                    from the site. They can sign in again afterward and a new account
                    will be created automatically.
                  </p>
                  {preview.user.isLegacy && (
                    <p>
                      This is a legacy pre-migration account. Deleting it is usually
                      the right way to clear a duplicate when you are keeping the
                      Clerk-linked account instead.
                    </p>
                  )}
                  {preview.referenceTotal > 0 && (
                    <p>
                      {preview.referenceTotal} linked site record
                      {preview.referenceTotal === 1 ? "" : "s"} will remain in history
                      but will no longer point to a live account.
                    </p>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting || preview === undefined}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete account"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
