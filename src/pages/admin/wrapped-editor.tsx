import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import PageHeader from "@/components/page-header.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { toast } from "sonner";
import { Trash2, Plus, Save, Eye, CheckCircle2, GripVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { WRAPPED_STATS, type StatType } from "@/convex/wrappedStatsConfig.js";

interface StatConfig {
  type: StatType;
  customText: string;
  playerCount?: number;
  customValue?: string;
}

interface SectionConfig {
  name: string;
  tagline?: string;
  stats: StatConfig[];
}

// Convert config to format used by UI
const STAT_OPTIONS = WRAPPED_STATS.map((stat) => ({
  value: stat.id as StatType,
  label: stat.displayName,
  category: stat.category,
  requiresPlayerCount: stat.needsPlayerCount ?? false,
  description: stat.description,
}));

function WrappedEditorInner() {
  const navigate = useNavigate();
  const wrappedContent = useQuery(api.wrapped.getWrappedContent, { year: 2025 });
  const saveContent = useMutation(api.wrapped.saveWrappedContent);
  const publishContent = useMutation(api.wrapped.publishWrappedContent);
  const unpublishContent = useMutation(api.wrapped.unpublishWrappedContent);

  const [introTagline, setIntroTagline] = useState("");
  const [sponsors, setSponsors] = useState<Array<{ name: string; logoUrl: string }>>([]);
  const [sections, setSections] = useState<SectionConfig[]>([]);
  const [customMessage, setCustomMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Load existing content
  useEffect(() => {
    if (wrappedContent) {
      setIntroTagline(wrappedContent.introTagline || "Your year in competitive Fortnite");
      setSponsors(wrappedContent.sponsors.map((s) => ({ name: s.name, logoUrl: s.logoUrl || "" })));
      setSections((wrappedContent.sections || []) as SectionConfig[]);
      setCustomMessage(wrappedContent.customMessage || "");
    }
  }, [wrappedContent]);

  const addSection = () => {
    setSections([...sections, { name: "", stats: [] }]);
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const updateSection = (index: number, field: "name" | "tagline", value: string) => {
    const updated = [...sections];
    updated[index][field] = value;
    setSections(updated);
  };

  const addStatToSection = (sectionIndex: number) => {
    const updated = [...sections];
    updated[sectionIndex].stats.push({ type: "totalEvents", customText: "Total Events in 2025", customValue: "" });
    setSections(updated);
  };

  const removeStatFromSection = (sectionIndex: number, statIndex: number) => {
    const updated = [...sections];
    updated[sectionIndex].stats = updated[sectionIndex].stats.filter((_, i) => i !== statIndex);
    setSections(updated);
  };

  const updateStat = (sectionIndex: number, statIndex: number, field: keyof StatConfig, value: string | number) => {
    const updated = [...sections];
    if (field === "type") {
      updated[sectionIndex].stats[statIndex].type = value as StatType;
      const option = STAT_OPTIONS.find((opt) => opt.value === value);
      if (option) {
        updated[sectionIndex].stats[statIndex].customText = option.label;
      }
    } else if (field === "customText") {
      updated[sectionIndex].stats[statIndex].customText = value as string;
    } else if (field === "playerCount") {
      updated[sectionIndex].stats[statIndex].playerCount = value as number;
    } else if (field === "customValue") {
      updated[sectionIndex].stats[statIndex].customValue = value as string;
    }
    setSections(updated);
  };

  const addSponsor = () => {
    setSponsors([...sponsors, { name: "", logoUrl: "" }]);
  };

  const removeSponsor = (index: number) => {
    setSponsors(sponsors.filter((_, i) => i !== index));
  };

  const updateSponsor = (index: number, field: "name" | "logoUrl", value: string) => {
    const updated = [...sponsors];
    updated[index][field] = value;
    setSponsors(updated);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveContent({
        year: 2025,
        introTagline: introTagline || undefined,
        sponsors: sponsors.map((s) => ({
          name: s.name,
          logoUrl: s.logoUrl || undefined,
        })),
        sections: sections.map((section) => ({
          name: section.name,
          tagline: section.tagline || undefined,
          stats: section.stats.map((s) => ({
            type: s.type,
            customText: s.customText,
            playerCount: s.playerCount,
            customValue: s.customValue,
          })),
        })),
        customMessage: customMessage || undefined,
      });
      toast.success("Wrapped content saved");
    } catch (error) {
      toast.error("Failed to save content");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      await publishContent({ year: 2025 });
      toast.success("Wrapped page is now live!");
    } catch (error) {
      toast.error("Failed to publish");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    setIsPublishing(true);
    try {
      await unpublishContent({ year: 2025 });
      toast.success("Wrapped page unpublished");
    } catch (error) {
      toast.error("Failed to unpublish");
    } finally {
      setIsPublishing(false);
    }
  };

  if (wrappedContent === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const isPublished = wrappedContent?.isPublished ?? false;

  return (
    <div className="space-y-4">
      <PageHeader
        title="2025 Wrapped Editor"
        description="Organize stats into sections and customize the ZBD 2025 Wrapped page"
        variant="compact"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/2025-wrapped-preview")}>
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
            {isPublished ? (
              <Button variant="destructive" size="sm" onClick={handleUnpublish} disabled={isPublishing}>
                Unpublish
              </Button>
            ) : (
              <Button size="sm" onClick={handlePublish} disabled={isPublishing}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Publish
              </Button>
            )}
          </>
        }
      />

        {isPublished && (
          <Card className="border-green-500 bg-green-50 dark:bg-green-950">
            <CardHeader>
              <CardTitle className="text-green-700 dark:text-green-300">Published</CardTitle>
              <CardDescription className="text-green-600 dark:text-green-400">
                The 2025 Wrapped page is live at{" "}
                <a href="/2025-wrapped" className="underline">
                  /2025-wrapped
                </a>
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Intro Tagline */}
        <Card>
          <CardHeader>
            <CardTitle>Intro Slide</CardTitle>
            <CardDescription>Customize the tagline shown on the intro slide</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <Label>Tagline</Label>
              <Input
                placeholder="Your year in competitive Fortnite"
                value={introTagline}
                onChange={(e) => setIntroTagline(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Sections */}
        <Card>
          <CardHeader>
            <CardTitle>Sections</CardTitle>
            <CardDescription>Organize your wrapped stats into named sections</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {sections.map((section, sectionIndex) => (
              <div key={sectionIndex} className="space-y-4 rounded-lg border-2 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-5 w-5 text-muted-foreground" />
                    <Label className="text-lg font-semibold">Section {sectionIndex + 1}</Label>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeSection(sectionIndex)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                <div>
                  <Label>Section Name</Label>
                  <Input
                    placeholder="e.g., Player Stats, Tier Breakdown"
                    value={section.name}
                    onChange={(e) => updateSection(sectionIndex, "name", e.target.value)}
                  />
                </div>

                <div>
                  <Label>Section Tagline (Optional)</Label>
                  <Input
                    placeholder="e.g., Celebrating our top competitors"
                    value={section.tagline || ""}
                    onChange={(e) => updateSection(sectionIndex, "tagline", e.target.value)}
                  />
                </div>

                {/* Stats in this section */}
                <div className="space-y-3">
                  {section.stats.map((stat, statIndex) => {
                    const option = STAT_OPTIONS.find((opt) => opt.value === stat.type);
                    return (
                      <div key={statIndex} className="space-y-2 rounded border p-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Stat {statIndex + 1}</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeStatFromSection(sectionIndex, statIndex)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                        <Select
                          value={stat.type}
                          onValueChange={(value) => updateStat(sectionIndex, statIndex, "type", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(
                              STAT_OPTIONS.reduce(
                                (acc, opt) => {
                                  if (!acc[opt.category]) acc[opt.category] = [];
                                  acc[opt.category].push(opt);
                                  return acc;
                                },
                                {} as Record<string, typeof STAT_OPTIONS>
                              )
                            ).map(([category, options]) => (
                              <div key={category}>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                  {category}
                                </div>
                                {options.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Custom display text"
                          value={stat.customText}
                          onChange={(e) => updateStat(sectionIndex, statIndex, "customText", e.target.value)}
                        />
                        {option?.requiresPlayerCount && (
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            placeholder="Number of players"
                            value={stat.playerCount || 5}
                            onChange={(e) =>
                              updateStat(sectionIndex, statIndex, "playerCount", parseInt(e.target.value) || 5)
                            }
                          />
                        )}
                        {stat.type === "custom" && (
                          <Input
                            placeholder="Value (e.g., '42' or 'Over 1000 hours played')"
                            value={stat.customValue || ""}
                            onChange={(e) =>
                              updateStat(sectionIndex, statIndex, "customValue", e.target.value)
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addStatToSection(sectionIndex)}
                    className="w-full"
                  >
                    <Plus className="mr-2 h-3 w-3" />
                    Add Stat to Section
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" onClick={addSection} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Add Section
            </Button>
          </CardContent>
        </Card>

        {/* Custom Message */}
        <Card>
          <CardHeader>
            <CardTitle>Custom Message (Optional)</CardTitle>
            <CardDescription>
              Add a personal message that will appear at the end
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Thank you to everyone who made 2025 amazing..."
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={4}
            />
          </CardContent>
        </Card>

        {/* Sponsors */}
        <Card>
          <CardHeader>
            <CardTitle>Sponsors</CardTitle>
            <CardDescription>Add sponsors to thank them on the wrapped page</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sponsors.map((sponsor, index) => (
              <div key={index} className="space-y-2 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <Label>Sponsor {index + 1}</Label>
                  <Button variant="ghost" size="sm" onClick={() => removeSponsor(index)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <Input
                    placeholder="Sponsor name"
                    value={sponsor.name}
                    onChange={(e) => updateSponsor(index, "name", e.target.value)}
                  />
                  <Input
                    placeholder="Logo URL (optional)"
                    value={sponsor.logoUrl}
                    onChange={(e) => updateSponsor(index, "logoUrl", e.target.value)}
                  />
                </div>
              </div>
            ))}
            <Button variant="outline" onClick={addSponsor} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Add Sponsor
            </Button>
          </CardContent>
        </Card>
    </div>
  );
}

export default function WrappedEditorPage() {
  return (
    <AdminPageLayout authTitle="Sign in to edit the wrapped page" skipHeader>
      <WrappedEditorInner />
    </AdminPageLayout>
  );
}
