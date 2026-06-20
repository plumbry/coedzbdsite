import type { ReactNode } from "react";
import { Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";

import { Button } from "@/components/ui/button.tsx";

import { cn } from "@/lib/utils.ts";

import { PassportAdminHint, PassportAdminHintSection } from "./passport-admin-hint.tsx";

import { PassportStampBadge } from "./passport-stamp-badge.tsx";

import { PassportQuestTypeBadge } from "./passport-quest-type-badge.tsx";

import {

  getEvidenceSubmitOptions,

  getNextStepCopy,

  getQuestTypeInfo,

  textToBullets,

} from "./passport-quest-meta.ts";

import {

  getCategoryPage,

  getQuestStatus,

  statusLabel,

  type QuestEntry,

} from "./passport-types.ts";



function formatDate(timestamp?: number) {

  if (!timestamp) return null;

  return new Date(timestamp).toLocaleDateString("en-GB", {

    day: "numeric",

    month: "short",

    year: "numeric",

  });

}



function staffFeedbackCopy(status: ReturnType<typeof getQuestStatus>, awardLog?: string) {

  if (status === "needs_more_evidence") {

    return {

      title: "What Staff Need From You",

      intro:

        "A staff member reviewed your submission and needs additional evidence before this stamp can be approved.",

      staffNote: awardLog,

      className: "border-amber-200 bg-amber-50 text-amber-950",

    };

  }

  if (status === "rejected") {

    return {

      title: "Why this was not approved",

      body:

        awardLog ??

        "This submission was not approved. Review the quest requirements and submit new evidence if you can meet them.",

      className: "border-red-200 bg-red-50 text-red-900",

    };

  }

  if (status === "approved" && awardLog) {

    return {

      title: "Staff note",

      body: awardLog,

      className: "border-emerald-200 bg-emerald-50 text-emerald-900",

    };

  }

  return null;

}



function SectionHeading({ children }: { children: ReactNode }) {

  return (

    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{children}</p>

  );

}



export function PassportQuestDetailContent({

  entry,

  onClose,

  onSubmitEvidence,

  layout = "default",

}: {

  entry: QuestEntry;

  onClose: () => void;

  onSubmitEvidence: () => void;

  layout?: "default" | "sheet";

}) {

  const { quest, progress } = entry;

  const status = getQuestStatus(entry);

  const category = getCategoryPage(quest.category);

  const typeInfo = getQuestTypeInfo(quest.completionMethod, quest.evidenceInput);

  const staffFeedback = staffFeedbackCopy(status, progress?.awardLog);

  const howToBullets = textToBullets(quest.description);

  const evidenceOptions = getEvidenceSubmitOptions(quest.evidenceInstructions);

  const nextStep = getNextStepCopy(status, typeInfo.requiresSubmission);

  const canSubmit =

    quest.completionMethod === "manual" &&

    status !== "approved" &&

    status !== "pending_review";

  const canResubmit =

    quest.completionMethod === "manual" &&

    (status === "rejected" || status === "needs_more_evidence");

  const isSheet = layout === "sheet";



  return (

    <>

      <div className={cn("space-y-3", isSheet ? "px-1" : "")}>

        <div className="flex items-start gap-2">

          {isSheet ? (

            <div className="shrink-0 pt-1">

              <PassportStampBadge entry={entry} compact />

            </div>

          ) : null}

          <div className="min-w-0 flex-1 space-y-2">

            <div className="flex items-start gap-1">

              <h2 className="flex-1 text-lg font-semibold leading-tight text-stone-900">{quest.title}</h2>

              <PassportAdminHint hint={quest.adminHint} />

            </div>

            <div className="flex flex-wrap items-center gap-2">

              <Badge

                variant="secondary"

                className={cn(

                  status === "approved" && "bg-emerald-100 text-emerald-800",

                  status === "pending_review" && "bg-amber-100 text-amber-800",

                  status === "needs_more_evidence" && "bg-amber-100 text-amber-900",

                  status === "rejected" && "bg-red-100 text-red-800",

                )}

              >

                {statusLabel(status)}

              </Badge>

              <Badge variant="outline" className={cn("border-0", category.headerBg)}>

                {category.emoji} {category.label}

              </Badge>

            </div>

            <PassportQuestTypeBadge
              method={quest.completionMethod}
              evidenceInput={quest.evidenceInput}
              showDetail
            />

          </div>

          {!isSheet ? (

            <div className="hidden shrink-0 md:block">

              <PassportStampBadge entry={entry} compact />

            </div>

          ) : null}

        </div>



        <div className="border-t border-stone-100" />



        <section className="space-y-1.5">

          <SectionHeading>What is this?</SectionHeading>

          <p className="text-sm leading-relaxed text-stone-700">{quest.description}</p>

        </section>



        <section className="space-y-2">

          <SectionHeading>How to complete</SectionHeading>

          <ul className="list-inside list-disc space-y-1 text-sm text-stone-700">

            {howToBullets.map((bullet) => (

              <li key={bullet}>{bullet}</li>

            ))}

          </ul>

        </section>



        {typeInfo.requiresSubmission ? (

          <section className="space-y-2">

            <SectionHeading>Evidence required</SectionHeading>

            <p className="text-sm text-stone-700">{typeInfo.detail}</p>

            <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/50 p-3">

              <p className="mb-1.5 text-xs font-semibold text-amber-900">Submit:</p>

              <ul className="list-inside list-disc space-y-0.5 text-sm text-amber-950">

                {evidenceOptions.map((option) => (

                  <li key={option}>{option}</li>

                ))}

              </ul>

            </div>

            {quest.evidenceInstructions ? (

              <div className="rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-700">

                <p className="mb-1 text-xs font-semibold text-stone-500">Specific requirements</p>

                <p className="whitespace-pre-wrap">{quest.evidenceInstructions}</p>

              </div>

            ) : null}

          </section>

        ) : null}



        <PassportAdminHintSection hint={quest.adminHint} />



        {status === "pending_review" ? (

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 space-y-2">

            <p className="text-xs font-bold uppercase tracking-wide opacity-80">Waiting on Staff Review</p>

            <p>Your evidence has been submitted successfully.</p>

            <p>No action is needed from you right now.</p>

            <p>

              A staff member will review your submission and update your passport once a decision has

              been made.

            </p>

            <p className="text-xs font-medium opacity-90">Typical review time: 48–72 hours.</p>

          </div>

        ) : null}



        {staffFeedback ? (

          <div className={cn("rounded-lg border p-3 text-sm", staffFeedback.className)}>

            <p className="mb-1 text-xs font-bold uppercase tracking-wide opacity-80">

              {staffFeedback.title}

            </p>

            {"intro" in staffFeedback && staffFeedback.intro ? (

              <p>{staffFeedback.intro}</p>

            ) : null}

            {"staffNote" in staffFeedback && staffFeedback.staffNote ? (

              <div className="mt-2 rounded-md border border-amber-300/80 bg-white/80 p-2.5">

                <p className="text-xs font-bold uppercase tracking-wide text-amber-900">Staff note</p>

                <p className="mt-1 whitespace-pre-wrap font-medium text-amber-950">

                  {staffFeedback.staffNote}

                </p>

              </div>

            ) : null}

            {"body" in staffFeedback && staffFeedback.body ? (

              <p className="whitespace-pre-wrap">{staffFeedback.body}</p>

            ) : null}

          </div>

        ) : null}



        {nextStep ? (

          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-800">

            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">What To Do Next</p>

            <p className="mt-1 font-medium">{nextStep}</p>

          </div>

        ) : null}



        {status === "in_progress" && progress?.progressTarget ? (

          <p className="text-sm text-stone-600">

            Progress:{" "}

            <span className="font-semibold text-stone-900">

              {progress.progressCurrent ?? 0} / {progress.progressTarget}

            </span>

          </p>

        ) : null}



        {status === "approved" && progress?.approvedAt ? (

          <p className="text-xs text-stone-500">

            Approved {formatDate(progress.approvedAt)}

            {progress.awardSource === "auto"

              ? " · Auto tracked"

              : progress.awardSource === "manual_review"

                ? " · Approved by staff"

                : progress.awardSource === "admin"

                  ? " · Awarded by staff"

                  : null}

          </p>

        ) : null}

      </div>



      <div

        className={cn(

          "flex flex-col gap-2 pt-4 sm:flex-row sm:justify-end",

          isSheet && "sticky bottom-0 border-t border-stone-200 bg-white pb-1",

        )}

      >

        <Button variant="outline" onClick={onClose} className="min-h-11 touch-manipulation">

          Close

        </Button>

        {(canSubmit || canResubmit) && (

          <Button onClick={onSubmitEvidence} className="min-h-11 touch-manipulation">

            <Upload className="mr-2 h-4 w-4" />

            {canResubmit ? "Resubmit Evidence" : "Submit Evidence"}

          </Button>

        )}

      </div>

    </>

  );

}


