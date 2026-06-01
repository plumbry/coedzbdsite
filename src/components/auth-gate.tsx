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
    <div className={cn("w-full max-w-sm mx-auto space-y-4", className)}>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-balance">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex w-full flex-col items-center gap-4 [&_form]:w-full [&_form]:self-stretch [&_form]:text-left">
        {children}
      </div>
    </div>
  );
}
