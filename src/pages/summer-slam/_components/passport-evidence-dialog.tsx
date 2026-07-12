import { Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import {
  CLIP_LINK_HELPER,
  SCREENSHOT_LINK_HELPER,
  type EvidenceType,
} from "./passport-types.ts";

type QuestForDialog = {
  title: string;
  evidenceInstructions?: string;
  evidenceInput?: "image" | "link";
};

function EvidenceFormFields({
  quest,
  evidenceType,
  evidenceUrl,
  notes,
  onEvidenceTypeChange,
  onEvidenceUrlChange,
  onNotesChange,
}: {
  quest: QuestForDialog | undefined;
  evidenceType: EvidenceType;
  evidenceUrl: string;
  notes: string;
  onEvidenceTypeChange: (type: EvidenceType) => void;
  onEvidenceUrlChange: (url: string) => void;
  onNotesChange: (notes: string) => void;
}) {
  const lockedInput = quest?.evidenceInput;
  const showScreenshotHelper =
    lockedInput === "image" || evidenceType === "screenshot_link" || evidenceType === "image";

  return (
    <div className="space-y-4">
      {quest?.evidenceInstructions && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">What we need</p>
          <p className="mt-1 text-sm text-amber-950">{quest.evidenceInstructions}</p>
        </div>
      )}

      {!lockedInput ? (
        <div className="space-y-2">
          <Label>Evidence Type</Label>
          <Select
            value={evidenceType === "image" ? "screenshot_link" : evidenceType}
            onValueChange={(value) => onEvidenceTypeChange(value as EvidenceType)}
          >
            <SelectTrigger className="min-h-11 touch-manipulation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="screenshot_link">Screenshot Link</SelectItem>
              <SelectItem value="clip_link">Clip Link</SelectItem>
              <SelectItem value="yunite_link">Yunite Link</SelectItem>
              <SelectItem value="social_link">Social Media Link</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          {evidenceType === "clip_link" && (
            <p className="text-xs text-muted-foreground">{CLIP_LINK_HELPER}</p>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>{lockedInput === "image" ? "Screenshot Link" : "Evidence Link"}</Label>
        <Input
          value={evidenceUrl}
          onChange={(event) => onEvidenceUrlChange(event.target.value)}
          placeholder="https://..."
          className="min-h-11 touch-manipulation"
        />
        {showScreenshotHelper ? (
          <p className="text-xs text-muted-foreground">
            {SCREENSHOT_LINK_HELPER}{" "}
            <a
              href="https://postimages.org/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline"
            >
              Open Postimages
            </a>
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Add context for reviewers..."
        />
      </div>
    </div>
  );
}

export function PassportEvidenceDialog({
  open,
  quest,
  evidenceType,
  evidenceUrl,
  notes,
  isSubmitting,
  onEvidenceTypeChange,
  onEvidenceUrlChange,
  onNotesChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  quest: QuestForDialog | undefined;
  evidenceType: EvidenceType;
  evidenceUrl: string;
  notes: string;
  isSubmitting: boolean;
  onEvidenceTypeChange: (type: EvidenceType) => void;
  onEvidenceUrlChange: (url: string) => void;
  onNotesChange: (notes: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isMobile = useIsMobile();

  const actions = (
    <>
      <Button variant="outline" onClick={onClose} className="min-h-11 touch-manipulation">
        Cancel
      </Button>
      <Button onClick={onSubmit} disabled={isSubmitting} className="min-h-11 touch-manipulation">
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Submit for Review
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(next) => !next && onClose()} direction="bottom">
        <DrawerContent className="max-h-[92vh] overflow-y-auto px-4 pb-6">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="text-xl">Submit Evidence</DrawerTitle>
            <DrawerDescription>{quest?.title}</DrawerDescription>
          </DrawerHeader>
          <EvidenceFormFields
            quest={quest}
            evidenceType={evidenceType}
            evidenceUrl={evidenceUrl}
            notes={notes}
            onEvidenceTypeChange={onEvidenceTypeChange}
            onEvidenceUrlChange={onEvidenceUrlChange}
            onNotesChange={onNotesChange}
          />
          <DrawerFooter className="gap-2 px-0">{actions}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Submit Evidence</DialogTitle>
          <DialogDescription>{quest?.title}</DialogDescription>
        </DialogHeader>
        <EvidenceFormFields
          quest={quest}
          evidenceType={evidenceType}
          evidenceUrl={evidenceUrl}
          notes={notes}
          onEvidenceTypeChange={onEvidenceTypeChange}
          onEvidenceUrlChange={onEvidenceUrlChange}
          onNotesChange={onNotesChange}
        />
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
