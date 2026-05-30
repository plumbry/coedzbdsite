import { useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Upload } from "lucide-react";
import SiteHeader from "@/components/site-header.tsx";
import AdminSidebar from "./_components/admin-sidebar.tsx";
import ImportThirdParty from "./_components/import-third-party.tsx";
import ImportPlayersDialog from "../_components/import-players-dialog.tsx";
import YuniteDashboard from "./_components/yunite-dashboard.tsx";

export default function UploadsPage() {
  const [isImportPlayersDialogOpen, setIsImportPlayersDialogOpen] = useState(false);

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
            <div className="max-w-7xl mx-auto space-y-4">
              {/* Player CSV Import */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Import Player CSV</CardTitle>
                  <CardDescription className="text-xs">
                    Import player data from CSV file
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-3">
                  <Button size="sm" onClick={() => setIsImportPlayersDialogOpen(true)}>
                    <Upload className="mr-2 h-3.5 w-3.5" />
                    Import Player CSV
                  </Button>
                </CardContent>
              </Card>
              
              {/* Third Party CSV Import */}
              <ImportThirdParty />
              
              {/* Fetch Detailed Match Stats */}
              <YuniteDashboard showBulkSync={false} showOverview={false} />
            </div>
          </main>
        </div>

        <ImportPlayersDialog 
          open={isImportPlayersDialogOpen}
          onOpenChange={setIsImportPlayersDialogOpen}
        />
      </Authenticated>
    </div>
  );
}
