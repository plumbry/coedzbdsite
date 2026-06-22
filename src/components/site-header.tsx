import { Button } from "@/components/ui/button.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { LogOut } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { Link, useLocation } from "react-router-dom";
import EditUsernameDialog from "@/components/edit-username-dialog.tsx";
import { cn } from "@/lib/utils.ts";

const navLinkClass =
  "inline-flex min-h-8 items-center font-semibold text-foreground hover:text-primary transition-colors whitespace-nowrap text-sm px-1 py-1.5 touch-manipulation sm:min-h-0 sm:px-0 sm:py-0";

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
  const { user, isModeratorOrAdmin, isLoading } = useUserRole();
  const { signout } = useAuth();
  const isSignedIn = !!user;

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 md:px-6 py-1.5 sm:py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <ScrollArea className="w-full" scrollbars={["horizontal"]}>
            <nav className="flex w-max items-center gap-2 sm:gap-3 md:gap-4 pb-1">
              <NavLink to="/">Members</NavLink>
              <NavLink to="/events">Events</NavLink>
              <NavLink to="/tier-restrictions" className="hidden sm:inline">
                Tier Restrictions
              </NavLink>
              <NavLink to="/tier-restrictions" className="sm:hidden">
                Tiers
              </NavLink>
              <NavLink to="/support">Support</NavLink>
              {isModeratorOrAdmin && (
                <NavLink to="/admin">Admin Home</NavLink>
              )}
            </nav>
          </ScrollArea>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <p className="hidden lg:block text-xs text-muted-foreground mr-2">
            use code <span className="font-semibold text-foreground">'coedzbd'</span> #ad
          </p>
          {isSignedIn ? (
            <>
              <EditUsernameDialog />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signout()}
                className="text-destructive hover:text-destructive px-2 sm:px-3 touch-manipulation"
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
                showIcon={false}
              />
            )
          )}
        </div>
      </div>
    </header>
  );
}
