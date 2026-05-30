import { useConvexAuth } from "convex/react";
import SiteHeader from "@/components/site-header.tsx";
import AdminSidebar from "./_components/admin-sidebar.tsx";
import EventBansManager from "./_components/event-bans-manager.tsx";

export default function EventBansPage() {
  const { isAuthenticated } = useConvexAuth();

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="flex pt-14 lg:pt-0">
        {isAuthenticated && <AdminSidebar />}
        <main className="flex-1 p-2 sm:p-6 overflow-x-hidden">
          <div className="max-w-7xl mx-auto">
            <EventBansManager />
          </div>
        </main>
      </div>
    </div>
  );
}
