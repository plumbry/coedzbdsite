import { PassportDemoView } from "./_components/passport-demo-view.tsx";
import { MOCK_QUEST_ENTRIES_COMPLETE } from "./_components/passport-mock-data.ts";

export default function SummerSlamPassportDemoCompletePage() {
  return (
    <PassportDemoView
      questEntries={MOCK_QUEST_ENTRIES_COMPLETE}
      profileStorageKey="summer-slam-passport-demo-complete-profile"
      defaultProfile={{ avatarId: "sunset", birthplaceId: "paradise_palms" }}
    />
  );
}
