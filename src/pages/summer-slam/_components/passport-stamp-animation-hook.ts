import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { getQuestStatus, type QuestEntry } from "./passport-types.ts";

export function useStampDropAnimation(quests: QuestEntry[]) {
  const reduceMotion = useReducedMotion();
  const [animatingQuestIds, setAnimatingQuestIds] = useState<Set<string>>(new Set());
  const readyRef = useRef(false);

  useEffect(() => {
    const approvedIds = quests
      .filter((entry) => getQuestStatus(entry) === "approved")
      .map((entry) => entry.quest._id);

    const key = "summer-slam-approved-quest-ids";
    const stored = sessionStorage.getItem(key);
    const previous = stored ? (JSON.parse(stored) as string[]) : approvedIds;

    if (readyRef.current && !reduceMotion) {
      const newlyApproved = approvedIds.filter((id) => !previous.includes(id));
      if (newlyApproved.length > 0) {
        setAnimatingQuestIds(new Set(newlyApproved));
      }
    }

    sessionStorage.setItem(key, JSON.stringify(approvedIds));
    readyRef.current = true;
  }, [quests, reduceMotion]);

  const clearAnimation = (questId: string) => {
    setAnimatingQuestIds((current) => {
      const next = new Set(current);
      next.delete(questId);
      return next;
    });
  };

  return { animatingQuestIds, clearAnimation, reduceMotion: !!reduceMotion };
}
