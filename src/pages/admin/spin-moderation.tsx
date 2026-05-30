import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Input } from "@/components/ui/input.tsx";
import { KeyRound, Eye, EyeOff, Copy, Check, Pencil, Save } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import SiteHeader from "@/components/site-header.tsx";
import AdminSidebar from "./_components/admin-sidebar.tsx";
import { toast } from "sonner";

function SpinModerationContent() {
  const { hasEventBanAccess, isLoading } = useUserRole();
  const scrimEvents = useQuery(api.scrims.queries.listEventsAdmin);
  const setAdminCodeMutation = useMutation(api.scrims.mutations.setAdminCode);

  if (isLoading) {
    return (
      <div className="flex pt-14 lg:pt-0">
        <AdminSidebar />
        <main className="flex-1 p-2 sm:p-6 overflow-x-hidden">
          <div className="max-w-7xl mx-auto">
            <Skeleton className="h-96 w-full" />
          </div>
        </main>
      </div>
    );
  }

  if (!hasEventBanAccess) {
    return (
      <div className="flex pt-14 lg:pt-0">
        <AdminSidebar />
        <main className="flex-1 p-2 sm:p-6 overflow-x-hidden">
          <div className="max-w-7xl mx-auto text-center py-8">
            <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
            <p className="text-muted-foreground mb-6">
              This page is only accessible to Mods and above.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex pt-14 lg:pt-0">
      <AdminSidebar />
      <main className="flex-1 p-2 sm:p-6 overflow-x-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">Spin Moderation</h1>
            <p className="text-muted-foreground">
              Manage scrim event unlock codes for non-mod helpers.
            </p>
          </div>

          <div className="space-y-4">
            {/* Scrim Event Codes */}
            {scrimEvents === undefined ? (
              <Skeleton className="h-40 w-full" />
            ) : scrimEvents.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No scrim events found. Create one from the Spin page first.
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <KeyRound className="h-4 w-4" />
                    Scrim Event Codes
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Admin codes for scrim events. Share with helpers who need access to event controls.
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="space-y-3">
                    {scrimEvents.map((ev) => (
                      <ScrimEventCodeRow
                        key={ev._id}
                        event={ev}
                        onSaveAdminCode={async (adminCode) => {
                          await setAdminCodeMutation({ eventId: ev._id, adminCode });
                        }}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SpinModerationPage() {
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
        <SpinModerationContent />
      </Authenticated>
    </div>
  );
}

/** Row component for showing/editing a scrim event's admin code */
function ScrimEventCodeRow({
  event,
  onSaveAdminCode,
}: {
  event: {
    _id: string;
    eventName: string;
    adminToken: string;
    slug: string;
    _creationTime: number;
  };
  onSaveAdminCode: (adminCode: string) => Promise<void>;
}) {
  const [showAdminCode, setShowAdminCode] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [codeInput, setCodeInput] = useState(event.adminToken);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success("Copied!");
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleSaveCode = async () => {
    if (!codeInput.trim()) {
      toast.error("Please enter a code");
      return;
    }
    setSaving(true);
    try {
      await onSaveAdminCode(codeInput.trim());
      setEditingCode(false);
      toast.success("Admin code updated!");
    } catch {
      toast.error("Failed to save code");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate">{event.eventName}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {new Date(event._creationTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </div>

      {/* Admin Code */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-20 shrink-0">Admin code</span>
        {editingCode ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Enter new code"
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveCode();
                if (e.key === "Escape") setEditingCode(false);
              }}
              autoFocus
            />
            <Button size="sm" className="h-7 px-2 cursor-pointer" onClick={handleSaveCode} disabled={saving}>
              <Save className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 cursor-pointer" onClick={() => setEditingCode(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <code className="text-xs bg-background px-2 py-1 rounded border font-mono truncate">
              {showAdminCode ? event.adminToken : "••••••••••••"}
            </code>
            <button
              onClick={() => setShowAdminCode(!showAdminCode)}
              className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
            >
              {showAdminCode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => handleCopy(event.adminToken, `admin-${event._id}`)}
              className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
            >
              {copiedField === `admin-${event._id}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => {
                setCodeInput(event.adminToken);
                setEditingCode(true);
              }}
              className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
