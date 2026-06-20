import { forwardRef } from "react";
import { PASSPORT_HEADER } from "./passport-assets.ts";
import { getPassportAvatar } from "./passport-avatars.ts";
import { getPassportBirthplaceLabel } from "./passport-birthplaces.ts";
import { SEAL_META, SEAL_ORDER, type SealProgress } from "./passport-seal.ts";
import type { PassportAvatarId } from "./passport-avatars.ts";
import type { PassportBirthplaceId } from "./passport-birthplaces.ts";
import {
  buildPassportNumber,
  formatCertificateDate,
  getPassportCompletionDate,
} from "@/lib/passport-certificate-export.ts";

const ZBD_LOGO_SRC = "/icon/co-ed-zbd-logo.jpg";

export type PassportCertificateImageExportProps = {
  playerName: string;
  avatarId: PassportAvatarId | null | undefined;
  birthplaceId: PassportBirthplaceId | null | undefined;
  seals: SealProgress[];
  seasonStartsAt?: number;
  seasonEndsAt?: number;
};

export const PassportCertificateImageExport = forwardRef<
  HTMLDivElement,
  PassportCertificateImageExportProps
>(function PassportCertificateImageExport(
  { playerName, avatarId, birthplaceId, seals, seasonStartsAt, seasonEndsAt },
  ref,
) {
  const avatar = getPassportAvatar(avatarId);
  const birthplace = getPassportBirthplaceLabel(birthplaceId);
  const passportNo = buildPassportNumber(playerName);
  const completedAt = getPassportCompletionDate(seals);
  const completedLabel = completedAt ? formatCertificateDate(completedAt) : "Summer 2026";

  const seasonLabel =
    seasonStartsAt != null
      ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(
          new Date(seasonStartsAt),
        )
      : "Summer 2026";

  const expiryLabel =
    seasonEndsAt != null
      ? new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(new Date(seasonEndsAt))
      : null;

  return (
    <div
      ref={ref}
      style={{
        width: 900,
        fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        color: "#431407",
        background: "#FDFBF7",
        border: "3px double rgba(251, 146, 60, 0.45)",
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.65)",
      }}
    >
      <div
        style={{
          padding: "28px 36px 32px",
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(120,100,80,0.08) 0 1px, transparent 1px 14px)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <img
            src={PASSPORT_HEADER.src}
            alt=""
            width={PASSPORT_HEADER.width}
            height={PASSPORT_HEADER.height}
            style={{ width: 420, height: "auto", display: "block" }}
          />
        </div>

        <p
          style={{
            margin: "0 0 6px",
            textAlign: "center",
            fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "rgba(15, 118, 110, 0.75)",
          }}
        >
          Certificate of Completion
        </p>
        <h1
          style={{
            margin: "0 0 24px",
            textAlign: "center",
            fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: "#431407",
          }}
        >
          Summer Slam Passport
        </h1>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 28,
            padding: "18px 20px",
            borderRadius: 14,
            border: "1px solid rgba(251, 146, 60, 0.35)",
            background: "rgba(255,255,255,0.45)",
          }}
        >
          {avatar ? (
            <img
              src={avatar.image}
              alt=""
              width={88}
              height={88}
              style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "contain" }}
            />
          ) : (
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: "50%",
                border: "2px dashed rgba(251, 146, 60, 0.45)",
                background: "rgba(255,247,237,0.6)",
              }}
            />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              style={{
                margin: 0,
                fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif",
                fontSize: 34,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                lineHeight: 1.1,
                color: "#431407",
              }}
            >
              {playerName}
            </p>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "rgba(67, 20, 7, 0.65)" }}>
              Summer Slam Passport Holder · Season {seasonLabel}
            </p>
            <p
              style={{
                margin: "10px 0 0",
                fontFamily: "Menlo, monospace",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.04em",
                color: "rgba(67, 20, 7, 0.8)",
              }}
            >
              {passportNo}
            </p>
            {birthplace ? (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "rgba(67, 20, 7, 0.7)" }}>
                Birthplace: {birthplace}
              </p>
            ) : null}
          </div>
        </div>

        <p
          style={{
            margin: "0 0 12px",
            textAlign: "center",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(15, 118, 110, 0.75)",
          }}
        >
          Stamp Collection — 5 / 5
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 10,
            marginBottom: 28,
          }}
        >
          {SEAL_ORDER.map((id) => {
            const meta = SEAL_META[id];
            return (
              <div key={id} style={{ textAlign: "center" }}>
                <img
                  src={meta.image}
                  alt=""
                  width={512}
                  height={512}
                  style={{ width: "100%", maxWidth: 96, height: "auto", display: "block", margin: "0 auto" }}
                />
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "rgba(67, 20, 7, 0.65)",
                  }}
                >
                  {meta.label}
                </p>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            paddingTop: 16,
            borderTop: "1px dashed rgba(251, 146, 60, 0.35)",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(67, 20, 7, 0.45)",
              }}
            >
              Completed
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, color: "#431407" }}>
              {completedLabel}
            </p>
            {expiryLabel ? (
              <p style={{ margin: "10px 0 0", fontSize: 11, color: "rgba(67, 20, 7, 0.6)" }}>
                Season expiry: {expiryLabel}
              </p>
            ) : null}
          </div>

          <div style={{ textAlign: "right" }}>
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(15, 118, 110, 0.55)",
              }}
            >
              Issuing Authority
            </p>
            <p
              style={{
                margin: "0 0 10px",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "rgba(15, 118, 110, 0.65)",
              }}
            >
              Summer Slam Passport Office
            </p>
            <img
              src={ZBD_LOGO_SRC}
              alt=""
              width={48}
              height={48}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                objectFit: "cover",
                opacity: 0.88,
                marginLeft: "auto",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
