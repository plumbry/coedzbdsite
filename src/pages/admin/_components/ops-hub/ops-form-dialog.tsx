import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";

export type OpsFormField =
  | {
      key: string;
      label: string;
      type: "text" | "number" | "date" | "textarea";
      placeholder?: string;
      required?: boolean;
    }
  | {
      key: string;
      label: string;
      type: "select";
      options: { value: string; label: string }[];
      required?: boolean;
    };

type OpsFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: OpsFormField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
};

export function OpsFormDialog({
  open,
  onOpenChange,
  title,
  fields,
  values,
  onChange,
  onSubmit,
  isSubmitting,
  submitLabel = "Save",
}: OpsFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`ops-field-${field.key}`}>{field.label}</Label>
              {field.type === "textarea" ? (
                <Textarea
                  id={`ops-field-${field.key}`}
                  value={values[field.key] ?? ""}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={4}
                />
              ) : field.type === "select" ? (
                <Select
                  value={values[field.key] ?? ""}
                  onValueChange={(v) => onChange(field.key, v)}
                >
                  <SelectTrigger id={`ops-field-${field.key}`} className="w-full">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`ops-field-${field.key}`}
                  type={field.type}
                  value={values[field.key] ?? ""}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button className="cursor-pointer" onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function emptyFormValues(fields: OpsFormField[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, ""]));
}

export function rowToFormValues(
  row: Record<string, unknown>,
  fields: OpsFormField[],
): Record<string, string> {
  return Object.fromEntries(
    fields.map((f) => {
      const val = row[f.key];
      return [f.key, val === undefined || val === null ? "" : String(val)];
    }),
  );
}
