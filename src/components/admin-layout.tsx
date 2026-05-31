import { Outlet } from "react-router-dom";
import SiteHeader from "@/components/site-header.tsx";

/** Wraps all /admin routes with the shared site header. */
export default function AdminLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <div className="flex min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
