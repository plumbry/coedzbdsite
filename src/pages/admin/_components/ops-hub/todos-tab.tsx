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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
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

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

const FIELDS: OpsFormField[] = [
  { key: "task", label: "Task", type: "textarea", required: true },
  { key: "owner", label: "Owner", type: "text" },
  {
    key: "priority",
    label: "Priority",
    type: "select",
    required: true,
    options: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
  },
  { key: "dueDate", label: "Due date", type: "date" },
  {
    key: "status",
    label: "Status",
    type: "select",
    required: true,
    options: [
      { value: "open", label: "Open" },
      { value: "in_progress", label: "In progress" },
      { value: "done", label: "Done" },
    ],
  },
  { key: "linkedEvent", label: "Linked event", type: "text" },
  { key: "linkedTicket", label: "Linked ticket", type: "text" },
  { key: "linkedPlayer", label: "Linked player", type: "text" },
];

export default function TodosTab({ viewerToken, canEdit = false }: OpsHubTabProps) {
  const data = useQuery(api.opsHub.queries.listTodos, opsQueryArgs(viewerToken));
  const create = useMutation(api.opsHub.mutations.createTodo);
  const update = useMutation(api.opsHub.mutations.updateTodo);
  const remove = useMutation(api.opsHub.mutations.deleteTodo);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"opsHubTodos"> | null>(null);
  const [values, setValues] = useState(() => emptyFormValues(FIELDS));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doc<"opsHubTodos"> | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const filteredData =
    data && statusFilter === "active"
      ? data.filter((t) => t.status !== "done")
      : data && statusFilter !== "all"
        ? data.filter((t) => t.status === statusFilter)
        : data;

  const handleQuickStatus = async (
    row: Doc<"opsHubTodos">,
    status: Doc<"opsHubTodos">["status"],
  ) => {
    try {
      await update(
        opsMutationArgs(viewerToken, {
          id: row._id,
          task: row.task,
          owner: row.owner,
          priority: row.priority,
          dueDate: row.dueDate,
          status,
          linkedEvent: row.linkedEvent,
          linkedTicket: row.linkedTicket,
          linkedPlayer: row.linkedPlayer,
        }),
      );
    } catch {
      toast.error("Failed to update status");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setValues({
      ...emptyFormValues(FIELDS),
      priority: "medium",
      status: "open",
    });
    setDialogOpen(true);
  };

  const openEdit = (row: Doc<"opsHubTodos">) => {
    setEditing(row);
    setValues(rowToFormValues(row, FIELDS));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!values.task.trim()) {
      toast.error("Task is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        task: values.task.trim(),
        owner: values.owner.trim() || undefined,
        priority: values.priority as Doc<"opsHubTodos">["priority"],
        dueDate: values.dueDate || undefined,
        status: values.status as Doc<"opsHubTodos">["status"],
        linkedEvent: values.linkedEvent.trim() || undefined,
        linkedTicket: values.linkedTicket.trim() || undefined,
        linkedPlayer: values.linkedPlayer.trim() || undefined,
      };
      if (editing) {
        await update(opsMutationArgs(viewerToken, { id: editing._id, ...payload }));
        toast.success("To-do updated");
      } else {
        await create(opsMutationArgs(viewerToken, payload));
        toast.success("To-do added");
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
        opsMutationArgs(viewerToken, { id: deleteTarget._id as Id<"opsHubTodos"> }),
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
        {[
          { value: "active", label: "Active" },
          { value: "open", label: "Open" },
          { value: "in_progress", label: "In progress" },
          { value: "done", label: "Done" },
          { value: "all", label: "All" },
        ].map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer ${
              statusFilter === value ? "bg-primary text-primary-foreground" : ""
            }`}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <OpsDataTable
        title="To-do List"
        description="Tasks for live events with optional links to events, tickets, or players."
        data={filteredData}
        searchPlaceholder="Search tasks, owners, links…"
        onAdd={canEdit ? openCreate : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onDelete={canEdit ? setDeleteTarget : undefined}
        columns={[
          {
            key: "task",
            header: "Task",
            searchValue: (r) => r.task,
            render: (r) => <span className="line-clamp-2 max-w-xs">{r.task}</span>,
          },
          {
            key: "owner",
            header: "Owner",
            searchValue: (r) => r.owner ?? "",
            render: (r) => r.owner ?? "—",
          },
          {
            key: "priority",
            header: "Priority",
            render: (r) => (
              <Badge
                variant={r.priority === "high" ? "destructive" : "outline"}
                className="text-xs"
              >
                {PRIORITY_LABELS[r.priority]}
              </Badge>
            ),
          },
          {
            key: "due",
            header: "Due",
            render: (r) => r.dueDate ?? "—",
          },
          {
            key: "status",
            header: "Status",
            render: (r) =>
              canEdit ? (
                <Select
                  value={r.status}
                  onValueChange={(v) =>
                    handleQuickStatus(r, v as Doc<"opsHubTodos">["status"])
                  }
                >
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  {STATUS_LABELS[r.status]}
                </Badge>
              ),
          },
          {
            key: "links",
            header: "Links",
            searchValue: (r) =>
              [r.linkedEvent, r.linkedTicket, r.linkedPlayer].filter(Boolean).join(" "),
            render: (r) => {
              const parts = [
                r.linkedEvent && `Event: ${r.linkedEvent}`,
                r.linkedTicket && `Ticket: ${r.linkedTicket}`,
                r.linkedPlayer && `Player: ${r.linkedPlayer}`,
              ].filter(Boolean);
              return parts.length ? (
                <span className="text-xs text-muted-foreground line-clamp-2 max-w-[140px]">
                  {parts.join(" · ")}
                </span>
              ) : (
                "—"
              );
            },
          },
        ]}
      />

      <OpsFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit to-do" : "Add to-do"}
        fields={FIELDS}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSave}
        isSubmitting={saving}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete to-do?</AlertDialogTitle>
            <AlertDialogDescription className="line-clamp-3">
              {deleteTarget?.task}
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
