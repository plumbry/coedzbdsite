import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { LogOut } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { Link, useLocation } from "react-router-dom";
import EditUsernameDialog from "@/components/edit-username-dialog.tsx";
import { cn } from "@/lib/utils.ts";

const navLinkClass =
  "font-semibold text-foreground hover:text-primary transition-colors whitespace-nowrap text-sm";

function NavLink({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) {
  const { pathname } = useLocation();
  const active = pathname === to || pathname.startsWith(`${to}/`);

  return (
    <Link to={to} className={cn(navLinkClass, active && "text-primary", className)}>
      {children}
    </Link>
  );
}

export default function SiteHeader() {
  const { isModeratorOrAdmin, isLoading } = useUserRole();
  const { signout } = useAuth();

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 md:px-6 py-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <nav className="flex items-center gap-3 sm:gap-4 overflow-x-auto">
            <NavLink to="/">Members</NavLink>
            <NavLink to="/events">Events</NavLink>
            <NavLink to="/scrim-series">Scrim Series</NavLink>
            <NavLink to="/tier-restrictions" className="hidden sm:inline">
              Tier Restrictions
            </NavLink>
            <NavLink to="/tier-restrictions" className="sm:hidden">
              Tiers
            </NavLink>
            <NavLink to="/2025-wrapped">2025 Wrapped</NavLink>
            <NavLink to="/support">Support</NavLink>
            {isModeratorOrAdmin && (
              <Link to="/spin" className={cn(navLinkClass, "inline-flex items-center gap-1.5")}>
                Spin
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
                  Staff
                </Badge>
              </Link>
            )}
            {isModeratorOrAdmin && (
              <NavLink to="/admin">Admin Home</NavLink>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <p className="hidden lg:block text-xs text-muted-foreground mr-2">
            use code <span className="font-semibold text-foreground">'coedzbd'</span> #ad
          </p>
          {isModeratorOrAdmin ? (
            <>
              <EditUsernameDialog />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signout()}
                className="text-destructive hover:text-destructive px-2 sm:px-3"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">Sign Out</span>
              </Button>
            </>
          ) : (
            !isLoading && (
              <SignInButton
                variant="ghost"
                size="sm"
                className="text-sm"
                signInText="Staff Sign In"
                showIcon={false}
              />
            )
          )}
        </div>
      </div>
    </header>
  );
}
