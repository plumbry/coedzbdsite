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
  { key: "person", label: "Person", type: "text", required: true },
  { key: "areaOwned", label: "Area owned", type: "text", required: true },
  { key: "backupPerson", label: "Backup person", type: "text" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export default function ResponsibilitiesTab({ viewerToken, canEdit = false }: OpsHubTabProps) {
  const data = useQuery(api.opsHub.queries.listResponsibilities, opsQueryArgs(viewerToken));
  const create = useMutation(api.opsHub.mutations.createResponsibility);
  const update = useMutation(api.opsHub.mutations.updateResponsibility);
  const remove = useMutation(api.opsHub.mutations.deleteResponsibility);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"opsHubResponsibilities"> | null>(null);
  const [values, setValues] = useState(() => emptyFormValues(FIELDS));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<Doc<"opsHubResponsibilities"> | null>(null);

  const openCreate = () => {
    setEditing(null);
    setValues(emptyFormValues(FIELDS));
    setDialogOpen(true);
  };

  const openEdit = (row: Doc<"opsHubResponsibilities">) => {
    setEditing(row);
    setValues(rowToFormValues(row, FIELDS));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!values.person.trim() || !values.areaOwned.trim()) {
      toast.error("Person and area are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        person: values.person.trim(),
        areaOwned: values.areaOwned.trim(),
        backupPerson: values.backupPerson.trim() || undefined,
        notes: values.notes.trim() || undefined,
      };
      if (editing) {
        await update(opsMutationArgs(viewerToken, { id: editing._id, ...payload }));
        toast.success("Updated");
      } else {
        await create(opsMutationArgs(viewerToken, payload));
        toast.success("Added");
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
        opsMutationArgs(viewerToken, {
          id: deleteTarget._id as Id<"opsHubResponsibilities">,
        }),
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
        title="Responsibilities"
        description="Who owns what area and who backs them up."
        data={data}
        searchPlaceholder="Search people or areas…"
        onAdd={canEdit ? openCreate : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onDelete={canEdit ? setDeleteTarget : undefined}
        columns={[
          {
            key: "person",
            header: "Person",
            searchValue: (r) => r.person,
            render: (r) => <span className="font-medium">{r.person}</span>,
          },
          {
            key: "area",
            header: "Area owned",
            searchValue: (r) => r.areaOwned,
            render: (r) => r.areaOwned,
          },
          {
            key: "backup",
            header: "Backup",
            searchValue: (r) => r.backupPerson ?? "",
            render: (r) => r.backupPerson ?? "—",
          },
          {
            key: "notes",
            header: "Notes",
            searchValue: (r) => r.notes ?? "",
            render: (r) => (
              <span className="text-xs text-muted-foreground line-clamp-2 max-w-xs">
                {r.notes ?? "—"}
              </span>
            ),
          },
        ]}
      />

      <OpsFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit responsibility" : "Add responsibility"}
        fields={FIELDS}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSave}
        isSubmitting={saving}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.person} · {deleteTarget?.areaOwned}
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
