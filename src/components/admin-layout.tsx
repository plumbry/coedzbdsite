import { Outlet } from "react-router-dom";
import SiteHeader from "@/components/site-header.tsx";

/** Wraps all /admin routes with the shared site header. */
export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <Outlet />
    </div>
  );
}
