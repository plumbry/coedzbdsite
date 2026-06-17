import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import {
  Users,
  Shield,
  ShieldAlert,
  Calendar,
  ListChecks,
  Upload,
  Trophy,
  BarChart3,
  TrendingUp,
  Ban,
  CalendarDays,
  ScrollText,
  BookOpen,
  KeyRound,
  Dices,
  Database,
  HardDrive,
  Wrench,
  Zap,
  MessageSquare,
  UserCog,
  AlertCircle,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";

type HubLink = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

type HubSection = {
  title: string;
  show: boolean;
  links: HubLink[];
};

function HubSectionGrid({ title, links }: { title: string; links: HubLink[] }) {
  if (links.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {links.map((item) => (
          <Link key={item.href} to={item.href} className="block group">
            <Card className="h-full py-0 transition-colors group-hover:border-primary/50 cursor-pointer">
              <CardHeader className="py-3">
                <div className="flex items-center gap-3 mb-1">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <item.icon className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                </div>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

function OperationsCard({
  title,
  value,
  description,
  href,
  tone = "neutral",
}: {
  title: string;
  value: number | string;
  description: string;
  href: string;
  tone?: "neutral" | "attention" | "good";
}) {
  const icon =
    tone === "attention" ? (
      <AlertCircle className="h-4 w-4 text-amber-600" />
    ) : tone === "good" ? (
      <CheckCircle2 className="h-4 w-4 text-green-600" />
    ) : (
      <ListChecks className="h-4 w-4 text-primary" />
    );

  return (
    <Link to={href} className="block group">
      <Card className="h-full py-0 transition-colors group-hover:border-primary/50 cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">{title}</p>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              {icon}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function AdminHubPage() {
  const { isAdmin, isModeratorOrAdmin, hasEventBanAccess } = useUserRole();
  const eventSummary = useQuery(
    api.events.management.getOperationsSummary,
    isModeratorOrAdmin ? {} : "skip",
  );
  const importSummary = useQuery(
    api.thirdPartyQueries.getImportOperationsSummary,
    isAdmin ? {} : "skip",
  );
  const banRoleSync = useQuery(
    api.eventBans.queries.getRoleSyncVisibility,
    hasEventBanAccess ? {} : "skip",
  );

  const sections: HubSection[] = [
    {
      title: "People",
      show: isAdmin || isModeratorOrAdmin,
      links: [
        {
          title: "Member Management",
          description: isAdmin
            ? "Applications, accepted members, and Discord evaluation queue."
            : "View pending applications (tier only), accepted, and former members.",
          href: "/admin/member-management/applications",
          icon: Users,
        },
        ...(isAdmin
          ? [
              {
                title: "Discord Directory",
                description: "Advanced Discord role view, matching, and ID management.",
                href: "/admin/discord-members",
                icon: Shield,
              },
              {
                title: "Tier Mismatches",
                description: "Players whose Discord tier roles don't match database tiers.",
                href: "/admin/tier-mismatches",
                icon: ShieldAlert,
              },
            ]
          : []),
      ],
    },
    {
      title: "Events",
      show: isAdmin,
      links: [
        ...(isModeratorOrAdmin
          ? [
              {
                title: "Events Manager",
                description: "Create and manage tournament events and schedules.",
                href: "/admin/events-manager",
                icon: Calendar,
              },
              {
                title: "Event Results",
                description: "Enter and review event placement results.",
                href: "/admin/event-results",
                icon: ListChecks,
              },
            ]
          : []),
        {
          title: "Uploads & Imports",
          description: "Yunite imports (ZBD event records) and third-party CSV uploads.",
          href: "/admin/uploads",
          icon: Upload,
        },
        ...(isModeratorOrAdmin
          ? [
              {
                title: "Scrim Series",
                description: "Manage Scrim Series leaderboards and scoring.",
                href: "/admin/scrim-series",
                icon: Trophy,
              },
            ]
          : []),
      ],
    },
    {
      title: "Analytics",
      show: isAdmin,
      links: [
        {
          title: "Analytics Hub",
          description: "Tier evaluation, holistic scores, earnings, and cache rebuilds.",
          href: "/admin/stats",
          icon: BarChart3,
        },
      ],
    },
    {
      title: "Mods",
      show: hasEventBanAccess,
      links: [
        {
          title: "Event Bans",
          description: "Manage event bans and offense tracking.",
          href: "/admin/event-bans",
          icon: Ban,
        },
        {
          title: "Event Calendar",
          description: "Plan potential events on a shared standalone calendar.",
          href: "/admin/potential-event-calendar",
          icon: CalendarDays,
        },
        {
          title: "Resources",
          description:
            "Bot commands, punishment matrix, sponsor logs, rules, and live ops data.",
          href: "/admin/resources",
          icon: BookOpen,
        },
        {
          title: "Spin Page",
          description: "Open the public Spin pairing tool.",
          href: "/spin",
          icon: Dices,
        },
        {
          title: "Spin Moderation",
          description: "Manage Spin event unlock codes.",
          href: "/admin/spin-moderation",
          icon: KeyRound,
        },
      ],
    },
    {
      title: "Data",
      show: isAdmin,
      links: [
        {
          title: "Data Cache",
          description: "Cache health, rebuild controls, and sync status.",
          href: "/admin/data-cache-status",
          icon: Database,
        },
        {
          title: "Data Backup",
          description: "Export and backup database tables.",
          href: "/admin/data-backup",
          icon: HardDrive,
        },
        {
          title: "Data Maintenance",
          description: "Bulk stat refresh, migrations, and destructive cleanup tools.",
          href: "/admin/data-maintenance",
          icon: Wrench,
        },
        {
          title: "Features & Integrations",
          description: "Exports, Google Sheets, merges, and utility tools.",
          href: "/admin/features",
          icon: Zap,
        },
      ],
    },
    {
      title: "Administration",
      show: isAdmin,
      links: [
        ...(isModeratorOrAdmin
          ? [
              {
                title: "Support",
                description: "Review and respond to support tickets.",
                href: "/admin/support",
                icon: MessageSquare,
              },
            ]
          : []),
        {
          title: "Audit Log",
          description: "Track admin actions across the platform.",
          href: "/admin/audit",
          icon: ScrollText,
        },
        {
          title: "User Management",
          description: "Manage staff accounts and roles.",
          href: "/admin/user-management",
          icon: UserCog,
        },
      ],
    },
  ];

  const visibleSections = sections.filter((section) => section.show);

  return (
    <AdminPageLayout requireModerator
      title="Admin"
      description="Staff tools organized by area — pick a section to get started."
      authTitle="Sign in to access the admin panel"
    >
      <div className="space-y-8">
        {(isModeratorOrAdmin || isAdmin || hasEventBanAccess) && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Operations
              </h2>
              <Badge variant="outline" className="text-[10px]">
                Read-only
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {isModeratorOrAdmin && (
                <OperationsCard
                  title="Events needing setup"
                  value={eventSummary?.needsSetup ?? "..."}
                  description="Review readiness badges in Events Manager."
                  href="/admin/events-manager"
                  tone={eventSummary && eventSummary.needsSetup > 0 ? "attention" : "good"}
                />
              )}
              {isAdmin && (
                <>
                  <OperationsCard
                    title="Unmatched import players"
                    value={importSummary?.unmatchedPlayers ?? "..."}
                    description="Resolve matches from Uploads & Imports."
                    href="/admin/uploads"
                    tone={importSummary && importSummary.unmatchedPlayers > 0 ? "attention" : "good"}
                  />
                  <OperationsCard
                    title="Unlinked imports"
                    value={importSummary?.unlinkedImports ?? "..."}
                    description="Link imports to existing events where useful."
                    href="/admin/uploads"
                    tone={importSummary && importSummary.unlinkedImports > 0 ? "attention" : "good"}
                  />
                  <OperationsCard
                    title="Unsynced Yunite match data"
                    value={importSummary?.unsyncedYuniteImports ?? "..."}
                    description="Yunite imports missing match sync; behaviour unchanged."
                    href="/admin/uploads"
                    tone={
                      importSummary && importSummary.unsyncedYuniteImports > 0
                        ? "attention"
                        : "good"
                    }
                  />
                  <OperationsCard
                    title="Kill discrepancies"
                    value={importSummary?.importsWithKillDiscrepancies ?? "..."}
                    description="Yunite API team kills ≠ kill-feed sum; review in Uploads."
                    href="/admin/uploads"
                    tone={
                      importSummary && importSummary.importsWithKillDiscrepancies > 0
                        ? "attention"
                        : "good"
                    }
                  />
                </>
              )}
              {isModeratorOrAdmin && eventSummary && eventSummary.withUnsyncedYuniteData > 0 && (
                <OperationsCard
                  title="Events with unsynced Yunite"
                  value={eventSummary.withUnsyncedYuniteData}
                  description="Linked events with Yunite imports still awaiting match sync."
                  href="/admin/events-manager"
                  tone="attention"
                />
              )}
              {hasEventBanAccess && (
                <OperationsCard
                  title="Pending Discord role sync"
                  value={
                    banRoleSync
                      ? banRoleSync.pendingRoleAdds + banRoleSync.pendingRoleRemovals
                      : "..."
                  }
                  description="Visibility only; bot sync behaviour is unchanged."
                  href="/admin/event-bans"
                  tone={
                    banRoleSync &&
                    banRoleSync.pendingRoleAdds + banRoleSync.pendingRoleRemovals > 0
                      ? "attention"
                      : "good"
                  }
                />
              )}
            </div>
          </section>
        )}
        {visibleSections.map((section) => (
          <HubSectionGrid key={section.title} title={section.title} links={section.links} />
        ))}
      </div>
    </AdminPageLayout>
  );
}
