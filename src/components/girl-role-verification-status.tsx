import { Badge } from "@/components/ui/badge.tsx";
import { Trophy } from "lucide-react";
import FemaleVerifiedBadge from "@/components/female-verified-badge.tsx";

type GirlRoleVerificationStatusProps = {
  femaleVerified: boolean;
  verificationMethod?: string;
  loading?: boolean;
  noPlayerHint?: boolean;
};

export default function GirlRoleVerificationStatus({
  femaleVerified,
  verificationMethod,
  loading = false,
  noPlayerHint = false,
}: GirlRoleVerificationStatusProps) {
  if (loading) {
    return (
      <div className="border rounded-lg p-4 bg-muted/50 text-sm text-muted-foreground">
        Loading Girl Role verification…
      </div>
    );
  }

  if (noPlayerHint) {
    return (
      <div className="border rounded-lg p-4 bg-muted/50 text-sm text-muted-foreground">
        Girl Role verification is managed on the Mod Log spreadsheet. Add the player there
        to mark them verified.
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 space-y-2 bg-muted/50">
      <p className="text-sm font-medium">Girl Role verification (Mod Log)</p>
      {femaleVerified ? (
        <div className="flex flex-wrap items-center gap-2">
          <FemaleVerifiedBadge />
          {verificationMethod && (
            <Badge variant="outline" className="text-xs">
              {verificationMethod}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground w-full">
            Synced from the Girl Role sheet — not editable here.
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground flex items-start gap-2">
          <Trophy className="h-4 w-4 shrink-0 mt-0.5 opacity-50" />
          Not on the Girl Role list. Add them on the Mod Log sheet to verify.
        </p>
      )}
    </div>
  );
}
