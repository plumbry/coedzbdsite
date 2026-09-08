import { useMemo, useState } from "react";
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
import {
  ALL_EVENTS,
  EventFilterSelect,
  UNASSIGNED_EVENT,
  formatUsd,
  matchesEventFilter,
} from "./event-filter.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
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
  { key: "payeeName", label: "Person owed", type: "text", required: true },
  { key: "amount", label: "Amount", type: "number", required: true },
  { key: "event", label: "Event", type: "text" },
  { key: "notes", label: "Notes", type: "textarea" },
  {
    key: "status",
    label: "Status",
    type: "select",
    required: true,
    options: [
      { value: "unpaid", label: "Unpaid" },
      { value: "paid", label: "Paid" },
    ],
  },
];

const STATUS_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
};

type PayoutsTabProps = OpsHubTabProps & {
  eventFilter: string;
  eventNames: string[];
  onEventFilterChange: (value: string) => void;
};

export default function PayoutsTab({
  viewerToken,
  canEdit = false,
  eventFilter,
  eventNames,
  onEventFilterChange,
}: PayoutsTabProps) {
  const data = useQuery(api.opsHub.queries.listPayouts, opsQueryArgs(viewerToken));
  const create = useMutation(api.opsHub.mutations.createPayout);
  const update = useMutation(api.opsHub.mutations.updatePayout);
  const remove = useMutation(api.opsHub.mutations.deletePayout);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"opsHubPayouts"> | null>(null);
  const [values, setValues] = useState(() => emptyFormValues(FIELDS));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doc<"opsHubPayouts"> | null>(null);

  const filtered = useMemo(
    () => data?.filter((row) => matchesEventFilter(row.event, eventFilter)),
    [data, eventFilter],
  );

  const openCreate = () => {
    setEditing(null);
    const next: Record<string, string> = {
      ...emptyFormValues(FIELDS),
      status: "unpaid",
    };
    if (eventFilter !== ALL_EVENTS && eventFilter !== UNASSIGNED_EVENT) {
      next.event = eventFilter;
    }
    setValues(next);
    setDialogOpen(true);
  };

  const openEdit = (row: Doc<"opsHubPayouts">) => {
    setEditing(row);
    setValues(rowToFormValues(row, FIELDS));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!values.payeeName.trim()) {
      toast.error("Person owed is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        payeeName: values.payeeName.trim(),
        amount: Number(values.amount) || 0,
        event: values.event.trim() || undefined,
        notes: values.notes.trim() || undefined,
        status: (values.status === "paid" ? "paid" : "unpaid") as "unpaid" | "paid",
      };
      if (editing) {
        await update(
          opsMutationArgs(viewerToken, { id: editing._id, ...payload }),
        );
        toast.success("Payout updated");
      } else {
        await create(opsMutationArgs(viewerToken, payload));
        toast.success("Payout added");
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
        opsMutationArgs(viewerToken, { id: deleteTarget._id as Id<"opsHubPayouts"> }),
      );
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleQuickStatus = async (
    row: Doc<"opsHubPayouts">,
    status: Doc<"opsHubPayouts">["status"],
  ) => {
    try {
      await update(
        opsMutationArgs(viewerToken, {
          id: row._id,
          payeeName: row.payeeName,
          amount: row.amount,
          event: row.event,
          notes: row.notes,
          status,
        }),
      );
    } catch {
      toast.error("Failed to update status");
    }
  };

  return (
    <>
      <OpsDataTable
        title="Payouts"
        description="Who is owed what, by event, and whether it has been paid."
        data={filtered}
        searchPlaceholder="Search people, events, notes…"
        emptyMessage={
          eventFilter === ALL_EVENTS
            ? "No payouts yet. Add who is owed and how much."
            : "No payouts for this event."
        }
        onAdd={canEdit ? openCreate : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onDelete={canEdit ? setDeleteTarget : undefined}
        toolbar={
          <EventFilterSelect
            value={eventFilter}
            events={eventNames}
            onChange={onEventFilterChange}
          />
        }
        footer={(rows) => {
          const total = rows.reduce((sum, r) => sum + r.amount, 0);
          const unpaid = rows
            .filter((r) => r.status === "unpaid")
            .reduce((sum, r) => sum + r.amount, 0);
          return {
            payee: "Total",
            amount: formatUsd(total),
            status: unpaid !== total ? `${formatUsd(unpaid)} unpaid` : null,
          };
        }}
        columns={[
          {
            key: "payee",
            header: "Owed to",
            searchValue: (r) => `${r.payeeName} ${r.notes ?? ""}`,
            sortValue: (r) => r.payeeName,
            render: (r) => <span className="font-medium">{r.payeeName}</span>,
          },
          {
            key: "amount",
            header: "Amount",
            className: "tabular-nums",
            sortValue: (r) => r.amount,
            render: (r) => formatUsd(r.amount),
          },
          {
            key: "event",
            header: "Event",
            searchValue: (r) => r.event ?? "",
            sortValue: (r) => r.event ?? null,
            render: (r) => r.event ?? "—",
          },
          {
            key: "notes",
            header: "Notes",
            searchValue: (r) => r.notes ?? "",
            sortValue: (r) => r.notes ?? null,
            render: (r) => (
              <span className="text-muted-foreground line-clamp-2 max-w-[280px]">
                {r.notes?.trim() ? r.notes : "—"}
              </span>
            ),
          },
          {
            key: "status",
            header: "Paid",
            sortValue: (r) => r.status,
            render: (r) =>
              canEdit ? (
                <Select
                  value={r.status}
                  onValueChange={(v) =>
                    handleQuickStatus(r, v as Doc<"opsHubPayouts">["status"])
                  }
                >
                  <SelectTrigger className="h-8 w-[110px] text-xs cursor-pointer">
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
                <Badge variant="outline" className="text-xs">
                  {STATUS_LABELS[r.status] ?? r.status}
                </Badge>
              ),
          },
        ]}
      />

      <OpsFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit payout" : "Add payout"}
        fields={FIELDS}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSave}
        isSubmitting={saving}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payout?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the amount owed to {deleteTarget?.payeeName}.
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
