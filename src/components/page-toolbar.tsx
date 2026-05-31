import { cn } from "@/lib/utils.ts";

interface PageToolbarProps {
  className?: string;
  children: React.ReactNode;
}

export default function PageToolbar({ className, children }: PageToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-2 md:gap-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
