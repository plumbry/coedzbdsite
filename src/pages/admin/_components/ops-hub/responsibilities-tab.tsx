import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.js";
import { opsMutationArgs, opsQueryArgs, type OpsHubTabProps } from "./types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
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
import { Plus, Pencil, Trash2, X, Search } from "lucide-react";
import { toast } from "sonner";

type ResponsibilityTag = { label: string; color: string };

function ResponsibilityBadge({
  tag,
  onRemove,
}: {
  tag: ResponsibilityTag;
  onRemove?: () => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{
        borderColor: tag.color,
        backgroundColor: `${tag.color}18`,
        color: tag.color,
      }}
    >
      {tag.label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full hover:opacity-70 cursor-pointer"
          aria-label={`Remove ${tag.label}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export default function ResponsibilitiesTab({ viewerToken, canEdit = false }: OpsHubTabProps) {
  const profiles = useQuery(api.opsHub.queries.listStaffProfiles, opsQueryArgs(viewerToken));
  const catalog = useQuery(
    api.opsHub.queries.listResponsibilityCatalog,
    opsQueryArgs(viewerToken),
  );
  const createProfile = useMutation(api.opsHub.mutations.createStaffProfile);
  const updateProfile = useMutation(api.opsHub.mutations.updateStaffProfile);
  const removeProfile = useMutation(api.opsHub.mutations.deleteStaffProfile);

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"opsHubStaffProfiles"> | null>(null);
  const [person, setPerson] = useState("");
  const [tags, setTags] = useState<ResponsibilityTag[]>([]);
  const [draftLabel, setDraftLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doc<"opsHubStaffProfiles"> | null>(
    null,
  );

  const catalogColorByLabel = useMemo(() => {
    const map = new Map<string, string>();
    catalog?.forEach((entry) => map.set(entry.label.toLowerCase(), entry.color));
    return map;
  }, [catalog]);

  const filteredProfiles = useMemo(() => {
    if (!profiles) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.person.toLowerCase().includes(q) ||
        p.responsibilities.some((r) => r.label.toLowerCase().includes(q)),
    );
  }, [profiles, search]);

  const suggestions = useMemo(() => {
    if (!catalog) return [];
    const q = draftLabel.trim().toLowerCase();
    const assigned = new Set(tags.map((t) => t.label.toLowerCase()));
    return catalog
      .filter((c) => !assigned.has(c.label.toLowerCase()))
      .filter((c) => !q || c.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [catalog, draftLabel, tags]);

  const openCreate = () => {
    setEditing(null);
    setPerson("");
    setTags([]);
    setDraftLabel("");
    setDialogOpen(true);
  };

  const openEdit = (profile: Doc<"opsHubStaffProfiles">) => {
    setEditing(profile);
    setPerson(profile.person);
    setTags([...profile.responsibilities]);
    setDraftLabel("");
    setDialogOpen(true);
  };

  const addTag = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (tags.some((t) => t.label.toLowerCase() === key)) {
      setDraftLabel("");
      return;
    }
    const color =
      catalogColorByLabel.get(key) ??
      `#${((tags.length * 2654435761) >>> 0).toString(16).slice(0, 6).padStart(6, "0")}`;
    setTags((prev) => [...prev, { label: trimmed, color }]);
    setDraftLabel("");
  };

  const handleSave = async () => {
    if (!person.trim()) {
      toast.error("Person name is required");
      return;
    }
    setSaving(true);
    try {
      const labels = tags.map((t) => t.label);
      if (editing) {
        await updateProfile(
          opsMutationArgs(viewerToken, {
            id: editing._id,
            person: person.trim(),
            responsibilityLabels: labels,
          }),
        );
        toast.success("Profile updated");
      } else {
        await createProfile(
          opsMutationArgs(viewerToken, {
            person: person.trim(),
            responsibilityLabels: labels,
          }),
        );
        toast.success("Profile created");
      }
      setDialogOpen(false);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!deleteTarget) return;
    try {
      await removeProfile(
        opsMutationArgs(viewerToken, {
          id: deleteTarget._id as Id<"opsHubStaffProfiles">,
        }),
      );
      toast.success("Profile deleted");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  };

  if (profiles === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Staff Profiles</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            One profile per mod/admin with colour-coded responsibilities.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" className="cursor-pointer shrink-0" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add profile
          </Button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search people or responsibilities…"
          className="h-9 pl-8 text-sm"
        />
      </div>

      {filteredProfiles?.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center border rounded-md">
          {search ? "No matches." : "No profiles yet."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredProfiles?.map((profile) => (
            <Card key={profile._id}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                <CardTitle className="text-base">{profile.person}</CardTitle>
                {canEdit && (
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 cursor-pointer"
                      onClick={() => openEdit(profile)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive cursor-pointer"
                      onClick={() => setDeleteTarget(profile)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {profile.responsibilities.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No responsibilities assigned.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.responsibilities.map((tag) => (
                      <ResponsibilityBadge key={tag.label} tag={tag} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit profile" : "Add profile"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="staff-profile-person">Person</Label>
              <Input
                id="staff-profile-person"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                placeholder="Mod or admin name"
              />
            </div>

            <div className="space-y-2">
              <Label>Responsibilities</Label>
              {canEdit && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={draftLabel}
                      onChange={(e) => setDraftLabel(e.target.value)}
                      placeholder="Type new or pick below…"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag(draftLabel);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="cursor-pointer shrink-0"
                      onClick={() => addTag(draftLabel)}
                      disabled={!draftLabel.trim()}
                    >
                      Add
                    </Button>
                  </div>
                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <button
                          key={s._id}
                          type="button"
                          className="cursor-pointer"
                          onClick={() => addTag(s.label)}
                        >
                          <ResponsibilityBadge tag={{ label: s.label, color: s.color }} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 min-h-[2rem] pt-1">
                {tags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No responsibilities yet.</p>
                ) : (
                  tags.map((tag) => (
                    <ResponsibilityBadge
                      key={tag.label}
                      tag={tag}
                      onRemove={
                        canEdit
                          ? () =>
                              setTags((prev) =>
                                prev.filter(
                                  (t) => t.label.toLowerCase() !== tag.label.toLowerCase(),
                                ),
                              )
                          : undefined
                      }
                    />
                  ))
                )}
              </div>
            </div>
          </div>
          {canEdit && (
            <DialogFooter>
              <Button
                variant="outline"
                className="cursor-pointer"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button className="cursor-pointer" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete profile?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {deleteTarget?.person} and all their assigned responsibilities.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction className="cursor-pointer" onClick={handleDeleteProfile}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
