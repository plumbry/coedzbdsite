import { toPng } from "html-to-image";
import type { SealProgress } from "@/pages/summer-slam/_components/passport-seal.ts";

export function passportHolderSlug(name: string) {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return slug.length > 0 ? slug.slice(0, 16) : "HOLDER";
}

export function buildPassportNumber(playerName: string) {
  return `SS-2026-${passportHolderSlug(playerName)}`;
}

export function getPassportCompletionDate(seals: SealProgress[]): Date | null {
  if (seals.length === 0 || seals.some((seal) => seal.state !== "earned")) return null;
  const times = seals
    .map((seal) => seal.earnedAt)
    .filter((value): value is number => value != null);
  if (times.length !== seals.length) return new Date();
  return new Date(Math.max(...times));
}

export function formatCertificateDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function sanitizePassportCertificateFilename(playerName: string) {
  const slug = playerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `summer-slam-passport-${slug}` : "summer-slam-passport-certificate";
}

export async function downloadPassportCertificateImage(
  element: HTMLElement,
  playerName: string,
): Promise<void> {
  const dataUrl = await toPng(element, {
    backgroundColor: "#FDFBF7",
    pixelRatio: 2,
    cacheBust: true,
  });

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${sanitizePassportCertificateFilename(playerName)}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
