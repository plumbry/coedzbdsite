import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet.tsx";
import { LogOut, Menu } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { Link, useLocation } from "react-router-dom";
import EditUsernameDialog from "@/components/edit-username-dialog.tsx";
import { cn } from "@/lib/utils.ts";

const navLinkClass =
  "inline-flex min-h-8 items-center font-semibold text-foreground hover:text-primary transition-colors whitespace-nowrap text-sm px-1 py-1.5 touch-manipulation sm:min-h-0 sm:px-0 sm:py-0";

const mobileNavLinkClass =
  "flex min-h-11 items-center rounded-md px-3 py-2 text-base font-semibold text-foreground hover:bg-muted hover:text-primary transition-colors touch-manipulation";

type NavItem = { to: string; label: string; shortLabel?: string };

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Home" },
  { to: "/members", label: "Members" },
  { to: "/events", label: "Events" },
  { to: "/summer-slam", label: "Summer Slam" },
  { to: "/tier-restrictions", label: "Tier Restrictions", shortLabel: "Tiers" },
  { to: "/support", label: "Support" },
];

function NavLink({
  to,
  children,
  className,
  onClick,
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const { pathname } = useLocation();
  const active = to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <Link to={to} onClick={onClick} className={cn(navLinkClass, active && "text-primary", className)}>
      {children}
    </Link>
  );
}

function MobileNavLink({
  to,
  children,
  onClick,
}: {
  to: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  const { pathname } = useLocation();
  const active = to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(mobileNavLinkClass, active && "bg-muted text-primary")}
    >
      {children}
    </Link>
  );
}

export default function SiteHeader() {
  const { user, isModeratorOrAdmin, isLoading } = useUserRole();
  const { signout } = useAuth();
  const isSignedIn = !!user;
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 md:px-6 py-1.5 sm:py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 md:hidden touch-manipulation"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <nav className="hidden md:flex items-center gap-2 sm:gap-3 md:gap-4">
            {NAV_ITEMS.map((item) =>
              item.shortLabel ? (
                <span key={item.to} className="contents">
                  <NavLink to={item.to} className="hidden lg:inline">
                    {item.label}
                  </NavLink>
                  <NavLink to={item.to} className="lg:hidden">
                    {item.shortLabel}
                  </NavLink>
                </span>
              ) : (
                <NavLink key={item.to} to={item.to}>
                  {item.label}
                </NavLink>
              ),
            )}
            {isModeratorOrAdmin && <NavLink to="/admin">Admin Home</NavLink>}
          </nav>
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

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 md:hidden">
          <SheetTitle className="sr-only">Site navigation</SheetTitle>
          <nav className="flex flex-col gap-1 p-4 pt-12">
            {NAV_ITEMS.map((item) => (
              <MobileNavLink key={item.to} to={item.to} onClick={closeMobile}>
                {item.label}
              </MobileNavLink>
            ))}
            {isModeratorOrAdmin && (
              <MobileNavLink to="/admin" onClick={closeMobile}>
                Admin Home
              </MobileNavLink>
            )}
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
