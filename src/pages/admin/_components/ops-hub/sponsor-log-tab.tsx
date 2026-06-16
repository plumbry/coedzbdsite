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
  { key: "sponsorName", label: "Sponsor name", type: "text", required: true },
  { key: "amount", label: "Amount", type: "number", required: true },
  { key: "dateReceived", label: "Date received", type: "date" },
  { key: "intendedEvent", label: "Intended event", type: "text" },
  { key: "paymentSource", label: "Payment source / PayPal", type: "text" },
  { key: "notes", label: "Notes", type: "textarea" },
  {
    key: "status",
    label: "Status",
    type: "select",
    required: true,
    options: [
      { value: "unused", label: "Unused" },
      { value: "assigned", label: "Assigned" },
      { value: "paid_out", label: "Paid out" },
    ],
  },
];

const STATUS_LABELS: Record<string, string> = {
  unused: "Unused",
  assigned: "Assigned",
  paid_out: "Paid out",
};

export default function SponsorLogTab({ viewerToken, canEdit = false }: OpsHubTabProps) {
  const data = useQuery(api.opsHub.queries.listSponsorLogs, opsQueryArgs(viewerToken));
  const create = useMutation(api.opsHub.mutations.createSponsorLog);
  const update = useMutation(api.opsHub.mutations.updateSponsorLog);
  const remove = useMutation(api.opsHub.mutations.deleteSponsorLog);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"opsHubSponsorLogs"> | null>(null);
  const [values, setValues] = useState(() => emptyFormValues(FIELDS));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doc<"opsHubSponsorLogs"> | null>(null);

  const openCreate = () => {
    setEditing(null);
    setValues({ ...emptyFormValues(FIELDS), status: "unused" });
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
        dateReceived: values.dateReceived.trim() || undefined,
        intendedEvent: values.intendedEvent.trim() || undefined,
        paymentSource: values.paymentSource.trim() || undefined,
        notes: values.notes.trim() || undefined,
        status: values.status as "unused" | "assigned" | "paid_out",
      };
      if (editing) {
        await update(
          opsMutationArgs(viewerToken, { id: editing._id, ...payload }),
        );
        toast.success("Sponsor log updated");
      } else {
        await create(opsMutationArgs(viewerToken, payload));
        toast.success("Sponsor log added");
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

  const handleQuickStatus = async (
    row: Doc<"opsHubSponsorLogs">,
    status: Doc<"opsHubSponsorLogs">["status"],
  ) => {
    try {
      await update(
        opsMutationArgs(viewerToken, {
          id: row._id,
          sponsorName: row.sponsorName,
          amount: row.amount,
          dateReceived: row.dateReceived,
          intendedEvent: row.intendedEvent,
          paymentSource: row.paymentSource,
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
        title="Sponsor Log"
        description="Track sponsor funds, intended events, and payout status."
        data={data}
        searchPlaceholder="Search sponsors, events, notes…"
        onAdd={canEdit ? openCreate : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onDelete={canEdit ? setDeleteTarget : undefined}
        columns={[
          {
            key: "sponsor",
            header: "Sponsor",
            searchValue: (r) => r.sponsorName,
            render: (r) => <span className="font-medium">{r.sponsorName}</span>,
          },
          {
            key: "amount",
            header: "Amount",
            render: (r) => `$${r.amount.toFixed(2)}`,
          },
          {
            key: "date",
            header: "Received",
            render: (r) => r.dateReceived ?? "—",
          },
          {
            key: "event",
            header: "Event",
            searchValue: (r) => r.intendedEvent ?? "",
            render: (r) => r.intendedEvent ?? "—",
          },
          {
            key: "source",
            header: "Source",
            searchValue: (r) => r.paymentSource ?? "",
            render: (r) => r.paymentSource ?? "—",
          },
          {
            key: "status",
            header: "Status",
            render: (r) =>
              canEdit ? (
                <Select
                  value={r.status}
                  onValueChange={(v) =>
                    handleQuickStatus(r, v as Doc<"opsHubSponsorLogs">["status"])
                  }
                >
                  <SelectTrigger className="h-8 w-[120px] text-xs">
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
        title={editing ? "Edit sponsor log" : "Add sponsor log"}
        fields={FIELDS}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSave}
        isSubmitting={saving}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sponsor log?</AlertDialogTitle>
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
