import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer.tsx";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { cn } from "@/lib/utils.ts";
import {
  PASSPORT_AVATARS,
  type PassportAvatarId,
} from "./passport-avatars.ts";

function AvatarGrid({
  previewId,
  savedId,
  onSelect,
}: {
  previewId: PassportAvatarId | null;
  savedId: PassportAvatarId | null | undefined;
  onSelect: (id: PassportAvatarId) => void;
}) {
  return (
    <ul className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {PASSPORT_AVATARS.map((avatar) => {
        const isSelected = previewId === avatar.id;
        const isSaved = savedId === avatar.id;
        return (
          <li key={avatar.id}>
            <button
              type="button"
              onClick={() => onSelect(avatar.id)}
              aria-pressed={isSelected}
              aria-label={`${avatar.label}${isSaved ? " (current)" : ""}`}
              className={cn(
                "group relative flex w-full flex-col items-center gap-1.5 rounded-xl p-1.5",
                "touch-manipulation transition-[transform,box-shadow] duration-150",
                "hover:scale-[1.04] hover:shadow-[0_6px_16px_rgba(14,165,233,0.15)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2",
                isSelected && "scale-[1.06] shadow-[0_8px_20px_rgba(14,165,233,0.22)]",
              )}
            >
              <span
                className={cn(
                  "relative flex h-[4.25rem] w-[4.25rem] items-center justify-center overflow-hidden rounded-full",
                  "border-2 border-white bg-gradient-to-b from-[#FFF8F0] to-[#F0FAFA]",
                  "shadow-sm transition-shadow duration-150 sm:h-[4.75rem] sm:w-[4.75rem]",
                  isSelected
                    ? "ring-[3px] ring-sky-500 ring-offset-2"
                    : "group-hover:shadow-md",
                )}
              >
                <img
                  src={avatar.image}
                  alt=""
                  width={76}
                  height={76}
                  className="h-full w-full object-cover"
                />
                {isSelected ? (
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center",
                      "rounded-full bg-sky-500 text-white shadow-sm",
                    )}
                    aria-hidden
                  >
                    <Check className="h-3 w-3 stroke-[3]" />
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate text-[10px] font-medium text-orange-900/70 sm:text-[11px]">
                {avatar.label}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function PassportAvatarPickerDialog({
  open,
  savedAvatarId,
  isSaving,
  onClose,
  onSave,
}: {
  open: boolean;
  savedAvatarId: PassportAvatarId | null | undefined;
  isSaving: boolean;
  onClose: () => void;
  onSave: (avatarId: PassportAvatarId) => void | Promise<void>;
}) {
  const isMobile = useIsMobile();
  const [previewId, setPreviewId] = useState<PassportAvatarId | null>(savedAvatarId ?? null);

  useEffect(() => {
    if (open) {
      setPreviewId(savedAvatarId ?? null);
    }
  }, [open, savedAvatarId]);

  const canSave = previewId != null && previewId !== savedAvatarId;

  const handleSave = () => {
    if (!previewId || !canSave) return;
    void onSave(previewId);
  };

  const body = (
    <>
      <AvatarGrid previewId={previewId} savedId={savedAvatarId} onSelect={setPreviewId} />
      {!savedAvatarId && previewId == null ? (
        <p className="text-center text-xs text-orange-800/55">Pick a collectible for your passport photo.</p>
      ) : null}
    </>
  );

  const actions = (
    <>
      <Button variant="outline" onClick={onClose} disabled={isSaving} className="min-h-11 touch-manipulation">
        Cancel
      </Button>
      <Button
        onClick={handleSave}
        disabled={!canSave || isSaving}
        className="min-h-11 touch-manipulation"
      >
        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(next) => !next && !isSaving && onClose()} direction="bottom">
        <DrawerContent className="max-h-[92vh] overflow-y-auto px-4 pb-6">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="font-display text-lg text-orange-950">Choose Your Avatar</DrawerTitle>
            <DrawerDescription>
              Select a Summer Slam collectible for your passport photo.
            </DrawerDescription>
          </DrawerHeader>
          <div className="py-2">{body}</div>
          <DrawerFooter className="gap-2 px-0">{actions}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !isSaving && onClose()}>
      <DialogContent size="md" className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-orange-950">Choose Your Avatar</DialogTitle>
          <DialogDescription>
            Select a Summer Slam collectible for your passport photo.
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
