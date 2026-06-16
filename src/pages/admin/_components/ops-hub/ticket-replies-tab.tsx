import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.js";
import { opsMutationArgs, opsQueryArgs, type OpsHubTabProps } from "./types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Check, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  OpsFormDialog,
  emptyFormValues,
  rowToFormValues,
  type OpsFormField,
} from "./ops-form-dialog.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";

const TEMPLATE_FIELDS: OpsFormField[] = [
  { key: "category", label: "Category", type: "text", required: true },
  { key: "situation", label: "Situation", type: "text", required: true },
  { key: "responseText", label: "Response text", type: "textarea", required: true },
];

export default function TicketRepliesTab({ viewerToken, canEdit = false }: OpsHubTabProps) {
  const templates = useQuery(
    api.opsHub.queries.listTicketReplyTemplates,
    opsQueryArgs(viewerToken),
  );
  const create = useMutation(api.opsHub.mutations.createTicketReplyTemplate);
  const update = useMutation(api.opsHub.mutations.updateTicketReplyTemplate);
  const remove = useMutation(api.opsHub.mutations.deleteTicketReplyTemplate);

  const [category, setCategory] = useState<string>("");
  const [situation, setSituation] = useState<string>("");
  const [outputText, setOutputText] = useState("");
  const [copied, setCopied] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"opsHubTicketReplyTemplates"> | null>(null);
  const [values, setValues] = useState(() => emptyFormValues(TEMPLATE_FIELDS));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<Doc<"opsHubTicketReplyTemplates"> | null>(null);

  const categories = useMemo(() => {
    if (!templates) return [];
    return [...new Set(templates.map((t) => t.category))].sort();
  }, [templates]);

  const situations = useMemo(() => {
    if (!templates || !category) return [];
    return [
      ...new Set(
        templates.filter((t) => t.category === category).map((t) => t.situation),
      ),
    ].sort();
  }, [templates, category]);

  const selectedTemplate = useMemo(() => {
    if (!templates || !category || !situation) return null;
    return (
      templates.find((t) => t.category === category && t.situation === situation) ??
      null
    );
  }, [templates, category, situation]);

  const loadTemplate = (template: Doc<"opsHubTicketReplyTemplates">) => {
    setCategory(template.category);
    setSituation(template.situation);
    setOutputText(template.responseText);
  };

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    setSituation("");
    setOutputText("");
  };

  const handleSituationChange = (value: string) => {
    setSituation(value);
    const match = templates?.find(
      (t) => t.category === category && t.situation === value,
    );
    setOutputText(match?.responseText ?? "");
  };

  const handleCopy = async () => {
    if (!outputText.trim()) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setValues(emptyFormValues(TEMPLATE_FIELDS));
    setDialogOpen(true);
  };

  const openEdit = () => {
    if (!selectedTemplate) return;
    setEditing(selectedTemplate);
    setValues(rowToFormValues(selectedTemplate, TEMPLATE_FIELDS));
    setDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!values.category.trim() || !values.situation.trim() || !values.responseText.trim()) {
      toast.error("All fields are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        category: values.category.trim(),
        situation: values.situation.trim(),
        responseText: values.responseText.trim(),
      };
      if (editing) {
        await update(opsMutationArgs(viewerToken, { id: editing._id, ...payload }));
        toast.success("Template updated");
      } else {
        await create(opsMutationArgs(viewerToken, payload));
        toast.success("Template saved");
      }
      setDialogOpen(false);
      if (payload.category === category && payload.situation === situation) {
        setOutputText(payload.responseText);
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove(
        opsMutationArgs(viewerToken, {
          id: deleteTarget._id as Id<"opsHubTicketReplyTemplates">,
        }),
      );
      toast.success("Template deleted");
      if (
        deleteTarget.category === category &&
        deleteTarget.situation === situation
      ) {
        setSituation("");
        setOutputText("");
      }
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  };

  if (templates === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Standard Ticket Replies</h3>
          <p className="text-xs text-muted-foreground">
            Pick a category and situation, edit the response, then copy to clipboard.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" className="cursor-pointer shrink-0" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            New template
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Generate reply</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Situation</Label>
              <Select
                value={situation}
                onValueChange={handleSituationChange}
                disabled={!category}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select situation…" />
                </SelectTrigger>
                <SelectContent>
                  {situations.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Response (editable)</Label>
            <Textarea
              value={outputText}
              onChange={(e) => setOutputText(e.target.value)}
              rows={8}
              placeholder="Select a template or create a new one…"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              className="cursor-pointer"
              onClick={handleCopy}
              disabled={!outputText.trim()}
            >
              {copied ? (
                <Check className="h-4 w-4 mr-1.5 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 mr-1.5" />
              )}
              Copy
            </Button>
            {selectedTemplate && canEdit && (
              <>
                <Button variant="outline" className="cursor-pointer" onClick={openEdit}>
                  <Pencil className="h-4 w-4 mr-1.5" />
                  Edit template
                </Button>
                <Button
                  variant="outline"
                  className="cursor-pointer text-destructive"
                  onClick={() => setDeleteTarget(selectedTemplate)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {templates.length > 0 && (
        <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
          {templates.map((t) => (
            <button
              key={t._id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer"
              onClick={() => loadTemplate(t)}
            >
              <span className="font-medium">{t.category}</span>
              <span className="text-muted-foreground"> · {t.situation}</span>
            </button>
          ))}
        </div>
      )}

      <OpsFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit template" : "New template"}
        fields={TEMPLATE_FIELDS}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSaveTemplate}
        isSubmitting={saving}
        submitLabel="Save template"
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.category} · {deleteTarget?.situation}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction className="cursor-pointer" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
