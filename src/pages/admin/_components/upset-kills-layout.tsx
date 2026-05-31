import { Link, useLocation } from "react-router-dom";
import {
  CrosshairIcon,
  SearchIcon,
  SkullIcon,
  SwordsIcon,
  TargetIcon,
  type LucideIcon,
} from "lucide-react";
import PageHeader from "@/components/page-header.tsx";
import { cn } from "@/lib/utils.ts";

const TABS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/admin/upset-kills", label: "Overview", icon: SwordsIcon, exact: true },
  { href: "/admin/upset-kills/search", label: "Search", icon: SearchIcon },
  { href: "/admin/upset-kills/h2h", label: "Head-to-Head", icon: SwordsIcon },
  { href: "/admin/upset-kills/top", label: "Top Kills", icon: TargetIcon },
  { href: "/admin/upset-kills/eliminations", label: "Eliminations", icon: CrosshairIcon },
];

function UpsetKillsNav() {
  const { pathname } = useLocation();

  return (
    <nav className="flex flex-wrap gap-1 border-b pb-px">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            to={tab.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-border bg-background text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

type UpsetKillsLayoutProps = {
  children: React.ReactNode;
  actions?: React.ReactNode;
};

export default function UpsetKillsLayout({ children, actions }: UpsetKillsLayoutProps) {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Upset Kills"
        icon={SkullIcon}
        description="Track when lower-tier players eliminate higher-tier players. Data from Yunite replay kill feeds — knocker always gets credit."
        variant="compact"
        actions={actions}
      />
      <UpsetKillsNav />
      {children}
    </div>
  );
}
