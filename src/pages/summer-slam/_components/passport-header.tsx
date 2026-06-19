import { BookOpen } from "lucide-react";

export function PassportHeader({
  campaignTitle,
  playerName,
}: {
  campaignTitle: string;
  playerName: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-2 pb-2">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-slate-600">
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          Summer Slam
        </div>
        <h1 className="text-xl font-black tracking-tight text-slate-900 md:text-2xl">{campaignTitle}</h1>
        <p className="text-sm text-slate-700">{playerName}</p>
      </div>
    </header>
  );
}
