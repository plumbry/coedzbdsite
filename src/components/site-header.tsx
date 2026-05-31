import { Button } from "@/components/ui/button.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Menu, LogOut } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { Link, useLocation, useNavigate } from "react-router-dom";
import EditUsernameDialog from "@/components/edit-username-dialog.tsx";

const navLinkClass =
  "font-semibold text-foreground hover:text-primary transition-colors whitespace-nowrap text-sm";

export default function SiteHeader() {
  const { isModeratorOrAdmin, isLoading } = useUserRole();
  const { signout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isOnAdminPage = location.pathname.startsWith("/admin");

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 md:px-6 py-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {isModeratorOrAdmin && !isOnAdminPage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/admin")}
              className="p-2 -ml-1 shrink-0"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <nav className="flex items-center gap-3 sm:gap-4 overflow-x-auto">
            <Link to="/" className={navLinkClass}>
              Members
            </Link>
            <Link to="/events" className={navLinkClass}>
              Events
            </Link>
            <Link
              to="/tier-restrictions"
              className={`${navLinkClass} hidden sm:inline`}
            >
              Tier Restrictions
            </Link>
            <Link
              to="/tier-restrictions"
              className={`${navLinkClass} sm:hidden`}
            >
              Tiers
            </Link>
            <Link to="/support" className={navLinkClass}>
              Support
            </Link>
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
