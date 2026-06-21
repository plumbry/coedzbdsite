import { PassportDemoView } from "./_components/passport-demo-view.tsx";
import { MOCK_QUEST_ENTRIES } from "./_components/passport-mock-data.ts";

export default function SummerSlamPassportDemoPage() {
  return (
    <PassportDemoView
      questEntries={MOCK_QUEST_ENTRIES}
      profileStorageKey="summer-slam-passport-demo-profile"
    />
  );
}
