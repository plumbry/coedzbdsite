import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { opsMutationArgs, opsQueryArgs, type OpsHubTabProps } from "./types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatOpsTimestamp } from "./ops-data-table.tsx";
import { Save } from "lucide-react";
import { toast } from "sonner";

export default function VodPolicyTab({ viewerToken, canEdit = false }: OpsHubTabProps) {
  const policy = useQuery(api.opsHub.queries.getVodEvidencePolicy, opsQueryArgs(viewerToken));
  const upsert = useMutation(api.opsHub.mutations.upsertVodEvidencePolicy);

  const [streamingRequirements, setStreamingRequirements] = useState("");
  const [futureUploadRequirements, setFutureUploadRequirements] = useState("");
  const [evidenceRetentionRules, setEvidenceRetentionRules] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (policy) {
      setStreamingRequirements(policy.streamingRequirements ?? "");
      setFutureUploadRequirements(policy.futureUploadRequirements ?? "");
      setEvidenceRetentionRules(policy.evidenceRetentionRules ?? "");
      setAdminNotes(policy.adminNotes ?? "");
      setDirty(false);
    }
  }, [policy]);

  const markDirty = () => setDirty(true);

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsert(
        opsMutationArgs(viewerToken, {
          streamingRequirements: streamingRequirements.trim() || undefined,
          futureUploadRequirements: futureUploadRequirements.trim() || undefined,
          evidenceRetentionRules: evidenceRetentionRules.trim() || undefined,
          adminNotes: adminNotes.trim() || undefined,
        }),
      );
      toast.success("Policy saved");
      setDirty(false);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (policy === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">VOD / Evidence Policy</h3>
          <p className="text-xs text-muted-foreground">
            Current streaming requirements, upload plans, retention rules, and admin notes.
          </p>
          {policy && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Last updated {formatOpsTimestamp(policy.updatedAt)}
              {policy.updatedBy ? ` · ${policy.updatedBy}` : ""}
            </p>
          )}
        </div>
        {canEdit && (
          <Button
            size="sm"
            className="cursor-pointer shrink-0"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? "Saving…" : "Save policy"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Current streaming requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={streamingRequirements}
              onChange={(e) => {
                setStreamingRequirements(e.target.value);
                markDirty();
              }}
              rows={6}
              placeholder="What must be streamed live during events…"
              readOnly={!canEdit}
              disabled={!canEdit}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Future upload requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={futureUploadRequirements}
              onChange={(e) => {
                setFutureUploadRequirements(e.target.value);
                markDirty();
              }}
              rows={6}
              placeholder="Planned VOD upload requirements…"
              readOnly={!canEdit}
              disabled={!canEdit}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Evidence retention rules</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={evidenceRetentionRules}
              onChange={(e) => {
                setEvidenceRetentionRules(e.target.value);
                markDirty();
              }}
              rows={6}
              placeholder="How long evidence is kept, where it lives…"
              readOnly={!canEdit}
              disabled={!canEdit}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Admin notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="sr-only">Admin notes</Label>
            <Textarea
              value={adminNotes}
              onChange={(e) => {
                setAdminNotes(e.target.value);
                markDirty();
              }}
              rows={6}
              placeholder="Internal notes for staff…"
              readOnly={!canEdit}
              disabled={!canEdit}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
