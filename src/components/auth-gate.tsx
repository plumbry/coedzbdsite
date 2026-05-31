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
        "flex flex-1 items-center justify-center px-4 py-16",
        className,
      )}
    >
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-balance">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
