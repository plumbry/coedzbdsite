import { Link } from "react-router-dom";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { cn } from "@/lib/utils.ts";

interface PlayerProfileLinkProps {
  discordUsername?: string | null;
  children: React.ReactNode;
  className?: string;
}

export default function PlayerProfileLink({
  discordUsername,
  children,
  className,
}: PlayerProfileLinkProps) {
  const { isAdmin } = useUserRole();

  if (discordUsername && isAdmin) {
    return (
      <Link
        to={`/player/${discordUsername}`}
        className={cn("text-primary hover:underline", className)}
      >
        {children}
      </Link>
    );
  }

  return <span className={className}>{children}</span>;
}
