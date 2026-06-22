import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import PageShell from "@/components/page-shell.tsx";
import { CompactMobileButtonsOptOut } from "@/components/compact-mobile-buttons.tsx";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { PassportExperience } from "./passport-experience.tsx";
import { MOCK_CAMPAIGN, MOCK_PLAYER } from "./passport-mock-data.ts";
import {
  buildDemoQuestEntries,
  DEMO_ADMIN_CONFIG_STORAGE_KEY,
  loadDemoAdminConfig,
} from "./admin-mock-data.ts";
import type { PassportAvatarId } from "./passport-avatars.ts";
import type { PassportBirthplaceId } from "./passport-birthplaces.ts";
import type { QuestEntry } from "./passport-types.ts";
import { ssCard, ssPageBg } from "./passport-dashboard-theme.ts";

type DemoProfile = {
  avatarId: PassportAvatarId | null;
  birthplaceId: PassportBirthplaceId | null;
};

function loadDemoProfile(
  storageKey: string,
  defaults?: DemoProfile,
): DemoProfile {
  if (typeof window === "undefined") {
    return defaults ?? { avatarId: null, birthplaceId: null };
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaults ?? { avatarId: null, birthplaceId: null };
    return JSON.parse(raw) as DemoProfile;
  } catch {
    return defaults ?? { avatarId: null, birthplaceId: null };
  }
}

function saveDemoProfile(storageKey: string, profile: DemoProfile) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(profile));
  } catch {
    /* ignore storage failures */
  }
}

function DemoToolbar() {
  return (
    <div className="fixed top-3 right-3 z-50 flex flex-wrap items-center gap-2 rounded-full border border-orange-200 bg-white/90 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <span className="font-medium text-orange-800">Demo config</span>
      <a href="/summer-slam/admin/demo" className="font-medium text-teal-700 hover:underline">
        Admin
      </a>
      <a href="/summer-slam/passport/demo/complete" className="font-medium text-teal-700 hover:underline">
        Complete
      </a>
    </div>
  );
}

export function PassportDemoView({
  questEntries,
  profileStorageKey,
  defaultProfile,
}: {
  questEntries: QuestEntry[];
  profileStorageKey: string;
  defaultProfile?: DemoProfile;
}) {
  const [adminConfig, setAdminConfig] = useState(() => loadDemoAdminConfig());
  const [demoAvatarId, setDemoAvatarId] = useState<PassportAvatarId | null>(
    () => loadDemoProfile(profileStorageKey, defaultProfile).avatarId,
  );
  const [demoBirthplaceId, setDemoBirthplaceId] = useState<PassportBirthplaceId | null>(
    () => loadDemoProfile(profileStorageKey, defaultProfile).birthplaceId,
  );

  useEffect(() => {
    saveDemoProfile(profileStorageKey, {
      avatarId: demoAvatarId,
      birthplaceId: demoBirthplaceId,
    });
  }, [demoAvatarId, demoBirthplaceId, profileStorageKey]);

  useEffect(() => {
    const refreshConfig = () => setAdminConfig(loadDemoAdminConfig());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === DEMO_ADMIN_CONFIG_STORAGE_KEY) refreshConfig();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("summer-slam-admin-demo-config-updated", refreshConfig);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("summer-slam-admin-demo-config-updated", refreshConfig);
    };
  }, []);

  const demoQuestEntries = useMemo(
    () => buildDemoQuestEntries(adminConfig, questEntries),
    [adminConfig, questEntries],
  );
  const demoCampaign = {
    ...MOCK_CAMPAIGN,
    ...adminConfig.campaign,
  };

  if (!adminConfig.campaign.isActive) {
    return (
      <>
        <DemoToolbar />
        <CompactMobileButtonsOptOut>
          <PageShell maxWidth="narrow" className={ssPageBg}>
            <Card className={`${ssCard} mt-10 shadow-none`}>
              <CardHeader>
                <CardTitle>Campaign Archived</CardTitle>
                <CardDescription className="space-y-3 text-base leading-relaxed">
                  <span className="block">
                    The demo admin configuration currently has the campaign archived.
                  </span>
                  <a href="/summer-slam/admin/demo" className="font-medium text-primary underline">
                    Reopen the admin demo to activate it.
                  </a>
                </CardDescription>
              </CardHeader>
            </Card>
          </PageShell>
        </CompactMobileButtonsOptOut>
      </>
    );
  }

  return (
    <>
      <DemoToolbar />
      <PassportExperience
        campaignTitle={adminConfig.campaign.title}
        playerName={MOCK_PLAYER.discordUsername}
        avatarId={demoAvatarId}
        birthplaceId={demoBirthplaceId}
        onSaveAvatar={async (avatarId) => {
          setDemoAvatarId(avatarId);
        }}
        onSaveBirthplace={async (birthplaceId) => {
          setDemoBirthplaceId(birthplaceId);
        }}
        quests={demoQuestEntries}
        campaign={demoCampaign}
        onSubmitEvidence={async () => {
          toast.info("Demo mode — evidence is not submitted.");
        }}
      />
    </>
  );
}
