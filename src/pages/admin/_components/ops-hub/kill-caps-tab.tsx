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
  { key: "mode", label: "Mode", type: "text", required: true },
  { key: "lobbyType", label: "Lobby type", type: "text", required: true },
  { key: "teamSizeTier", label: "Team size / tier combo", type: "text", required: true },
  { key: "killCap", label: "Kill cap", type: "number", required: true },
  { key: "notes", label: "Notes", type: "textarea" },
];

export default function KillCapsTab({ viewerToken, canEdit = false }: OpsHubTabProps) {
  const data = useQuery(api.opsHub.queries.listKillCaps, opsQueryArgs(viewerToken));
  const create = useMutation(api.opsHub.mutations.createKillCap);
  const update = useMutation(api.opsHub.mutations.updateKillCap);
  const remove = useMutation(api.opsHub.mutations.deleteKillCap);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"opsHubKillCaps"> | null>(null);
  const [values, setValues] = useState(() => emptyFormValues(FIELDS));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doc<"opsHubKillCaps"> | null>(null);

  const openCreate = () => {
    setEditing(null);
    setValues(emptyFormValues(FIELDS));
    setDialogOpen(true);
  };

  const openEdit = (row: Doc<"opsHubKillCaps">) => {
    setEditing(row);
    setValues(rowToFormValues(row, FIELDS));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!values.mode.trim() || !values.lobbyType.trim() || !values.teamSizeTier.trim()) {
      toast.error("Mode, lobby type, and team size/tier are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        mode: values.mode.trim(),
        lobbyType: values.lobbyType.trim(),
        teamSizeTier: values.teamSizeTier.trim(),
        killCap: Number(values.killCap) || 0,
        notes: values.notes.trim() || undefined,
      };
      if (editing) {
        await update(opsMutationArgs(viewerToken, { id: editing._id, ...payload }));
        toast.success("Kill cap updated");
      } else {
        await create(opsMutationArgs(viewerToken, payload));
        toast.success("Kill cap added");
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
        opsMutationArgs(viewerToken, { id: deleteTarget._id as Id<"opsHubKillCaps"> }),
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
        title="Kill Caps Reference"
        description="Quick lookup for kill caps by mode, lobby, and team composition."
        data={data}
        searchPlaceholder="Search mode, lobby, tier…"
        onAdd={canEdit ? openCreate : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onDelete={canEdit ? setDeleteTarget : undefined}
        columns={[
          {
            key: "mode",
            header: "Mode",
            searchValue: (r) => r.mode,
            render: (r) => r.mode,
          },
          {
            key: "lobby",
            header: "Lobby",
            searchValue: (r) => r.lobbyType,
            render: (r) => r.lobbyType,
          },
          {
            key: "tier",
            header: "Team / tier",
            searchValue: (r) => r.teamSizeTier,
            render: (r) => r.teamSizeTier,
          },
          {
            key: "cap",
            header: "Kill cap",
            render: (r) => <span className="font-semibold">{r.killCap}</span>,
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
        title={editing ? "Edit kill cap" : "Add kill cap"}
        fields={FIELDS}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSave}
        isSubmitting={saving}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete kill cap entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.mode} · {deleteTarget?.lobbyType}
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
