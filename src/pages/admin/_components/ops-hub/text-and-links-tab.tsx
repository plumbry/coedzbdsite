import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.js";
import { opsMutationArgs, opsQueryArgs, type OpsHubTabProps } from "./types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Check,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Link2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
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

type ResourceLinkType = "spreadsheet" | "form" | "doc" | "other";

const LINK_TYPE_OPTIONS: { value: ResourceLinkType; label: string }[] = [
  { value: "spreadsheet", label: "Spreadsheet" },
  { value: "form", label: "Google Form" },
  { value: "doc", label: "Document" },
  { value: "other", label: "Other" },
];

const LINK_FIELDS: OpsFormField[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "url", label: "URL", type: "text", required: true, placeholder: "https://..." },
  {
    key: "linkType",
    label: "Type",
    type: "select",
    required: true,
    options: LINK_TYPE_OPTIONS,
  },
  { key: "description", label: "Description", type: "textarea" },
];

function linkTypeLabel(type: ResourceLinkType) {
  return LINK_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function LinkTypeIcon({
  type,
  className,
}: {
  type: ResourceLinkType;
  className?: string;
}) {
  const props = { className: cn("h-4 w-4 shrink-0", className) };
  switch (type) {
    case "spreadsheet":
      return <FileSpreadsheet {...props} />;
    case "form":
      return <FileText {...props} />;
    case "doc":
      return <FileText {...props} />;
    default:
      return <Link2 {...props} />;
  }
}

export default function TextAndLinksTab({ viewerToken, canEdit = false }: OpsHubTabProps) {
  const templates = useQuery(
    api.opsHub.queries.listTicketReplyTemplates,
    opsQueryArgs(viewerToken),
  );
  const links = useQuery(api.opsHub.queries.listResourceLinks, opsQueryArgs(viewerToken));
  const createTemplate = useMutation(api.opsHub.mutations.createTicketReplyTemplate);
  const updateTemplate = useMutation(api.opsHub.mutations.updateTicketReplyTemplate);
  const removeTemplate = useMutation(api.opsHub.mutations.deleteTicketReplyTemplate);
  const createLink = useMutation(api.opsHub.mutations.createResourceLink);
  const updateLink = useMutation(api.opsHub.mutations.updateResourceLink);
  const removeLink = useMutation(api.opsHub.mutations.deleteResourceLink);

  const [category, setCategory] = useState<string>("");
  const [situation, setSituation] = useState<string>("");
  const [outputText, setOutputText] = useState("");
  const [copied, setCopied] = useState(false);

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<Doc<"opsHubTicketReplyTemplates"> | null>(null);
  const [templateValues, setTemplateValues] = useState(() => emptyFormValues(TEMPLATE_FIELDS));
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [deleteTemplateTarget, setDeleteTemplateTarget] =
    useState<Doc<"opsHubTicketReplyTemplates"> | null>(null);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<Doc<"opsHubResourceLinks"> | null>(null);
  const [linkValues, setLinkValues] = useState<Record<string, string>>(() => ({
    ...emptyFormValues(LINK_FIELDS),
    linkType: "spreadsheet",
  }));
  const [savingLink, setSavingLink] = useState(false);
  const [deleteLinkTarget, setDeleteLinkTarget] =
    useState<Doc<"opsHubResourceLinks"> | null>(null);

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

  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateValues(emptyFormValues(TEMPLATE_FIELDS));
    setTemplateDialogOpen(true);
  };

  const openEditTemplate = () => {
    if (!selectedTemplate) return;
    setEditingTemplate(selectedTemplate);
    setTemplateValues(rowToFormValues(selectedTemplate, TEMPLATE_FIELDS));
    setTemplateDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (
      !templateValues.category.trim() ||
      !templateValues.situation.trim() ||
      !templateValues.responseText.trim()
    ) {
      toast.error("All fields are required");
      return;
    }
    setSavingTemplate(true);
    try {
      const payload = {
        category: templateValues.category.trim(),
        situation: templateValues.situation.trim(),
        responseText: templateValues.responseText.trim(),
      };
      if (editingTemplate) {
        await updateTemplate(
          opsMutationArgs(viewerToken, { id: editingTemplate._id, ...payload }),
        );
        toast.success("Template updated");
      } else {
        await createTemplate(opsMutationArgs(viewerToken, payload));
        toast.success("Template saved");
      }
      setTemplateDialogOpen(false);
      if (payload.category === category && payload.situation === situation) {
        setOutputText(payload.responseText);
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deleteTemplateTarget) return;
    try {
      await removeTemplate(
        opsMutationArgs(viewerToken, {
          id: deleteTemplateTarget._id as Id<"opsHubTicketReplyTemplates">,
        }),
      );
      toast.success("Template deleted");
      if (
        deleteTemplateTarget.category === category &&
        deleteTemplateTarget.situation === situation
      ) {
        setSituation("");
        setOutputText("");
      }
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteTemplateTarget(null);
    }
  };

  const openCreateLink = () => {
    setEditingLink(null);
    setLinkValues({ ...emptyFormValues(LINK_FIELDS), linkType: "spreadsheet" });
    setLinkDialogOpen(true);
  };

  const openEditLink = (link: Doc<"opsHubResourceLinks">) => {
    setEditingLink(link);
    setLinkValues({
      ...rowToFormValues(link, LINK_FIELDS),
      linkType: link.linkType,
    });
    setLinkDialogOpen(true);
  };

  const handleSaveLink = async () => {
    if (!linkValues.title.trim() || !linkValues.url.trim() || !linkValues.linkType) {
      toast.error("Title, URL, and type are required");
      return;
    }
    setSavingLink(true);
    try {
      const payload = {
        title: linkValues.title.trim(),
        url: linkValues.url.trim(),
        linkType: linkValues.linkType as ResourceLinkType,
        description: linkValues.description.trim() || undefined,
      };
      if (editingLink) {
        await updateLink(opsMutationArgs(viewerToken, { id: editingLink._id, ...payload }));
        toast.success("Link updated");
      } else {
        await createLink(opsMutationArgs(viewerToken, payload));
        toast.success("Link added");
      }
      setLinkDialogOpen(false);
    } catch {
      toast.error("Failed to save link");
    } finally {
      setSavingLink(false);
    }
  };

  const handleDeleteLink = async () => {
    if (!deleteLinkTarget) return;
    try {
      await removeLink(
        opsMutationArgs(viewerToken, {
          id: deleteLinkTarget._id as Id<"opsHubResourceLinks">,
        }),
      );
      toast.success("Link deleted");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteLinkTarget(null);
    }
  };

  if (templates === undefined || links === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Ticket reply templates</h3>
            <p className="text-xs text-muted-foreground">
              Pick a category and situation, edit the response, then copy to clipboard.
            </p>
          </div>
          {canEdit && (
            <Button size="sm" className="cursor-pointer shrink-0" onClick={openCreateTemplate}>
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
                  <Button
                    variant="outline"
                    className="cursor-pointer"
                    onClick={openEditTemplate}
                  >
                    <Pencil className="h-4 w-4 mr-1.5" />
                    Edit template
                  </Button>
                  <Button
                    variant="outline"
                    className="cursor-pointer text-destructive"
                    onClick={() => setDeleteTemplateTarget(selectedTemplate)}
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
      </section>

      <section className="space-y-4 border-t pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Quick links</h3>
            <p className="text-xs text-muted-foreground">
              Spreadsheets, Google Forms, docs, and other frequently used resources.
            </p>
          </div>
          {canEdit && (
            <Button size="sm" className="cursor-pointer shrink-0" onClick={openCreateLink}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add link
            </Button>
          )}
        </div>

        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center border rounded-md">
            No links yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {links.map((link) => (
              <Card key={link._id} className="gap-0 py-0">
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <LinkTypeIcon type={link.linkType} className="mt-0.5 text-muted-foreground" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium leading-tight hover:underline inline-flex items-center gap-1 min-w-0"
                        >
                          <span className="truncate">{link.title}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                        </a>
                        {canEdit && (
                          <div className="flex shrink-0 -mr-1 -mt-0.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 cursor-pointer"
                              onClick={() => openEditLink(link)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive cursor-pointer"
                              onClick={() => setDeleteLinkTarget(link)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] font-normal h-5 px-1.5">
                        {linkTypeLabel(link.linkType)}
                      </Badge>
                      {link.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {link.description}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <OpsFormDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        title={editingTemplate ? "Edit template" : "New template"}
        fields={TEMPLATE_FIELDS}
        values={templateValues}
        onChange={(k, v) => setTemplateValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSaveTemplate}
        isSubmitting={savingTemplate}
        submitLabel="Save template"
      />

      <OpsFormDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        title={editingLink ? "Edit link" : "Add link"}
        fields={LINK_FIELDS}
        values={linkValues}
        onChange={(k, v) => setLinkValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSaveLink}
        isSubmitting={savingLink}
        submitLabel="Save link"
      />

      <AlertDialog
        open={!!deleteTemplateTarget}
        onOpenChange={() => setDeleteTemplateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTemplateTarget?.category} · {deleteTemplateTarget?.situation}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction className="cursor-pointer" onClick={handleDeleteTemplate}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteLinkTarget} onOpenChange={() => setDeleteLinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete link?</AlertDialogTitle>
            <AlertDialogDescription>{deleteLinkTarget?.title}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction className="cursor-pointer" onClick={handleDeleteLink}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
