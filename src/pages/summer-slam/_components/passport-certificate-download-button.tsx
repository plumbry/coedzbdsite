import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { downloadPassportCertificateImage } from "@/lib/passport-certificate-export.ts";
import {
  PassportCertificateImageExport,
  type PassportCertificateImageExportProps,
} from "./passport-certificate-image-export.tsx";

export function PassportCertificateDownloadButton({
  className,
  size = "sm",
  variant = "default",
  ...certificateProps
}: PassportCertificateImageExportProps & {
  className?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary";
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportRequested, setExportRequested] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    setIsExporting(true);
    setExportRequested(true);
  };

  useEffect(() => {
    if (!exportRequested) return;

    let cancelled = false;
    void (async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (cancelled || !captureRef.current) return;

      try {
        await downloadPassportCertificateImage(
          captureRef.current,
          certificateProps.playerName,
        );
        toast.success("Passport certificate downloaded");
      } catch {
        toast.error("Could not download certificate. Please try again.");
      } finally {
        if (!cancelled) {
          setExportRequested(false);
          setIsExporting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [exportRequested, certificateProps.playerName]);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleDownload}
        disabled={isExporting}
        className={cn("gap-2 touch-manipulation", className)}
      >
        {isExporting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Preparing…
          </>
        ) : (
          <>
            <Download className="h-4 w-4" aria-hidden />
            Download certificate
          </>
        )}
      </Button>

      {exportRequested ? (
        <div className="pointer-events-none fixed top-0 -left-[12000px]" aria-hidden>
          <PassportCertificateImageExport ref={captureRef} {...certificateProps} />
        </div>
      ) : null}
    </>
  );
}
