import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { 
  Shield, Users, ArrowLeft, Calendar, ListChecks, Upload, Trophy, 
  TrendingUp, UserCog, MessageSquare, ScrollText, 
  Database, X, ChevronDown, ChevronRight, Zap, HardDrive, LogOut, User, Sparkles, Menu, ShieldAlert, Ban, Dices, KeyRound
} from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { useAuth } from "@/hooks/use-auth.ts";

interface AdminSidebarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export default function AdminSidebar({ activeTab, onTabChange }: AdminSidebarProps) {
  const { isAdmin, isModeratorOrAdmin, isEventMod, hasEventBanAccess, user, isLoading } = useUserRole();
  const { signout } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["players"]));

  // Close sidebar on mobile when route changes
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Listen for toggle event from header
  useEffect(() => {
    const handleToggle = () => setIsOpen((prev) => !prev);
    window.addEventListener('toggleAdminSidebar', handleToggle);
    return () => window.removeEventListener('toggleAdminSidebar', handleToggle);
  }, []);

  const toggleSection = (section: string) => {
    setOpenSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const handleTabClick = (tab: string) => {
    if (onTabChange) {
      onTabChange(tab);
    }
    setIsOpen(false);
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* Mobile hamburger header - always rendered, visible only below lg */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 border-b bg-background px-4 py-3">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => setIsOpen((prev) => !prev)}
          className="p-2 -ml-2"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Backdrop overlay on mobile when sidebar is open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          w-56 flex-shrink-0 border-r bg-background p-4 space-y-6 
          sticky top-0 h-screen overflow-y-auto
          transition-all duration-300 ease-in-out
          ${isOpen ? "fixed inset-y-0 left-0 z-40 lg:sticky lg:block" : "hidden lg:block"}
        `}
      >
        {/* Close button inside sidebar on mobile */}
        <div className="lg:hidden mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="w-full justify-start"
          >
            <X className="mr-2 h-4 w-4" />
            Close Menu
          </Button>
        </div>

        {/* User Profile Section */}
        {!isLoading && (
          <div className="pb-4 border-b">
            {(isModeratorOrAdmin || isEventMod) ? (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user?.name || "User"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-destructive hover:text-destructive"
                  onClick={() => signout()}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </div>
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

        <div>
          <Link to="/">
            <Button variant="ghost" size="sm" className="w-full justify-start mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Players
            </Button>
          </Link>
        </div>

        {/* Navigation - Only show when authenticated */}
        {(isModeratorOrAdmin || isEventMod) && (
          <nav className="space-y-4">
            {/* Players - admin only */}
            {isAdmin && (
            <div>
              <button
                onClick={() => toggleSection("players")}
                className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground mb-2 px-2 hover:text-foreground transition-colors"
              >
                <span>Players</span>
                {openSections.has("players") ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
              {openSections.has("players") && (
                <div className="space-y-1">
                  <Link to="/admin/member-management" className="block">
                    <Button
                      variant={isActive("/admin/member-management") ? "secondary" : "ghost"}
                      size="sm"
                      className="w-full justify-start"
                    >
                      <Users className="mr-2 h-4 w-4" />
                      Member Management
                    </Button>
                  </Link>
                  {isAdmin && (
                    <Link to="/admin/discord-members" className="block">
                      <Button
                        variant={isActive("/admin/discord-members") ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                      >
                        <Shield className="mr-2 h-4 w-4" />
                        Discord Members
                      </Button>
                    </Link>
                  )}
                  <Link to="/admin/tier-mismatches" className="block">
                    <Button
                      variant={isActive("/admin/tier-mismatches") ? "secondary" : "ghost"}
                      size="sm"
                      className="w-full justify-start"
                    >
                      <ShieldAlert className="mr-2 h-4 w-4" />
                      Tier Mismatches
                    </Button>
                  </Link>
                </div>
              )}
            </div>
            )}

            {/* Statistics - admin only */}
            {isAdmin && (
            <div>
              <button
                onClick={() => toggleSection("statistics")}
                className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground mb-2 px-2 hover:text-foreground transition-colors"
              >
                <span>Statistics</span>
                {openSections.has("statistics") ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
              {openSections.has("statistics") && (
                <div className="space-y-1">
                  <Link to="/admin/tier-re-evaluation" className="block">
                    <Button
                      variant={isActive("/admin/tier-re-evaluation") ? "secondary" : "ghost"}
                      size="sm"
                      className="w-full justify-start"
                    >
                      <TrendingUp className="mr-2 h-4 w-4" />
                      Re-Evaluation
                    </Button>
                  </Link>
                  <Link to="/admin/stats" className="block">
                    <Button
                      variant={isActive("/admin/stats") ? "secondary" : "ghost"}
                      size="sm"
                      className="w-full justify-start"
                    >
                      <Trophy className="mr-2 h-4 w-4" />
                      Stats
                    </Button>
                  </Link>
                </div>
              )}
            </div>
            )}

            {/* Events - admin only */}
            {isAdmin && (
              <div>
                <button
                  onClick={() => toggleSection("events")}
                  className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground mb-2 px-2 hover:text-foreground transition-colors"
                >
                  <span>Events</span>
                  {openSections.has("events") ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                {openSections.has("events") && (
                  <div className="space-y-1">
                    {activeTab !== undefined && onTabChange ? (
                      <>
                        {isModeratorOrAdmin && (
                          <Button
                            variant={activeTab === "events" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => handleTabClick("events")}
                            className="w-full justify-start"
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            Events Manager
                          </Button>
                        )}
                        {isModeratorOrAdmin && (
                          <Button
                            variant={activeTab === "results" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => handleTabClick("results")}
                            className="w-full justify-start"
                          >
                            <ListChecks className="mr-2 h-4 w-4" />
                            Event Results
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            variant={activeTab === "uploads" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => handleTabClick("uploads")}
                            className="w-full justify-start"
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            Uploads
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        {isModeratorOrAdmin && (
                          <Link to="/admin/events-manager" className="block">
                            <Button
                              variant={isActive("/admin/events-manager") ? "secondary" : "ghost"}
                              size="sm"
                              className="w-full justify-start"
                            >
                              <Calendar className="mr-2 h-4 w-4" />
                              Events Manager
                            </Button>
                          </Link>
                        )}
                        {isModeratorOrAdmin && (
                          <Link to="/admin/event-results" className="block">
                            <Button
                              variant={isActive("/admin/event-results") ? "secondary" : "ghost"}
                              size="sm"
                              className="w-full justify-start"
                            >
                              <ListChecks className="mr-2 h-4 w-4" />
                              Event Results
                            </Button>
                          </Link>
                        )}
                        {isAdmin && (
                          <Link to="/admin/uploads" className="block">
                            <Button
                              variant={isActive("/admin/uploads") ? "secondary" : "ghost"}
                              size="sm"
                              className="w-full justify-start"
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              Uploads
                            </Button>
                          </Link>
                        )}
                        {isModeratorOrAdmin && (
                          <Link to="/admin/scrim-series" className="block">
                            <Button
                              variant={isActive("/admin/scrim-series") ? "secondary" : "ghost"}
                              size="sm"
                              className="w-full justify-start"
                            >
                              <Trophy className="mr-2 h-4 w-4" />
                              Scrim Series
                            </Button>
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Mods */}
            {hasEventBanAccess && (
              <div>
                <button
                  onClick={() => toggleSection("mods")}
                  className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground mb-2 px-2 hover:text-foreground transition-colors"
                >
                  <span>Mods</span>
                  {openSections.has("mods") ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                {openSections.has("mods") && (
                  <div className="space-y-1">
                    <Link to="/admin/event-bans" className="block">
                      <Button
                        variant={isActive("/admin/event-bans") ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                      >
                        <Ban className="mr-2 h-4 w-4" />
                        Event Bans
                      </Button>
                    </Link>
                    <Link to="/admin/punishment-matrix" className="block">
                      <Button
                        variant={isActive("/admin/punishment-matrix") ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                      >
                        <ScrollText className="mr-2 h-4 w-4" />
                        Punishment Matrix
                      </Button>
                    </Link>
                    <Link to="/spin" className="block">
                      <Button
                        variant={isActive("/spin") ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                      >
                        <Dices className="mr-2 h-4 w-4" />
                        Spin Page
                      </Button>
                    </Link>
                    <Link to="/admin/spin-moderation" className="block">
                      <Button
                        variant={isActive("/admin/spin-moderation") ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                      >
                        <KeyRound className="mr-2 h-4 w-4" />
                        Spin Moderation
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Admin */}
            {isAdmin && (
              <div>
                <button
                  onClick={() => toggleSection("admin")}
                  className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground mb-2 px-2 hover:text-foreground transition-colors"
                >
                  <span>Admin</span>
                  {openSections.has("admin") ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                {openSections.has("admin") && (
                  <div className="space-y-1">
                    {isAdmin && (
                      <>
                        {activeTab !== undefined ? (
                          <Button
                            variant={activeTab === "features" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => handleTabClick("features")}
                            className="w-full justify-start"
                          >
                            <Zap className="mr-2 h-4 w-4" />
                            Features
                          </Button>
                        ) : (
                          <Link to="/admin/features" className="block">
                            <Button
                              variant={isActive("/admin/features") ? "secondary" : "ghost"}
                              size="sm"
                              className="w-full justify-start"
                            >
                              <Zap className="mr-2 h-4 w-4" />
                              Features
                            </Button>
                          </Link>
                        )}
                      </>
                    )}
                    {isModeratorOrAdmin && (
                      <>
                        {activeTab !== undefined ? (
                          <Button
                            variant={activeTab === "support" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => handleTabClick("support")}
                            className="w-full justify-start"
                          >
                            <MessageSquare className="mr-2 h-4 w-4" />
                            Support
                          </Button>
                        ) : (
                          <Link to="/admin/support" className="block">
                            <Button
                              variant={isActive("/admin/support") ? "secondary" : "ghost"}
                              size="sm"
                              className="w-full justify-start"
                            >
                              <MessageSquare className="mr-2 h-4 w-4" />
                              Support
                            </Button>
                          </Link>
                        )}
                      </>
                    )}
                    {activeTab !== undefined ? (
                      <Button
                        variant={activeTab === "audit" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => handleTabClick("audit")}
                        className="w-full justify-start"
                      >
                        <ScrollText className="mr-2 h-4 w-4" />
                        Audit Log
                      </Button>
                    ) : (
                      <Link to="/admin/audit" className="block">
                        <Button
                          variant={isActive("/admin/audit") ? "secondary" : "ghost"}
                          size="sm"
                          className="w-full justify-start"
                        >
                          <ScrollText className="mr-2 h-4 w-4" />
                          Audit Log
                        </Button>
                      </Link>
                    )}
                    {isAdmin && (
                      <Link to="/admin/user-management" className="block">
                        <Button
                          variant={isActive("/admin/user-management") ? "secondary" : "ghost"}
                          size="sm"
                          className="w-full justify-start"
                        >
                          <UserCog className="mr-2 h-4 w-4" />
                          User Management
                        </Button>
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Data */}
            {isAdmin && (
              <div>
                <button
                  onClick={() => toggleSection("data")}
                  className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground mb-2 px-2 hover:text-foreground transition-colors"
                >
                  <span>Data</span>
                  {openSections.has("data") ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                {openSections.has("data") && (
                  <div className="space-y-1">
                    <Link to="/admin/data-cache-status" className="block">
                      <Button
                        variant={isActive("/admin/data-cache-status") ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                      >
                        <Database className="mr-2 h-4 w-4" />
                        Data Cache
                      </Button>
                    </Link>
                    <Link to="/admin/data-backup" className="block">
                      <Button
                        variant={isActive("/admin/data-backup") ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                      >
                        <HardDrive className="mr-2 h-4 w-4" />
                        Data Backup
                      </Button>
                    </Link>
                    <Link to="/admin/2025-wrapped-editor" className="block">
                      <Button
                        variant={isActive("/admin/2025-wrapped-editor") ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        2025 Wrapped
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </nav>
        )}
      </aside>
    </>
  );
}
