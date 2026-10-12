"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "@/components/ui/toast";
import { useTranslations } from "@/hooks/use-translations";

const OUTPUT_SIZE = 480; // px, square (2x2 photo)
const JPEG_QUALITY = 0.82;

/**
 * Center-crops the image to a square and re-encodes it as a small JPEG, so a phone photo of
 * several MB is stored as ~50KB. Runs in the browser; the original never leaves the device.
 */
async function toSquareJpeg(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas not supported");
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE
  );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

interface MemberPhotoProps {
  memberId: string;
  size?: "sm" | "md" | "lg";
  /** Admin: show upload/replace/remove controls */
  editable?: boolean;
}

/** Member identification photo (Reglamento Art. 13.5). */
export function MemberPhoto({ memberId, size = "md", editable = false }: MemberPhotoProps) {
  const { t } = useTranslations();
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { data: photo, isLoading } = trpc.members.getPhoto.useQuery({ memberId });

  const onChanged = () => {
    utils.members.getPhoto.invalidate({ memberId });
    utils.members.photoStatus.invalidate();
  };
  const setPhoto = trpc.members.setPhoto.useMutation({
    onSuccess: () => {
      onChanged();
      toast({ type: "success", title: t("memberPhoto.saved") });
    },
    onError: (error) => toast({ type: "error", title: t("memberPhoto.saveFailed"), description: error.message }),
  });
  const removePhoto = trpc.members.removePhoto.useMutation({ onSuccess: onChanged });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ type: "error", title: t("memberPhoto.notAnImage") });
      return;
    }
    setIsProcessing(true);
    try {
      setPhoto.mutate({ memberId, dataUrl: await toSquareJpeg(file) });
    } catch {
      toast({ type: "error", title: t("memberPhoto.notAnImage") });
    } finally {
      setIsProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const dimension = size === "lg" ? "h-28 w-28" : size === "md" ? "h-16 w-16" : "h-9 w-9";
  const busy = isProcessing || setPhoto.isPending || removePhoto.isPending;

  return (
    <div className={cn("flex items-center gap-3", size === "sm" && "gap-1")}>
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100",
          dimension
        )}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL from our DB
          <img src={photo.dataUrl} alt={t("memberPhoto.alt")} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-300">
            {isLoading || busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-1/2 w-1/2" />}
          </div>
        )}
      </div>

      {editable && (
        <div className={cn("flex", size === "sm" ? "gap-1" : "flex-col items-start gap-1")}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50 cursor-pointer"
            title={photo ? t("memberPhoto.replace") : t("memberPhoto.upload")}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            {size !== "sm" && (photo ? t("memberPhoto.replace") : t("memberPhoto.upload"))}
          </button>
          {photo && (
            <button
              type="button"
              disabled={busy}
              onClick={() => removePhoto.mutate({ memberId })}
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50 cursor-pointer"
              title={t("memberPhoto.remove")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {size !== "sm" && t("memberPhoto.remove")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
