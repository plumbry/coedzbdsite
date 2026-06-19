import { ArrowDown, CheckCircle2, Gift, Stamp, Upload, UserCheck } from "lucide-react";
import { PassportCollapsibleSection } from "./passport-collapsible-section.tsx";

const STEPS = [
  { icon: CheckCircle2, label: "Complete quest" },
  { icon: Upload, label: "Submit evidence", note: "if required" },
  { icon: UserCheck, label: "Staff review", note: "if submitted" },
  { icon: Stamp, label: "Earn stamp" },
  { icon: Gift, label: "Prize entries" },
] as const;

function FlowSteps() {
  return (
    <ol className="flex flex-col items-center gap-1 py-1">
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        return (
          <li key={step.label} className="flex w-full max-w-xs flex-col items-center">
            <div className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-[#F7F8FA] px-3 py-2.5">
              <Icon className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
              <div className="min-w-0 text-left">
                <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                {"note" in step && step.note ? (
                  <p className="text-xs text-slate-500">{step.note}</p>
                ) : null}
              </div>
            </div>
            {index < STEPS.length - 1 ? (
              <ArrowDown className="my-0.5 h-4 w-4 text-slate-300" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function PassportHowItWorks() {
  return (
    <PassportCollapsibleSection
      title="How Summer Slam Works"
      summary="Complete quests → earn stamps → win prizes"
    >
      <FlowSteps />
    </PassportCollapsibleSection>
  );
}
