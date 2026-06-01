import { cn } from "@/lib/utils.ts";

interface AuthGateProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export default function AuthGate({
  title,
  description,
  children,
  className,
}: AuthGateProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-1 items-center justify-center px-4 py-16 min-h-[50vh]",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-sm space-y-4">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-balance">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="w-full text-center [&_form]:text-left">{children}</div>
      </div>
    </div>
  );
}
