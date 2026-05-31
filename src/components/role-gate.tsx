import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils.ts";

interface RoleGateProps {
  allowed: boolean;
  title?: string;
  description?: string;
  showBackButton?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export default function RoleGate({
  allowed,
  title = "Access Denied",
  description = "This page is only accessible to administrators and moderators.",
  showBackButton = true,
  className,
  children,
}: RoleGateProps) {
  if (!allowed) {
    return (
      <div
        className={cn(
          "flex min-h-[40vh] flex-col items-center justify-center text-center space-y-4",
          className,
        )}
      >
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
        {showBackButton && (
          <Link to="/">
            <Button size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
