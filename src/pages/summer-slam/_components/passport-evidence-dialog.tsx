import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { QuestMarkdown } from "./quest-markdown.tsx";
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

export const MAX_EVIDENCE_LINKS = 5;

type QuestForDialog = {
  title: string;
  evidenceInstructions?: string;
  evidenceInput?: "image" | "link";
};

function EvidenceFormFields({
  quest,
  evidenceType,
  evidenceUrls,
  notes,
  onEvidenceTypeChange,
  onEvidenceUrlChange,
  onAddEvidenceUrl,
  onRemoveEvidenceUrl,
  onNotesChange,
}: {
  quest: QuestForDialog | undefined;
  evidenceType: EvidenceType;
  evidenceUrls: string[];
  notes: string;
  onEvidenceTypeChange: (type: EvidenceType) => void;
  onEvidenceUrlChange: (index: number, url: string) => void;
  onAddEvidenceUrl: () => void;
  onRemoveEvidenceUrl: (index: number) => void;
  onNotesChange: (notes: string) => void;
}) {
  const lockedInput = quest?.evidenceInput;
  const showScreenshotHelper =
    lockedInput === "image" || evidenceType === "screenshot_link" || evidenceType === "image";
  const linkLabel = lockedInput === "image" ? "Screenshot Link" : "Evidence Link";
  const canAddLink = evidenceUrls.length < MAX_EVIDENCE_LINKS;

  return (
    <div className="space-y-4">
      {quest?.evidenceInstructions && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">What we need</p>
          <QuestMarkdown className="mt-1 text-amber-950">{quest.evidenceInstructions}</QuestMarkdown>
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

      <div className="space-y-3">
        {evidenceUrls.map((url, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`evidence-url-${index}`}>
                {evidenceUrls.length > 1 ? `${linkLabel} ${index + 1}` : linkLabel}
              </Label>
              {evidenceUrls.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground touch-manipulation hover:text-destructive"
                  onClick={() => onRemoveEvidenceUrl(index)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Remove
                </Button>
              ) : null}
            </div>
            <Input
              id={`evidence-url-${index}`}
              value={url}
              onChange={(event) => onEvidenceUrlChange(index, event.target.value)}
              placeholder="https://..."
              className="min-h-11 touch-manipulation"
            />
          </div>
        ))}

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

        {canAddLink ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 w-full touch-manipulation"
            onClick={onAddEvidenceUrl}
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Add another link
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            You can add up to {MAX_EVIDENCE_LINKS} links per submission.
          </p>
        )}
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
  evidenceUrls,
  notes,
  isSubmitting,
  onEvidenceTypeChange,
  onEvidenceUrlChange,
  onAddEvidenceUrl,
  onRemoveEvidenceUrl,
  onNotesChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  quest: QuestForDialog | undefined;
  evidenceType: EvidenceType;
  evidenceUrls: string[];
  notes: string;
  isSubmitting: boolean;
  onEvidenceTypeChange: (type: EvidenceType) => void;
  onEvidenceUrlChange: (index: number, url: string) => void;
  onAddEvidenceUrl: () => void;
  onRemoveEvidenceUrl: (index: number) => void;
  onNotesChange: (notes: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isMobile = useIsMobile();

  const formFields = (
    <EvidenceFormFields
      quest={quest}
      evidenceType={evidenceType}
      evidenceUrls={evidenceUrls}
      notes={notes}
      onEvidenceTypeChange={onEvidenceTypeChange}
      onEvidenceUrlChange={onEvidenceUrlChange}
      onAddEvidenceUrl={onAddEvidenceUrl}
      onRemoveEvidenceUrl={onRemoveEvidenceUrl}
      onNotesChange={onNotesChange}
    />
  );

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
          {formFields}
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
        {formFields}
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
