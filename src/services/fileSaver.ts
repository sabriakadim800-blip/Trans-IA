import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export interface SaveAndShareResult {
  success: boolean;
  savedPath?: string;
  shared?: boolean;
  error?: string;
}

// Save SRT file to device and offer native share sheet
export async function saveAndShareSrt(
  srtContent: string,
  fileName: string
): Promise<SaveAndShareResult> {
  const finalFileName = fileName.endsWith(".srt") ? fileName : `${fileName}.srt`;

  if (Capacitor.isNativePlatform()) {
    try {
      // 1. Write file to device Documents directory
      const writeResult = await Filesystem.writeFile({
        path: finalFileName,
        data: srtContent,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });

      // 2. Also offer Android Native Share Sheet
      let shared = false;
      try {
        const canShare = await Share.canShare();
        if (canShare.value) {
          await Share.share({
            title: finalFileName,
            text: `ملف ترجمة مُنشأ بواسطة VidTrans IA: ${finalFileName}`,
            url: writeResult.uri,
            dialogTitle: "مشاركة أو فتح ملف الترجمة",
          });
          shared = true;
        }
      } catch (shareErr) {
        console.warn("Native share canceled or unhandled:", shareErr);
      }

      return {
        success: true,
        savedPath: `Documents/${finalFileName}`,
        shared,
      };
    } catch (fsErr: any) {
      console.error("Capacitor Filesystem error:", fsErr);
      // Fallback to web download if native filesystem had an unexpected permission error
    }
  }

  // Web fallback (standard browser download)
  try {
    const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = finalFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return {
      success: true,
      savedPath: finalFileName,
      shared: false,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "فشل حفظ الملف",
    };
  }
}

// Native share directly
export async function shareSrtDirect(srtContent: string, fileName: string): Promise<boolean> {
  const finalFileName = fileName.endsWith(".srt") ? fileName : `${fileName}.srt`;

  if (Capacitor.isNativePlatform()) {
    try {
      // Write to Cache directory first for sharing
      const writeResult = await Filesystem.writeFile({
        path: finalFileName,
        data: srtContent,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      await Share.share({
        title: finalFileName,
        text: `ملف ترجمة: ${finalFileName}`,
        url: writeResult.uri,
        dialogTitle: "مشاركة ملف الترجمة",
      });
      return true;
    } catch (e) {
      console.warn("Share failed:", e);
      return false;
    }
  }

  // Web fallback for sharing
  if (navigator.share) {
    try {
      const file = new File([srtContent], finalFileName, { type: "text/plain" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: finalFileName,
        });
        return true;
      }
    } catch (e) {
      // ignore
    }
  }

  return false;
}
