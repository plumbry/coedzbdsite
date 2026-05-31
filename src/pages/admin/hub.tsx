import { Link } from "react-router-dom";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import {
  Users,
  Shield,
  ShieldAlert,
  GitMerge,
  Calendar,
  ListChecks,
  Upload,
  Trophy,
  BarChart3,
  TrendingUp,
  Ban,
  ScrollText,
  KeyRound,
  Dices,
  Database,
  HardDrive,
  Wrench,
  Sparkles,
  Zap,
  MessageSquare,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";

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

export default function AdminHubPage() {
  const { isAdmin, isModeratorOrAdmin, hasEventBanAccess } = useUserRole();

  const sections: HubSection[] = [
    {
      title: "People",
      show: isAdmin,
      links: [
        {
          title: "Member Management",
          description: "Applications, accepted members, and Discord evaluation queue.",
          href: "/admin/member-management/applications",
          icon: Users,
        },
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
        {
          title: "Fuzzy Matches",
          description: "Review uncertain player name matches from imports.",
          href: "/admin/fuzzy-matches",
          icon: GitMerge,
        },
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
          description: "CSV imports, third-party results, and Yunite tournament sync.",
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
          title: "Stats Hub",
          description: "All player and event analytics in one place.",
          href: "/admin/stats",
          icon: BarChart3,
        },
        {
          title: "Tier Re-Evaluation",
          description: "Automatic tier promotion and demotion suggestions.",
          href: "/admin/tier-re-evaluation",
          icon: TrendingUp,
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
          title: "Punishment Matrix",
          description: "Reference guide for minor and major infractions.",
          href: "/admin/punishment-matrix",
          icon: ScrollText,
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
        {
          title: "2025 Wrapped",
          description: "Edit and preview the seasonal Wrapped experience.",
          href: "/admin/2025-wrapped-editor",
          icon: Sparkles,
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
        {visibleSections.map((section) => (
          <HubSectionGrid key={section.title} title={section.title} links={section.links} />
        ))}
      </div>
    </AdminPageLayout>
  );
}
