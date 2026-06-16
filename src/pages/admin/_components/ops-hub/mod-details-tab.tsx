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

const FIELDS: OpsFormField[] = [
  { key: "modName", label: "Mod name", type: "text", required: true },
  { key: "discordId", label: "Discord ID", type: "text" },
  { key: "payPalDetails", label: "PayPal details", type: "text" },
  { key: "responsibilities", label: "Responsibilities", type: "textarea" },
  { key: "availabilityNotes", label: "Availability notes", type: "textarea" },
];

export default function ModDetailsTab({ viewerToken, canEdit = false }: OpsHubTabProps) {
  const data = useQuery(api.opsHub.queries.listModDetails, opsQueryArgs(viewerToken));
  const create = useMutation(api.opsHub.mutations.createModDetail);
  const update = useMutation(api.opsHub.mutations.updateModDetail);
  const remove = useMutation(api.opsHub.mutations.deleteModDetail);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"opsHubModDetails"> | null>(null);
  const [values, setValues] = useState(() => emptyFormValues(FIELDS));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doc<"opsHubModDetails"> | null>(null);

  const openCreate = () => {
    setEditing(null);
    setValues(emptyFormValues(FIELDS));
    setDialogOpen(true);
  };

  const openEdit = (row: Doc<"opsHubModDetails">) => {
    setEditing(row);
    setValues(rowToFormValues(row, FIELDS));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!values.modName.trim()) {
      toast.error("Mod name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        modName: values.modName.trim(),
        discordId: values.discordId.trim() || undefined,
        payPalDetails: values.payPalDetails.trim() || undefined,
        responsibilities: values.responsibilities.trim() || undefined,
        availabilityNotes: values.availabilityNotes.trim() || undefined,
      };
      if (editing) {
        await update(opsMutationArgs(viewerToken, { id: editing._id, ...payload }));
        toast.success("Mod details updated");
      } else {
        await create(opsMutationArgs(viewerToken, payload));
        toast.success("Mod added");
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
        opsMutationArgs(viewerToken, { id: deleteTarget._id as Id<"opsHubModDetails"> }),
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
      <OpsDataTable
        title="Mod Details"
        description="Contact info, PayPal, responsibilities, and availability."
        data={data}
        searchPlaceholder="Search mods…"
        onAdd={canEdit ? openCreate : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onDelete={canEdit ? setDeleteTarget : undefined}
        columns={[
          {
            key: "name",
            header: "Mod",
            searchValue: (r) => r.modName,
            render: (r) => <span className="font-medium">{r.modName}</span>,
          },
          {
            key: "discord",
            header: "Discord ID",
            searchValue: (r) => r.discordId ?? "",
            render: (r) => (
              <code className="text-xs">{r.discordId ?? "—"}</code>
            ),
          },
          {
            key: "paypal",
            header: "PayPal",
            searchValue: (r) => r.payPalDetails ?? "",
            render: (r) => r.payPalDetails ?? "—",
          },
          {
            key: "resp",
            header: "Responsibilities",
            searchValue: (r) => r.responsibilities ?? "",
            render: (r) => (
              <span className="text-xs line-clamp-2 max-w-xs">
                {r.responsibilities ?? "—"}
              </span>
            ),
          },
        ]}
      />

      <OpsFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit mod" : "Add mod"}
        fields={FIELDS}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSave}
        isSubmitting={saving}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete mod entry?</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.modName}</AlertDialogDescription>
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
