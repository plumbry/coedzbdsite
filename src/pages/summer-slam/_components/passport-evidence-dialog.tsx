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
  IMAGE_UPLOAD_HELPER,
  type EvidenceType,
} from "./passport-types.ts";

type QuestForDialog = {
  title: string;
  evidenceInstructions?: string;
};

function EvidenceFormFields({
  quest,
  evidenceType,
  evidenceUrl,
  notes,
  selectedFiles,
  onEvidenceTypeChange,
  onEvidenceUrlChange,
  onNotesChange,
  onFilesChange,
}: {
  quest: QuestForDialog | undefined;
  evidenceType: EvidenceType;
  evidenceUrl: string;
  notes: string;
  selectedFiles: File[];
  onEvidenceTypeChange: (type: EvidenceType) => void;
  onEvidenceUrlChange: (url: string) => void;
  onNotesChange: (notes: string) => void;
  onFilesChange: (files: FileList | null) => void;
}) {
  return (
    <div className="space-y-4">
      {quest?.evidenceInstructions && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">What we need</p>
          <p className="mt-1 text-sm text-amber-950">{quest.evidenceInstructions}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label>Evidence Type</Label>
        <Select
          value={evidenceType}
          onValueChange={(value) => onEvidenceTypeChange(value as EvidenceType)}
        >
          <SelectTrigger className="min-h-11 touch-manipulation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="image">Screenshot Upload</SelectItem>
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

      {evidenceType === "image" ? (
        <div className="space-y-2">
          <Label>Screenshot Upload</Label>
          <Input
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            multiple
            className="min-h-11 touch-manipulation"
            onChange={(event) => onFilesChange(event.target.files)}
          />
          <p className="text-xs text-muted-foreground">{IMAGE_UPLOAD_HELPER}</p>
          {selectedFiles.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {selectedFiles.map((file) => file.name).join(", ")}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Evidence Link</Label>
          <Input
            value={evidenceUrl}
            onChange={(event) => onEvidenceUrlChange(event.target.value)}
            placeholder="https://..."
            className="min-h-11 touch-manipulation"
          />
        </div>
      )}

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
  selectedFiles,
  isSubmitting,
  onEvidenceTypeChange,
  onEvidenceUrlChange,
  onNotesChange,
  onFilesChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  quest: QuestForDialog | undefined;
  evidenceType: EvidenceType;
  evidenceUrl: string;
  notes: string;
  selectedFiles: File[];
  isSubmitting: boolean;
  onEvidenceTypeChange: (type: EvidenceType) => void;
  onEvidenceUrlChange: (url: string) => void;
  onNotesChange: (notes: string) => void;
  onFilesChange: (files: FileList | null) => void;
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
            selectedFiles={selectedFiles}
            onEvidenceTypeChange={onEvidenceTypeChange}
            onEvidenceUrlChange={onEvidenceUrlChange}
            onNotesChange={onNotesChange}
            onFilesChange={onFilesChange}
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
          selectedFiles={selectedFiles}
          onEvidenceTypeChange={onEvidenceTypeChange}
          onEvidenceUrlChange={onEvidenceUrlChange}
          onNotesChange={onNotesChange}
          onFilesChange={onFilesChange}
        />
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
