import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { opsMutationArgs, opsQueryArgs, type OpsHubTabProps } from "./types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Check, Copy, Save } from "lucide-react";
import { toast } from "sonner";

const MODE_OPTIONS = [
  { value: "duos", label: "Duos" },
  { value: "trios", label: "Trios" },
  { value: "squads", label: "Squads" },
  { value: "duos_into_squads", label: "Duos into Squads" },
] as const;

const EVENT_FORMAT_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "scrim_series", label: "Scrim Series" },
  { value: "showdown", label: "Showdown" },
] as const;

const VARIANT_OPTIONS = [
  { value: "zb", label: "ZB" },
  { value: "reload", label: "Reload" },
] as const;

type TemplateMode = (typeof MODE_OPTIONS)[number]["value"];
type TemplateEventFormat = (typeof EVENT_FORMAT_OPTIONS)[number]["value"];
type TemplateVariant = (typeof VARIANT_OPTIONS)[number]["value"];

export default function EventRulesTab({ viewerToken, canEdit = false }: OpsHubTabProps) {
  const templates = useQuery(
    api.opsHub.queries.listDiscordMarkdownTemplates,
    opsQueryArgs(viewerToken),
  );
  const upsertTemplate = useMutation(api.opsHub.mutations.upsertDiscordMarkdownTemplate);

  const [mode, setMode] = useState<TemplateMode>("duos");
  const [eventFormat, setEventFormat] = useState<TemplateEventFormat>("standard");
  const [variant, setVariant] = useState<TemplateVariant>("zb");
  const [markdownText, setMarkdownText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectedTemplate = useMemo(
    () =>
      templates?.find(
        (t) => t.mode === mode && t.eventFormat === eventFormat && t.variant === variant,
      ),
    [templates, mode, eventFormat, variant],
  );

  useEffect(() => {
    setMarkdownText(selectedTemplate?.markdown ?? "");
  }, [selectedTemplate?._id, selectedTemplate?.markdown]);

  const handleSave = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    try {
      await upsertTemplate(
        opsMutationArgs(viewerToken, {
          mode,
          eventFormat,
          variant,
          markdown: markdownText,
        }),
      );
      toast.success("Discord markdown saved");
    } catch {
      toast.error("Failed to save markdown");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdownText);
      setCopied(true);
      toast.success("Copied to clipboard");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const selectedModeLabel = MODE_OPTIONS.find((item) => item.value === mode)?.label ?? "Mode";
  const selectedEventFormatLabel =
    EVENT_FORMAT_OPTIONS.find((item) => item.value === eventFormat)?.label ?? "Format";
  const selectedVariantLabel =
    VARIANT_OPTIONS.find((item) => item.value === variant)?.label ?? "Variant";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Discord Markdown Templates</CardTitle>
        <CardDescription>
          Select mode, format, and variant to load the Discord-ready markdown for that event type.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as TemplateMode)}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Format</Label>
            <Select
              value={eventFormat}
              onValueChange={(value) => setEventFormat(value as TemplateEventFormat)}
            >
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                {EVENT_FORMAT_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Variant</Label>
            <Select value={variant} onValueChange={(value) => setVariant(value as TemplateVariant)}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="Select variant" />
              </SelectTrigger>
              <SelectContent>
                {VARIANT_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>
            Markdown Text ({selectedModeLabel} · {selectedEventFormatLabel} · {selectedVariantLabel})
          </Label>
          <Textarea
            value={markdownText}
            onChange={(event) => setMarkdownText(event.target.value)}
            rows={14}
            placeholder="Paste Discord markdown template here..."
            readOnly={!canEdit}
            className="font-mono text-xs"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="cursor-pointer"
            >
              <Save className="h-4 w-4 mr-1.5" />
              {isSaving ? "Saving..." : "Save Template"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => void handleCopy()}
            className="cursor-pointer"
            disabled={!markdownText.trim()}
          >
            {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
            {copied ? "Copied" : "Copy for Discord"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
