import { Link } from "react-router-dom";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { mobilePageHeaderActionsClass } from "@/lib/mobile-buttons.ts";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb.tsx";

export interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  back?: { label: string; href: string };
  breadcrumbs?: Array<{ label: string; href?: string }>;
  actions?: React.ReactNode;
  variant?: "default" | "compact";
  className?: string;
}

export default function PageHeader({
  title,
  description,
  icon: Icon,
  back,
  breadcrumbs,
  actions,
  variant = "default",
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("space-y-3", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <span key={`${crumb.label}-${index}`} className="contents">
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {isLast || !crumb.href ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link to={crumb.href}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </span>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      {back && (
        <Link
          to={back.href}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          {back.label}
        </Link>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <Icon
              className="h-5 w-5 shrink-0 text-primary mt-0.5"
              aria-hidden
            />
          )}
          <div className="min-w-0 space-y-1">
            <h1
              className={cn(
                "font-bold tracking-tight",
                variant === "compact"
                  ? "text-lg md:text-xl"
                  : "text-xl md:text-2xl",
              )}
            >
              {title}
            </h1>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className={cn(mobilePageHeaderActionsClass, "sm:w-auto sm:shrink-0")}>
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
