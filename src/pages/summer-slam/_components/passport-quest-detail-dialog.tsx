import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer.tsx";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { PassportQuestDetailContent } from "./passport-quest-detail-content.tsx";
import type { QuestEntry } from "./passport-types.ts";

export function PassportQuestDetailDialog({
  open,
  entry,
  onClose,
  onSubmitEvidence,
}: {
  open: boolean;
  entry: QuestEntry | null;
  onClose: () => void;
  onSubmitEvidence: () => void;
}) {
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!entry || !mounted) return null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(next) => !next && onClose()} direction="bottom">
        <DrawerContent className="max-h-[92vh] overflow-y-auto px-4 pb-6">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="sr-only">{entry.quest.title}</DrawerTitle>
            <DrawerDescription className="sr-only">{entry.quest.description}</DrawerDescription>
          </DrawerHeader>
          <PassportQuestDetailContent
            entry={entry}
            onClose={onClose}
            onSubmitEvidence={onSubmitEvidence}
            layout="sheet"
          />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">{entry.quest.title}</DialogTitle>
          <DialogDescription className="sr-only">{entry.quest.description}</DialogDescription>
        </DialogHeader>
        <PassportQuestDetailContent
          entry={entry}
          onClose={onClose}
          onSubmitEvidence={onSubmitEvidence}
        />
      </DialogContent>
    </Dialog>
  );
}
