import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { AlertTriangle, ShieldAlert, ArrowRight } from "lucide-react";

const MINOR_TRACK = [
  {
    offense: "1st Offense",
    punishment: "Warning",
    events: 0,
    description: "Verbal/written warning. Player is notified of the violation. Multiple minor warnings can be issued for different infractions.",
  },
  {
    offense: "2nd Offense",
    punishment: "1 Event Ban",
    events: 1,
    description: "Player is banned from participating in the next 1 event.",
  },
];

const MAJOR_TRACK = [
  {
    offense: "1st Offense",
    punishment: "Warning",
    events: 0,
    description: "A single major warning is given. This is only issued once per player.",
  },
  {
    offense: "2nd Offense",
    punishment: "Multi-Event Ban",
    events: null,
    description: "Player is banned from multiple events. The number of events is determined by the moderator/admin based on severity.",
  },
];

const PROBATION_INFO = {
  type: "Probation",
  duration: "28 days",
  description: "Full server ban for 28 days. The player is removed from the server entirely and cannot participate in any activities during this period. Applied at moderator/admin discretion for severe or repeated violations.",
};

export default function PunishmentMatrixPage() {
  return (
    <AdminPageLayout requireEventBanAccess
      title="Punishment Matrix"
      description="Offense progression tracks for event bans and disciplinary actions"
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Minor Offense Track
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Minor infractions such as late arrivals, mild toxicity, or rule-bending. Players can receive multiple minor warnings for different things.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {MINOR_TRACK.map((step, i) => (
              <div key={step.offense} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-600 font-bold text-sm">
                    {i + 1}
                  </div>
                  {i < MINOR_TRACK.length - 1 && (
                    <div className="w-px h-8 bg-border mt-1" />
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{step.offense}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 border-yellow-200">
                      {step.punishment}
                    </Badge>
                    {step.events > 0 && (
                      <span className="text-xs text-muted-foreground">({step.events} event{step.events !== 1 ? "s" : ""})</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            Major Offense Track
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Serious infractions such as cheating, harassment, or deliberate rule-breaking. A major warning is only given once.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {MAJOR_TRACK.map((step, i) => (
              <div key={step.offense} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 text-red-600 font-bold text-sm">
                    {i + 1}
                  </div>
                  {i < MAJOR_TRACK.length - 1 && (
                    <div className="w-px h-8 bg-border mt-1" />
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{step.offense}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <Badge variant="secondary" className="bg-red-500/10 text-red-600 border-red-200">
                      {step.punishment}
                    </Badge>
                    {step.events !== null && step.events > 0 && (
                      <span className="text-xs text-muted-foreground">({step.events} events)</span>
                    )}
                    {step.events === null && (
                      <span className="text-xs text-muted-foreground">(moderator discretion)</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-purple-200 dark:border-purple-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 border-purple-200 text-sm px-3 py-1">
              {PROBATION_INFO.type}
            </Badge>
            <span className="text-muted-foreground font-normal text-sm">— {PROBATION_INFO.duration}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{PROBATION_INFO.description}</p>
        </CardContent>
      </Card>
    </AdminPageLayout>
  );
}
