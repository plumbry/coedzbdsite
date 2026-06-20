import { cn } from "@/lib/utils.ts";
import { getQuestTypeInfo, type EvidenceInput, type QuestCompletionMethod } from "./passport-quest-meta.ts";

export function PassportQuestTypeBadge({
  method,
  evidenceInput,
  variant = "default",
  showDetail = false,
  className,
}: {
  method: QuestCompletionMethod;
  evidenceInput?: EvidenceInput;
  variant?: "default" | "compact" | "inline";
  showDetail?: boolean;
  className?: string;
}) {
  const info = getQuestTypeInfo(method, evidenceInput);

  if (variant === "compact") {
    return (
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-0.5 truncate rounded-md bg-slate-100 px-1 py-0.5 text-[9px] font-semibold leading-none text-slate-700",
          className,
        )}
        title={`${info.label}. ${info.summary}`}
      >
        <span aria-hidden>{info.emoji}</span>
        <span className="truncate">{info.shortLabel}</span>
      </span>
    );
  }

  if (variant === "inline") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs font-medium text-slate-700", className)}>
        <span aria-hidden>{info.emoji}</span>
        {info.label}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        info.requiresSubmission
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : "border-slate-200 bg-slate-50 text-slate-800",
        className,
      )}
    >
      <p className="font-semibold">
        <span aria-hidden className="mr-1">
          {info.emoji}
        </span>
        {info.label}
      </p>
      <p className="mt-0.5 text-xs opacity-90">{info.summary}</p>
      {showDetail ? <p className="mt-1 text-xs opacity-80">{info.detail}</p> : null}
    </div>
  );
}
