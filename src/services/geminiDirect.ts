import { Preferences } from "@capacitor/preferences";

const PREF_KEY_GEMINI_API = "vidtrans_gemini_api_key";

export async function getStoredApiKey(): Promise<string> {
  try {
    const { value } = await Preferences.get({ key: PREF_KEY_GEMINI_API });
    if (value && value.trim()) {
      return value.trim();
    }
  } catch (e) {
    // Fallback to localStorage if Capacitor Preferences fails
  }
  return (localStorage.getItem(PREF_KEY_GEMINI_API) || "").trim();
}

export async function setStoredApiKey(apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  try {
    await Preferences.set({ key: PREF_KEY_GEMINI_API, value: trimmed });
  } catch (e) {
    // ignore
  }
  localStorage.setItem(PREF_KEY_GEMINI_API, trimmed);
}

export async function removeStoredApiKey(): Promise<void> {
  try {
    await Preferences.remove({ key: PREF_KEY_GEMINI_API });
  } catch (e) {
    // ignore
  }
  localStorage.removeItem(PREF_KEY_GEMINI_API);
}

export async function testGeminiConnection(apiKey: string): Promise<{ ok: boolean; message: string }> {
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, message: "يرجى إدخال مفتاح API أولاً." };
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}&pageSize=1`,
      { method: "GET" }
    );

    if (res.ok) {
      return { ok: true, message: "تم التحقق من المفتاح بنجاح! الاتصال جاهز." };
    }

    const data = await res.json().catch(() => ({}));
    const errorMsg = data?.error?.message || `رمز الخطأ: ${res.status}`;
    if (res.status === 400 || res.status === 403 || errorMsg.includes("API key not valid")) {
      return { ok: false, message: "مفتاح API غير صالح أو غير مفعل. يرجى التحقق منه في Google AI Studio." };
    }
    return { ok: false, message: `فشل الاتصال: ${errorMsg}` };
  } catch (err: any) {
    return {
      ok: false,
      message: "تعذر الاتصال بخوادم Google. تأكد من اتصال هاتفك بالإنترنت.",
    };
  }
}

// Convert a Blob/File to Base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

export interface DirectUploadResult {
  fileUri?: string;
  fileName?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

// Uploads media directly to Google Gemini Files API or converts to inlineData fallback
export async function uploadMediaDirect(
  file: File,
  apiKey: string,
  onStatus?: (msg: string) => void
): Promise<DirectUploadResult> {
  const mimeType = file.type || (file.name.endsWith(".mp3") ? "audio/mp3" : "video/mp4");

  onStatus?.("جاري بدء رفع الملف مباشرة إلى سيرفرات Gemini...");

  try {
    // Step 1: Initialize Resumable Upload
    const initRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(file.size),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file: {
            display_name: file.name,
          },
        }),
      }
    );

    const uploadUrl = initRes.headers.get("x-goog-upload-url") || initRes.headers.get("X-Goog-Upload-URL");

    if (!uploadUrl) {
      throw new Error("لم نتمكن من الحصول على رابط رفع الملف المباشر من Google.");
    }

    onStatus?.("جاري نقل بيانات الفيديو/الصوت إلى Google...");

    // Step 2: Upload file data
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(file.size),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: file,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      throw new Error(`فشل رفع الملف إلى Gemini: ${errText || uploadRes.status}`);
    }

    const uploadData = await uploadRes.json();
    const uploadedFile = uploadData.file;

    if (!uploadedFile || !uploadedFile.uri) {
      throw new Error("لم ترجع خوادم Google معرّفاً صالحاً للملف المرفوع.");
    }

    // Step 3: Wait for video processing if state is PROCESSING
    let currentState = uploadedFile.state;
    let waitSeconds = 0;
    while (currentState === "PROCESSING" && waitSeconds < 90) {
      onStatus?.(`جاري انتظار معالجة الفيديو في Google (${waitSeconds} ثانية)...`);
      await new Promise((r) => setTimeout(r, 2500));
      waitSeconds += 2;

      const checkRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${uploadedFile.name}?key=${encodeURIComponent(apiKey)}`
      );
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        currentState = checkData.state;
        if (currentState === "FAILED") {
          throw new Error("فشلت معالجة ملف الفيديو من قِبل خوادم Google.");
        }
      }
    }

    onStatus?.("اكتمل الرفع بنجاح، جاري استدعاء نموذج الذكاء الاصطناعي...");

    return {
      fileUri: uploadedFile.uri,
      fileName: uploadedFile.name,
    };
  } catch (directUploadError: any) {
    console.warn("Direct resumable upload failed, attempting inline base64 fallback:", directUploadError);

    // Fallback for smaller files
    if (file.size <= 25 * 1024 * 1024) {
      onStatus?.("جاري تحويل الملف للمعالجة المباشرة...");
      const base64Data = await fileToBase64(file);
      return {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      };
    }

    throw directUploadError;
  }
}

// Generate Subtitle SRT directly from Gemini API
export async function generateSubtitlesDirect(
  file: File,
  targetLang: string,
  apiKey: string,
  onStatus?: (msg: string) => void
): Promise<string> {
  const uploadResult = await uploadMediaDirect(file, apiKey, onStatus);

  // Exact prompt from the original VidTrans IA application
  const prompt = `قم بالاستماع إلى هذا الملف الصوتي أو الفيديو، واكتب تفريغاً للنص مع التوقيتات الزمنية، ثم قم بترجمته وترتيبه حصراً إلى اللغة ${targetLang}.
يجب أن يكون الناتج بصيغة ملف ترجمة SRT نظامية تماماً بالشكل التالي بدون أي زيادة أو رموز غريبة:
1
00:00:21,500 --> 00:00:23,500
النص المترجم هنا

احرص على استخدام السهم القياسي حصراً (-->) في جميع التوقيتات.`;

  const partMedia = uploadResult.fileUri
    ? {
        file_data: {
          file_uri: uploadResult.fileUri,
          mime_type: file.type || "video/mp4",
        },
      }
    : {
        inline_data: uploadResult.inlineData,
      };

  const payload = {
    contents: [
      {
        parts: [partMedia, { text: prompt }],
      },
    ],
  };

  const candidateModels = [
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.5-transcribe",
  ];

  let lastError: any = null;

  for (const model of candidateModels) {
    try {
      onStatus?.(`جاري تفريغ وترجمة الملف عبر نموذج ${model}...`);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errMsg = errorData?.error?.message || `HTTP ${res.status}`;

        if (
          res.status === 503 ||
          res.status === 429 ||
          errMsg.includes("UNAVAILABLE") ||
          errMsg.includes("high demand")
        ) {
          console.log(`[Direct Gemini] Model ${model} is busy, switching to next candidate...`);
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }

        throw new Error(errMsg);
      }

      const responseJson = await res.json();
      const rawText =
        responseJson?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!rawText.trim()) {
        throw new Error("لم يرجع النموذج أي نص للترجمة.");
      }

      // Cleanup remote file in Gemini storage
      if (uploadResult.fileName) {
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/${uploadResult.fileName}?key=${encodeURIComponent(apiKey)}`,
          { method: "DELETE" }
        ).catch(() => {});
      }

      // Clean markdown code blocks
      let cleanedSrt = rawText.trim();
      cleanedSrt = cleanedSrt.replace(/^```[a-zA-Z]*\n/, "");
      cleanedSrt = cleanedSrt.replace(/\n```$/, "");
      return cleanedSrt.trim();
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || err);
      if (
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("high demand") ||
        msg.includes("429")
      ) {
        continue;
      }
      break;
    }
  }

  // Attempt cleanup on failure as well
  if (uploadResult.fileName) {
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/${uploadResult.fileName}?key=${encodeURIComponent(apiKey)}`,
      { method: "DELETE" }
    ).catch(() => {});
  }

  throw lastError || new Error("فشل توليد الترجمة من جميع نماذج Gemini المتاحة.");
}
