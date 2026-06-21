import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PassportExperience } from "./passport-experience.tsx";
import { MOCK_CAMPAIGN, MOCK_PLAYER } from "./passport-mock-data.ts";
import type { PassportAvatarId } from "./passport-avatars.ts";
import type { PassportBirthplaceId } from "./passport-birthplaces.ts";
import type { QuestEntry } from "./passport-types.ts";

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

export function PassportDemoView({
  questEntries,
  profileStorageKey,
  defaultProfile,
}: {
  questEntries: QuestEntry[];
  profileStorageKey: string;
  defaultProfile?: DemoProfile;
}) {
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

  return (
    <PassportExperience
      campaignTitle={MOCK_CAMPAIGN.title}
      playerName={MOCK_PLAYER.discordUsername}
      avatarId={demoAvatarId}
      birthplaceId={demoBirthplaceId}
      onSaveAvatar={async (avatarId) => {
        setDemoAvatarId(avatarId);
      }}
      onSaveBirthplace={async (birthplaceId) => {
        setDemoBirthplaceId(birthplaceId);
      }}
      quests={questEntries}
      campaign={MOCK_CAMPAIGN}
      onSubmitEvidence={async () => {
        toast.info("Demo mode — evidence is not submitted.");
      }}
    />
  );
}
