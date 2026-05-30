import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import SiteHeader from "@/components/site-header.tsx";
import AdminSidebar from "./_components/admin-sidebar.tsx";
import SupportPanel from "./_components/support-panel.tsx";

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      
      <Unauthenticated>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center space-y-6">
            <h1 className="text-4xl text-balance font-bold tracking-tight">
              Sign in to access staff panel
            </h1>
            <SignInButton />
          </div>
        </div>
      </Unauthenticated>

      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center">
          <Skeleton className="h-96 w-full max-w-6xl" />
        </div>
      </AuthLoading>

      <Authenticated>
        <div className="flex pt-14 lg:pt-0">
          <AdminSidebar />
          <main className="flex-1 p-6 overflow-x-auto">
            <div className="max-w-7xl mx-auto">
              <SupportPanel />
            </div>
          </main>
        </div>
      </Authenticated>
    </div>
  );
}
