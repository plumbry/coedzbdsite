import { Button } from "@/components/ui/button.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { UserPlus, Menu, RefreshCw, LogOut } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { useLocation } from "react-router-dom";
import EditUsernameDialog from "@/components/edit-username-dialog.tsx";

interface SiteHeaderProps {
  onOpenCalculator?: () => void;
  onOpenAddPlayer?: () => void;
  onSyncMatchData?: () => void;
  isSyncing?: boolean;
}

export default function SiteHeader({ onOpenCalculator, onOpenAddPlayer, onSyncMatchData, isSyncing }: SiteHeaderProps) {
  const { isAdmin, isModeratorOrAdmin, isLoading } = useUserRole();
  const { signout } = useAuth();
  const location = useLocation();
  const isOnAdminPage = location.pathname.startsWith('/admin');
  
  return (
    <>
      {/* Promo Code Banner */}
      <div className="border-b bg-muted/50">
        <div className="container mx-auto px-2 sm:px-4 py-2 max-w-7xl">
          <div className="flex justify-end">
            <p className="text-sm text-muted-foreground">
              use code <span className="font-semibold text-foreground">'coedzbd'</span> #ad
            </p>
          </div>
        </div>
      </div>
      
      {/* Main Navigation */}
      <div className="border-b overflow-hidden">
        <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4 max-w-7xl">
          <div className="flex items-center justify-between gap-2">
            {/* Left: Hamburger & Navigation Links */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {isModeratorOrAdmin && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    if (isOnAdminPage) {
                      const event = new CustomEvent('toggleAdminSidebar');
                      window.dispatchEvent(event);
                    } else {
                      window.location.href = '/admin';
                    }
                  }}
                  className="p-2 -ml-1 shrink-0"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              )}
              <nav className="flex items-center gap-2 sm:gap-4 lg:gap-6 overflow-x-auto">
                <a 
                  href="/" 
                  className="font-bold text-foreground hover:text-primary transition-colors whitespace-nowrap text-sm sm:text-base"
                >
                  Players
                </a>
                <a 
                  href="/events" 
                  className="font-bold text-foreground hover:text-primary transition-colors whitespace-nowrap text-sm sm:text-base"
                >
                  Events
                </a>
                {onOpenCalculator && (
                  <button
                    onClick={onOpenCalculator}
                    className="font-bold text-foreground hover:text-primary transition-colors whitespace-nowrap text-sm sm:text-base"
                  >
                    Calculator
                  </button>
                )}
                <a 
                  href="/tier-restrictions" 
                  className="font-bold text-foreground hover:text-primary transition-colors whitespace-nowrap text-sm sm:text-base hidden sm:inline"
                >
                  Tier Restrictions
                </a>
                <a 
                  href="/tier-restrictions" 
                  className="font-bold text-foreground hover:text-primary transition-colors whitespace-nowrap text-sm sm:hidden"
                >
                  Tiers
                </a>
                <a 
                  href="/support" 
                  className="font-bold text-foreground hover:text-primary transition-colors whitespace-nowrap text-sm sm:text-base"
                >
                  Support
                </a>
              </nav>
            </div>
            
            {/* Right: Auth & Actions */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
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
                  {isAdmin && onOpenAddPlayer && (
                    <Button size="sm" onClick={onOpenAddPlayer} className="px-2 sm:px-3">
                      <UserPlus className="h-4 w-4" />
                      <span className="hidden lg:inline ml-2">Add Player</span>
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {!isLoading && (
                    <SignInButton 
                      variant="ghost" 
                      size="sm"
                      className="text-sm" 
                      signInText="Staff Sign In"
                      showIcon={false}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
