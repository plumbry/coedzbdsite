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
  { key: "sponsorName", label: "Sponsor name", type: "text", required: true },
  { key: "amount", label: "Amount", type: "number", required: true },
  { key: "intendedEvent", label: "Event", type: "text" },
  { key: "paymentSource", label: "Payment source / PayPal", type: "text" },
  { key: "notes", label: "Notes", type: "textarea" },
];

type SponsorLogTabProps = OpsHubTabProps & {
  eventFilter: string;
  eventNames: string[];
  onEventFilterChange: (value: string) => void;
};

export default function SponsorLogTab({
  viewerToken,
  canEdit = false,
  eventFilter,
  eventNames,
  onEventFilterChange,
}: SponsorLogTabProps) {
  const data = useQuery(api.opsHub.queries.listSponsorLogs, opsQueryArgs(viewerToken));
  const create = useMutation(api.opsHub.mutations.createSponsorLog);
  const update = useMutation(api.opsHub.mutations.updateSponsorLog);
  const remove = useMutation(api.opsHub.mutations.deleteSponsorLog);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"opsHubSponsorLogs"> | null>(null);
  const [values, setValues] = useState(() => emptyFormValues(FIELDS));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doc<"opsHubSponsorLogs"> | null>(null);

  const filtered = useMemo(
    () => data?.filter((row) => matchesEventFilter(row.intendedEvent, eventFilter)),
    [data, eventFilter],
  );

  const openCreate = () => {
    setEditing(null);
    const next = emptyFormValues(FIELDS);
    if (eventFilter !== ALL_EVENTS && eventFilter !== UNASSIGNED_EVENT) {
      next.intendedEvent = eventFilter;
    }
    setValues(next);
    setDialogOpen(true);
  };

  const openEdit = (row: Doc<"opsHubSponsorLogs">) => {
    setEditing(row);
    setValues(rowToFormValues(row, FIELDS));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!values.sponsorName.trim()) {
      toast.error("Sponsor name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        sponsorName: values.sponsorName.trim(),
        amount: Number(values.amount) || 0,
        intendedEvent: values.intendedEvent.trim() || undefined,
        paymentSource: values.paymentSource.trim() || undefined,
        notes: values.notes.trim() || undefined,
        status: editing?.status ?? ("unused" as const),
        ...(editing?.dateReceived ? { dateReceived: editing.dateReceived } : {}),
      };
      if (editing) {
        await update(
          opsMutationArgs(viewerToken, { id: editing._id, ...payload }),
        );
        toast.success("Sponsor updated");
      } else {
        await create(opsMutationArgs(viewerToken, payload));
        toast.success("Sponsor added");
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
        opsMutationArgs(viewerToken, { id: deleteTarget._id as Id<"opsHubSponsorLogs"> }),
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
        title="Sponsors"
        description="Incoming funds, intended events, and payment sources."
        data={filtered}
        searchPlaceholder="Search sponsors, events, notes…"
        emptyMessage={
          eventFilter === ALL_EVENTS
            ? "No sponsor entries yet."
            : "No sponsors for this event."
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
          return {
            sponsor: "Total",
            amount: formatUsd(total),
          };
        }}
        columns={[
          {
            key: "sponsor",
            header: "Sponsor",
            searchValue: (r) => `${r.sponsorName} ${r.notes ?? ""}`,
            sortValue: (r) => r.sponsorName,
            render: (r) => <span className="font-medium">{r.sponsorName}</span>,
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
            searchValue: (r) => r.intendedEvent ?? "",
            sortValue: (r) => r.intendedEvent ?? null,
            render: (r) => r.intendedEvent ?? "—",
          },
          {
            key: "source",
            header: "Source",
            searchValue: (r) => r.paymentSource ?? "",
            sortValue: (r) => r.paymentSource ?? null,
            render: (r) => r.paymentSource ?? "—",
          },
        ]}
      />

      <OpsFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit sponsor" : "Add sponsor"}
        fields={FIELDS}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSave}
        isSubmitting={saving}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sponsor?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the entry for {deleteTarget?.sponsorName}.
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
