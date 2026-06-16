import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.js";
import { OpsDataTable } from "./ops-data-table.tsx";
import {
  OpsFormDialog,
  emptyFormValues,
  rowToFormValues,
  type OpsFormField,
} from "./ops-form-dialog.tsx";
import { opsMutationArgs, opsQueryArgs, type OpsHubTabProps } from "./types.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { toast } from "sonner";
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

const RULE_TYPE_LABELS: Record<string, string> = {
  rule_set: "Rule set",
  event_override: "Event override",
  prize: "Prize rules",
  lobby: "Lobby rules",
  drop_spot: "Drop spot / contest",
};

const FIELDS: OpsFormField[] = [
  { key: "name", label: "Name", type: "text", required: true },
  {
    key: "ruleType",
    label: "Type",
    type: "select",
    required: true,
    options: Object.entries(RULE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
  },
  { key: "eventName", label: "Event (for overrides)", type: "text" },
  { key: "content", label: "Rules content", type: "textarea", required: true },
  { key: "notes", label: "Notes", type: "textarea" },
];

export default function EventRulesTab({ viewerToken, canEdit = false }: OpsHubTabProps) {
  const data = useQuery(api.opsHub.queries.listEventRules, opsQueryArgs(viewerToken));
  const create = useMutation(api.opsHub.mutations.createEventRule);
  const update = useMutation(api.opsHub.mutations.updateEventRule);
  const remove = useMutation(api.opsHub.mutations.deleteEventRule);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"opsHubEventRules"> | null>(null);
  const [values, setValues] = useState(() => emptyFormValues(FIELDS));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doc<"opsHubEventRules"> | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filteredData =
    data && typeFilter !== "all"
      ? data.filter((r) => r.ruleType === typeFilter)
      : data;

  const openCreate = () => {
    setEditing(null);
    setValues({ ...emptyFormValues(FIELDS), ruleType: "rule_set" });
    setDialogOpen(true);
  };

  const openEdit = (row: Doc<"opsHubEventRules">) => {
    setEditing(row);
    setValues(rowToFormValues(row, FIELDS));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!values.name.trim() || !values.content.trim()) {
      toast.error("Name and content are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: values.name.trim(),
        ruleType: values.ruleType as Doc<"opsHubEventRules">["ruleType"],
        eventName: values.eventName.trim() || undefined,
        content: values.content.trim(),
        notes: values.notes.trim() || undefined,
      };
      if (editing) {
        await update(opsMutationArgs(viewerToken, { id: editing._id, ...payload }));
        toast.success("Rule updated");
      } else {
        await create(opsMutationArgs(viewerToken, payload));
        toast.success("Rule added");
      }
      setDialogOpen(false);
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
        opsMutationArgs(viewerToken, { id: deleteTarget._id as Id<"opsHubEventRules"> }),
      );
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer ${
            typeFilter === "all" ? "bg-primary text-primary-foreground" : ""
          }`}
          onClick={() => setTypeFilter("all")}
        >
          All
        </button>
        {Object.entries(RULE_TYPE_LABELS).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer ${
              typeFilter === value ? "bg-primary text-primary-foreground" : ""
            }`}
            onClick={() => setTypeFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <OpsDataTable
        title="Event Rules"
        description="Reusable rule sets, event overrides, prize/lobby/drop rules."
        data={filteredData}
        searchPlaceholder="Search rules…"
        onAdd={canEdit ? openCreate : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onDelete={canEdit ? setDeleteTarget : undefined}
        columns={[
          {
            key: "name",
            header: "Name",
            searchValue: (r) => r.name,
            render: (r) => <span className="font-medium">{r.name}</span>,
          },
          {
            key: "type",
            header: "Type",
            render: (r) => (
              <Badge variant="secondary" className="text-xs">
                {RULE_TYPE_LABELS[r.ruleType]}
              </Badge>
            ),
          },
          {
            key: "event",
            header: "Event",
            searchValue: (r) => r.eventName ?? "",
            render: (r) => r.eventName ?? "—",
          },
          {
            key: "content",
            header: "Content",
            searchValue: (r) => r.content,
            render: (r) => (
              <span className="line-clamp-2 text-xs max-w-xs">{r.content}</span>
            ),
          },
        ]}
      />

      <OpsFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit rule" : "Add rule"}
        fields={FIELDS}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSave}
        isSubmitting={saving}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes &quot;{deleteTarget?.name}&quot;.
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
    </>
  );
}
