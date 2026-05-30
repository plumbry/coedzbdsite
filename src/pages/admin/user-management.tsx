import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import SiteHeader from "@/components/site-header.tsx";
import AdminSidebar from "./_components/admin-sidebar.tsx";
import UserManagementContent from "./_components/user-management-content.tsx";

export default function UserManagementPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      
      <Unauthenticated>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center space-y-6">
            <h1 className="text-4xl text-balance font-bold tracking-tight">
              Sign in to access user management
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
        <div className="flex min-h-screen pt-14 lg:pt-0 bg-background">
          <AdminSidebar />
          <div className="flex-1">
            <div className="container mx-auto px-4 py-4 max-w-6xl">
              <UserManagementContent />
            </div>
          </div>
        </div>
      </Authenticated>
    </div>
  );
}
