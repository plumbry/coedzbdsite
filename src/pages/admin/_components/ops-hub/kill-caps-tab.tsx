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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Download, Loader2, Trash2 } from "lucide-react";

const MODE_OPTIONS = [
  { value: "Reload", label: "Reload" },
  { value: "ZB BR", label: "ZB BR" },
];

const TEAM_SIZE_OPTIONS = [
  { value: "Duos", label: "Duos" },
  { value: "Trios", label: "Trios" },
  { value: "Squads", label: "Squads" },
];

const FIELDS: OpsFormField[] = [
  {
    key: "mode",
    label: "Mode",
    type: "select",
    required: true,
    options: MODE_OPTIONS,
  },
  {
    key: "teamSizeTier",
    label: "Team Size",
    type: "select",
    required: true,
    options: TEAM_SIZE_OPTIONS,
  },
  { key: "lobbyType", label: "Lobby type", type: "text", required: true },
  { key: "killCap", label: "Kill cap", type: "number", required: true },
  { key: "notes", label: "Notes", type: "textarea" },
];

export default function KillCapsTab({
  viewerToken,
  canEdit = false,
  canUploadFiles = false,
}: OpsHubTabProps) {
  const data = useQuery(api.opsHub.queries.listKillCaps, opsQueryArgs(viewerToken));
  const files = useQuery(
    api.opsHub.queries.listKillCapFiles,
    opsQueryArgs(viewerToken),
  );
  const create = useMutation(api.opsHub.mutations.createKillCap);
  const update = useMutation(api.opsHub.mutations.updateKillCap);
  const remove = useMutation(api.opsHub.mutations.deleteKillCap);
  const generateUploadUrl = useMutation(api.opsHub.mutations.generateKillCapFileUploadUrl);
  const createFile = useMutation(api.opsHub.mutations.createKillCapFile);
  const deleteFile = useMutation(api.opsHub.mutations.deleteKillCapFile);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"opsHubKillCaps"> | null>(null);
  const [values, setValues] = useState(() => emptyFormValues(FIELDS));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doc<"opsHubKillCaps"> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<Id<"opsHubKillCapFiles"> | null>(null);

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
    if (!values.mode || !values.teamSizeTier || !values.lobbyType.trim()) {
      toast.error("Mode, team size, and lobby type are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        mode: values.mode,
        lobbyType: values.lobbyType.trim(),
        teamSizeTier: values.teamSizeTier,
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

  const handleFilesSelected = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0 || !canUploadFiles) return;
    setUploading(true);
    try {
      for (const file of Array.from(selectedFiles)) {
        const uploadUrl = await generateUploadUrl(opsMutationArgs(viewerToken, {}));
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!uploadResult.ok) {
          throw new Error(`Upload failed for ${file.name}`);
        }
        const { storageId } = (await uploadResult.json()) as { storageId: Id<"_storage"> };
        await createFile(
          opsMutationArgs(viewerToken, {
            fileName: file.name,
            storageId,
            contentType: file.type || undefined,
            size: file.size,
          }),
        );
      }
      toast.success("Kill caps file(s) uploaded");
    } catch {
      toast.error("Failed to upload one or more files");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (id: Id<"opsHubKillCapFiles">) => {
    setDeletingFileId(id);
    try {
      await deleteFile(opsMutationArgs(viewerToken, { id }));
      toast.success("File deleted");
    } catch {
      toast.error("Failed to delete file");
    } finally {
      setDeletingFileId(null);
    }
  };

  const formatSize = (size?: number) => {
    if (!size || size <= 0) return "—";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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
            header: "Team Size",
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

      <Card>
        <CardHeader>
          <CardTitle>Kill Caps Files</CardTitle>
          <CardDescription>
            Upload shared files for admins/mods/password viewers to download.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canUploadFiles && (
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="file"
                multiple
                disabled={uploading}
                className="max-w-sm"
                onChange={(event) => {
                  void handleFilesSelected(event.target.files);
                  event.target.value = "";
                }}
              />
              {uploading && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Uploading...
                </span>
              )}
            </div>
          )}

          <div className="space-y-2">
            {!files && <p className="text-sm text-muted-foreground">Loading files...</p>}
            {files && files.length === 0 && (
              <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
            )}
            {files?.map((fileRow) => (
              <div
                key={fileRow._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{fileRow.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(fileRow.size)} · Added {new Date(fileRow.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {fileRow.downloadUrl ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={fileRow.downloadUrl} target="_blank" rel="noreferrer">
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </a>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      <Download className="h-3.5 w-3.5" />
                      Unavailable
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={deletingFileId === fileRow._id}
                      onClick={() => void handleDeleteFile(fileRow._id)}
                    >
                      {deletingFileId === fileRow._id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
