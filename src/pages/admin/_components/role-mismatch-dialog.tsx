import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { AlertTriangle, XCircle, AlertCircle } from "lucide-react";

interface RoleMismatch {
  discordUsername: string;
  discordUserId: string;
  expectedTier: string;
  currentTierRoles: string[];
  status: "missing_role" | "wrong_role" | "multiple_roles";
}

interface RoleMismatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mismatches: RoleMismatch[];
  playersChecked: number;
}

export default function RoleMismatchDialog({ open, onOpenChange, mismatches, playersChecked }: RoleMismatchDialogProps) {
  const getStatusIcon = (status: RoleMismatch["status"]) => {
    switch (status) {
      case "missing_role":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "wrong_role":
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case "multiple_roles":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusLabel = (status: RoleMismatch["status"]) => {
    switch (status) {
      case "missing_role":
        return "Missing Role";
      case "wrong_role":
        return "Wrong Role";
      case "multiple_roles":
        return "Multiple Roles";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Discord Role Mismatches</DialogTitle>
          <DialogDescription>
            {mismatches.length === 0 ? (
              <span className="text-green-600">✓ All {playersChecked} players have correct Discord roles</span>
            ) : (
              <span>Found {mismatches.length} player{mismatches.length !== 1 ? "s" : ""} with incorrect roles out of {playersChecked} checked</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {mismatches.length > 0 && (
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Discord Username</TableHead>
                  <TableHead>Expected Tier</TableHead>
                  <TableHead>Current Roles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mismatches.map((mismatch) => (
                  <TableRow key={mismatch.discordUserId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(mismatch.status)}
                        <span className="text-xs">{getStatusLabel(mismatch.status)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{mismatch.discordUsername}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">Tier {mismatch.expectedTier}</Badge>
                    </TableCell>
                    <TableCell>
                      {mismatch.currentTierRoles.length === 0 ? (
                        <span className="text-muted-foreground italic">None</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {mismatch.currentTierRoles.map((role) => (
                            <Badge key={role} variant="outline" className="text-xs">
                              {role}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
