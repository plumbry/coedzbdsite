import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  Shield,
  Users,
  ArrowLeft,
  Calendar,
  ListChecks,
  Upload,
  Trophy,
  TrendingUp,
  UserCog,
  MessageSquare,
  ScrollText,
  Database,
  ChevronDown,
  ChevronRight,
  Zap,
  HardDrive,
  LogOut,
  User,
  Sparkles,
  ShieldAlert,
  Ban,
  Dices,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { cn } from "@/lib/utils.ts";

const STORAGE_KEY = "admin-sidebar-collapsed";

type NavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

function SidebarNavLink({
  path,
  label,
  icon: Icon,
  active,
  collapsed,
}: NavItem & { active: boolean; collapsed: boolean }) {
  const button = (
    <Button
      variant={active ? "secondary" : "ghost"}
      size={collapsed ? "icon" : "sm"}
      className={cn(
        collapsed ? "h-9 w-9 shrink-0" : "w-full justify-start",
      )}
      aria-label={label}
    >
      <Icon className={cn("h-4 w-4 shrink-0", !collapsed && "mr-2")} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Button>
  );

  const link = (
    <Link to={path} className={cn(collapsed && "flex justify-center")}>
      {button}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function IconAction({
  label,
  icon: Icon,
  onClick,
  collapsed,
  variant = "ghost",
  className,
}: {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  collapsed: boolean;
  variant?: "ghost" | "outline";
  className?: string;
}) {
  const button = (
    <Button
      variant={variant}
      size={collapsed ? "icon" : "sm"}
      onClick={onClick}
      className={cn(
        collapsed ? "h-9 w-9 shrink-0" : "w-full justify-start",
        className,
      )}
      aria-label={label}
    >
      <Icon className={cn("h-4 w-4 shrink-0", !collapsed && "mr-2")} />
      {!collapsed && label}
    </Button>
  );

  if (!collapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export default function AdminSidebar() {
  const { isAdmin, isModeratorOrAdmin, isEventMod, hasEventBanAccess, user, isLoading } =
    useUserRole();
  const { signout } = useAuth();
  const location = useLocation();
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["players", "statistics", "events", "mods", "admin", "data"]),
  );
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === "true";
    return window.innerWidth < 1024;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const handleToggle = () => setCollapsed((prev) => !prev);
    window.addEventListener("toggleAdminSidebar", handleToggle);
    return () => window.removeEventListener("toggleAdminSidebar", handleToggle);
  }, []);

  const isActive = (path: string) =>
    path === "/admin"
      ? location.pathname === "/admin" || location.pathname === "/admin/"
      : location.pathname === path || location.pathname.startsWith(`${path}/`);

  const toggleSection = (section: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const sections = useMemo((): NavSection[] => {
    const result: NavSection[] = [];

    if (isAdmin) {
      result.push({
        id: "players",
        label: "Players",
        items: [
          { path: "/admin/member-management", label: "Member Management", icon: Users },
          { path: "/admin/discord-members", label: "Discord Directory", icon: Shield },
          { path: "/admin/tier-mismatches", label: "Tier Mismatches", icon: ShieldAlert },
        ],
      });
    }

    if (isAdmin) {
      result.push({
        id: "statistics",
        label: "Statistics",
        items: [
          { path: "/admin/tier-re-evaluation", label: "Re-Evaluation", icon: TrendingUp },
          { path: "/admin/stats", label: "Stats", icon: Trophy },
        ],
      });
    }

    if (isAdmin) {
      const eventItems: NavItem[] = [];
      if (isModeratorOrAdmin) {
        eventItems.push(
          { path: "/admin/events-manager", label: "Events Manager", icon: Calendar },
          { path: "/admin/event-results", label: "Event Results", icon: ListChecks },
        );
      }
      eventItems.push({ path: "/admin/uploads", label: "Uploads & Imports", icon: Upload });
      if (isModeratorOrAdmin) {
        eventItems.push({
          path: "/admin/scrim-series",
          label: "Scrim Series",
          icon: Trophy,
        });
      }
      result.push({ id: "events", label: "Events", items: eventItems });
    }

    if (hasEventBanAccess) {
      result.push({
        id: "mods",
        label: "Mods",
        items: [
          { path: "/admin/event-bans", label: "Event Bans", icon: Ban },
          { path: "/admin/punishment-matrix", label: "Punishment Matrix", icon: ScrollText },
          { path: "/spin", label: "Spin Page", icon: Dices },
          { path: "/admin/spin-moderation", label: "Spin Moderation", icon: KeyRound },
        ],
      });
    }

    if (isAdmin) {
      const adminItems: NavItem[] = [];
      adminItems.push({ path: "/admin/features", label: "Features", icon: Zap });
      if (isModeratorOrAdmin) {
        adminItems.push({ path: "/admin/support", label: "Support", icon: MessageSquare });
      }
      adminItems.push(
        { path: "/admin/audit", label: "Audit Log", icon: ScrollText },
        { path: "/admin/user-management", label: "User Management", icon: UserCog },
      );
      result.push({ id: "admin", label: "Admin", items: adminItems });
    }

    if (isAdmin) {
      result.push({
        id: "data",
        label: "Data",
        items: [
          { path: "/admin/data-cache-status", label: "Data Cache", icon: Database },
          { path: "/admin/data-backup", label: "Data Backup", icon: HardDrive },
          { path: "/admin/data-maintenance", label: "Data Maintenance", icon: Wrench },
          { path: "/admin/2025-wrapped-editor", label: "2025 Wrapped", icon: Sparkles },
        ],
      });
    }

    return result;
  }, [isAdmin, isModeratorOrAdmin, hasEventBanAccess]);

  const showNav = isModeratorOrAdmin || isEventMod;

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "sticky top-0 z-20 flex h-[calc(100vh-2.5rem)] shrink-0 flex-col border-r bg-background transition-[width] duration-200 ease-in-out",
          collapsed ? "w-14 p-2" : "w-56 p-4",
        )}
      >
        {/* User profile */}
        {!isLoading && (
          <div className={cn("shrink-0 border-b pb-3", collapsed ? "mb-2" : "mb-4 pb-4")}>
            {isModeratorOrAdmin || isEventMod ? (
              <div className={cn(collapsed && "flex flex-col items-center gap-2")}>
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="font-medium">{user?.name || "User"}</p>
                      <p className="text-background/80">{user?.email}</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{user?.name || "User"}</p>
                      <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>
                )}
                <IconAction
                  label="Sign Out"
                  icon={LogOut}
                  onClick={() => signout()}
                  collapsed={collapsed}
                  className="text-destructive hover:text-destructive"
                />
              </div>
            ) : collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-center">
                    <SignInButton
                      variant="default"
                      size="icon"
                      className="h-9 w-9"
                      signInText=""
                      showIcon={true}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">Staff Sign In</TooltipContent>
              </Tooltip>
            ) : (
              <SignInButton
                variant="default"
                size="sm"
                className="w-full"
                signInText="Staff Sign In"
                showIcon={true}
              />
            )}
          </div>
        )}

        {/* Back to public site */}
        <div className={cn("shrink-0", collapsed ? "mb-2" : "mb-4")}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/" className="flex justify-center">
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Back to Members">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Back to Members</TooltipContent>
            </Tooltip>
          ) : (
            <Link to="/">
              <Button variant="ghost" size="sm" className="w-full justify-start">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Members
              </Button>
            </Link>
          )}
        </div>

        {/* Navigation */}
        {showNav && (
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden">
            <div className={cn("pb-2", collapsed && "flex justify-center")}>
              <SidebarNavLink
                path="/admin"
                label="Admin Home"
                icon={LayoutDashboard}
                active={isActive("/admin")}
                collapsed={collapsed}
              />
            </div>
            {collapsed
              ? sections.map((section, sectionIndex) => (
                  <div key={section.id}>
                    {sectionIndex > 0 && (
                      <div className="my-2 border-t border-border/60" />
                    )}
                    <div className="space-y-1">
                      {section.items.map((item) => (
                        <SidebarNavLink
                          key={item.path}
                          {...item}
                          active={isActive(item.path)}
                          collapsed
                        />
                      ))}
                    </div>
                  </div>
                ))
              : sections.map((section) => (
                  <div key={section.id} className="pb-2">
                    <button
                      type="button"
                      onClick={() => toggleSection(section.id)}
                      className="mb-2 flex w-full items-center justify-between px-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <span>{section.label}</span>
                      {openSections.has(section.id) ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {openSections.has(section.id) && (
                      <div className="space-y-1">
                        {section.items.map((item) => (
                          <SidebarNavLink
                            key={item.path}
                            {...item}
                            active={isActive(item.path)}
                            collapsed={false}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
          </nav>
        )}

        {/* Collapse toggle */}
        <div className={cn("shrink-0 border-t pt-2", collapsed && "flex justify-center")}>
          <IconAction
            label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            icon={collapsed ? PanelLeftOpen : PanelLeftClose}
            onClick={() => setCollapsed((prev) => !prev)}
            collapsed={collapsed}
          />
        </div>
      </aside>
    </TooltipProvider>
  );
}
