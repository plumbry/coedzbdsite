import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Loader2, Search } from "lucide-react";
import { ConvexError } from "convex/values";

type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "success";
      epicDisplayName?: string;
      epicAccountId?: string;
      verified?: boolean;
    }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

interface YuniteEpicLookupCardProps {
  discordUserId: string;
}

export default function YuniteEpicLookupCard({ discordUserId }: YuniteEpicLookupCardProps) {
  const lookupEpicRegistration = useAction(
    api.yunite.lookupEpicRegistration.lookupEpicRegistrationByDiscordId,
  );
  const [lookupState, setLookupState] = useState<LookupState>({ kind: "idle" });

  const handleLookup = async () => {
    setLookupState({ kind: "loading" });

    try {
      const result = await lookupEpicRegistration({ discordUserId });

      if (result.status === "success") {
        setLookupState({
          kind: "success",
          epicDisplayName: result.epicDisplayName,
          epicAccountId: result.epicAccountId,
          verified: result.verified,
        });
        return;
      }

      if (result.status === "not_found") {
        setLookupState({ kind: "not_found" });
        return;
      }

      setLookupState({
        kind: "error",
        message:
          result.errorMessage ??
          "Could not fetch Yunite registration. Check API key, endpoint, or Yunite permissions.",
      });
    } catch (error) {
      if (error instanceof ConvexError) {
        const message =
          typeof error.data === "object" &&
          error.data !== null &&
          "message" in error.data &&
          typeof (error.data as { message: unknown }).message === "string"
            ? (error.data as { message: string }).message
            : "Admin access required.";
        setLookupState({
          kind: "error",
          message,
        });
        return;
      }

      setLookupState({
        kind: "error",
        message:
          "Could not fetch Yunite registration. Check API key, endpoint, or Yunite permissions.",
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Yunite Epic Registration</CardTitle>
        <CardDescription>
          Fetch Yunite-verified Epic account data for Discord ID{" "}
          <span className="font-mono text-xs">{discordUserId}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleLookup}
          disabled={lookupState.kind === "loading"}
        >
          {lookupState.kind === "loading" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Lookup Yunite Epic ID
        </Button>

        {lookupState.kind === "loading" && (
          <p className="text-sm text-muted-foreground">Looking up Yunite registration…</p>
        )}

        {lookupState.kind === "success" && (
          <Alert>
            <AlertDescription className="space-y-1">
              <p>
                Epic: {lookupState.epicDisplayName ?? "—"}
              </p>
              <p className="font-mono text-xs break-all">
                Epic ID: {lookupState.epicAccountId ?? "—"}
              </p>
              <p>Verified via Yunite: {lookupState.verified ? "Yes" : "No"}</p>
            </AlertDescription>
          </Alert>
        )}

        {lookupState.kind === "not_found" && (
          <Alert>
            <AlertDescription>
              No Yunite registration found for this Discord user.
            </AlertDescription>
          </Alert>
        )}

        {lookupState.kind === "error" && (
          <Alert variant="destructive">
            <AlertDescription>{lookupState.message}</AlertDescription>
          </Alert>
        )}

        {/* TODO: Add "Save to player record" once staff can confirm lookup results. */}
      </CardContent>
    </Card>
  );
}
