import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.js";
import { opsMutationArgs, opsQueryArgs, type OpsHubTabProps } from "./types.ts";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Download, Loader2, Trash2 } from "lucide-react";

export default function KillCapsTab({
  viewerToken,
  canEdit = false,
  canUploadFiles = false,
}: OpsHubTabProps) {
  const files = useQuery(
    api.opsHub.queries.listKillCapFiles,
    opsQueryArgs(viewerToken),
  );
  const generateUploadUrl = useMutation(api.opsHub.mutations.generateKillCapFileUploadUrl);
  const createFile = useMutation(api.opsHub.mutations.createKillCapFile);
  const deleteFile = useMutation(api.opsHub.mutations.deleteKillCapFile);

  const [uploading, setUploading] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<Id<"opsHubKillCapFiles"> | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<Id<"opsHubKillCapFiles"> | null>(
    null,
  );

  const handleDownloadFile = async (
    id: Id<"opsHubKillCapFiles">,
    fileName: string,
    downloadUrl: string,
  ) => {
    setDownloadingFileId(id);
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error("Failed to download file");
    } finally {
      setDownloadingFileId(null);
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
      <Card>
        <CardHeader>
          <CardTitle>Yunite Point Systems</CardTitle>
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
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={downloadingFileId === fileRow._id}
                      onClick={() =>
                        void handleDownloadFile(
                          fileRow._id,
                          fileRow.fileName,
                          fileRow.downloadUrl!,
                        )
                      }
                    >
                      {downloadingFileId === fileRow._id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Download
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
