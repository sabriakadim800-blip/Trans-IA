import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

// Set up temporary upload storage
const uploadDir = path.join("/tmp", "vidtrans-uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeName = Date.now() + "-" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, safeName);
  },
});

const MAX_UPLOAD_SIZE = 30 * 1024 * 1024; // 30 MB (compatible with reverse proxy limit)

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
  },
});

app.use(express.json({ limit: "20mb" }));

// Custom middleware to catch Multer errors and return clean JSON
const handleUpload = (req: any, res: any, next: any) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      console.error("Multer upload error:", err);
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            error: "حجم الملف كبير جداً (أكثر من 30 ميغابايت). يرجى اختيار ملف أصغر أو استخراج الصوت منه أولاً.",
          });
        }
        return res.status(400).json({
          error: `خطأ في رفع الملف: ${err.message}`,
        });
      }
      return res.status(400).json({
        error: `تعذر معالجة الملف المرفوع: ${err.message || err}`,
      });
    }
    next();
  });
};

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "VidTrans IA" });
});

// Helper for friendly error messages from Gemini API
function formatGeminiError(err: any): string {
  const raw = err?.message || String(err || "");
  
  // Check if raw is a JSON string with an error object
  let parsedCode: any = null;
  let parsedMsg: string = "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed.error) {
      parsedCode = parsed.error.code || parsed.error.status;
      parsedMsg = parsed.error.message || "";
    }
  } catch (_) {
    // not JSON
  }

  const is503 =
    parsedCode === 503 ||
    parsedCode === "UNAVAILABLE" ||
    raw.includes("503") ||
    raw.includes("high demand") ||
    raw.includes("UNAVAILABLE") ||
    raw.includes("overloaded");

  if (is503) {
    return "نموذج الذكاء الاصطناعي يواجه ضغطاً مرتفعاً ومؤقتاً في الوقت الحالي. تم تكرار المحاولة تلقائياً عدة مرات، يرجى الانتظار بضع لحظات ثم النقر على زر المعالجة مجدداً.";
  }

  const is429 =
    parsedCode === 429 ||
    parsedCode === "RESOURCE_EXHAUSTED" ||
    raw.includes("429") ||
    raw.includes("RESOURCE_EXHAUSTED");

  if (is429) {
    return "تم تجاوز حد الطلبات المسموح به مؤقتاً (Rate Limit). يرجى الانتظار دقيقة واحدة ثم إعادة المحاولة.";
  }

  if (raw.includes("API key not valid") || raw.includes("API_KEY_INVALID")) {
    return "مفتاح Gemini API غير صالح. يُرجى التحقق من المفتاح في إعدادات التطبيق (Settings > Secrets).";
  }

  if (parsedMsg) {
    return `تعذر استخراج الترجمة: ${parsedMsg}`;
  }

  return `حدث خطأ أثناء معالجة الترجمة: ${raw.slice(0, 300)}`;
}

// Generate content with fast fallback across candidate models
async function generateSubtitlesWithRetry(ai: GoogleGenAI, contents: any) {
  // Pool of candidate models for transcription & translation in priority order
  const modelsToTry = [
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.5-transcribe",
  ];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Gemini] Processing subtitles with model "${model}"...`);
      const response = await ai.models.generateContent({
        model,
        contents,
      });
      console.log(`[Gemini] Subtitle generation completed successfully with model "${model}"`);
      return response;
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || err);
      const isTransient =
        errMsg.includes("503") ||
        errMsg.includes("UNAVAILABLE") ||
        errMsg.includes("high demand") ||
        errMsg.includes("429") ||
        errMsg.includes("RESOURCE_EXHAUSTED") ||
        errMsg.includes("overloaded");

      if (isTransient) {
        console.log(`[Gemini] Model "${model}" is currently at capacity, switching to next candidate model...`);
        // Short breather before querying next candidate model
        await new Promise((resolve) => setTimeout(resolve, 600));
        continue;
      }

      // If it is a non-transient error, break and throw
      break;
    }
  }

  throw lastError;
}

// Primary subtitle extraction & translation endpoint
app.post("/api/generate-subtitles", handleUpload, async (req: any, res: any) => {
  const uploadedFile = req.file;
  const targetLang = (req.body.targetLang || "العربية").trim();

  if (!uploadedFile) {
    return res.status(400).json({ error: "يرجى اختيار ملف فيديو أو صوت." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    if (uploadedFile && fs.existsSync(uploadedFile.path)) {
      fs.unlinkSync(uploadedFile.path);
    }
    return res.status(500).json({
      error: "مفتاح GEMINI_API_KEY غير متوفر. يرجى إضافة مفتاح Gemini API في إعدادات البيئة (Settings > Secrets).",
    });
  }

  const filePath = uploadedFile.path;
  const originalName = uploadedFile.originalname;
  const baseName = path.parse(originalName).name || "subtitles";

  let uploadedGeminiFile: any = null;

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    let mediaContent: any = null;

    // First attempt: Gemini Files API
    try {
      uploadedGeminiFile = await ai.files.upload({
        file: filePath,
        config: {
          mimeType: uploadedFile.mimetype || "video/mp4",
        },
      });

      // If video file is in PROCESSING state, wait for it to become ACTIVE
      let fileStatus = uploadedGeminiFile;
      let waitSeconds = 0;
      while (fileStatus.state === "PROCESSING" && waitSeconds < 60) {
        await new Promise((r) => setTimeout(r, 2000));
        waitSeconds += 2;
        fileStatus = await ai.files.get({ name: uploadedGeminiFile.name });
      }

      mediaContent = {
        fileData: {
          fileUri: uploadedGeminiFile.uri,
          mimeType: fileStatus.mimeType || uploadedGeminiFile.mimeType || uploadedFile.mimetype || "video/mp4",
        },
      };
    } catch (uploadError) {
      console.warn("Files API upload unsuccessful, using base64 inlineData fallback:", uploadError);
      const buffer = fs.readFileSync(filePath);
      mediaContent = {
        inlineData: {
          mimeType: uploadedFile.mimetype || "video/mp4",
          data: buffer.toString("base64"),
        },
      };
    }

    // Exact prompt from original VidTrans IA app.py
    const prompt = `قم بالاستماع إلى هذا الملف الصوتي أو الفيديو، واكتب تفريغاً للنص مع التوقيتات الزمنية، ثم قم بترجمته وترتيبه حصراً إلى اللغة ${targetLang}.
يجب أن يكون الناتج بصيغة ملف ترجمة SRT نظامية تماماً بالشكل التالي بدون أي زيادة أو رموز غريبة:
1
00:00:21,500 --> 00:00:23,500
النص المترجم هنا

احرص على استخدام السهم القياسي حصراً (-->) في جميع التوقيتات.`;

    const response = await generateSubtitlesWithRetry(ai, {
      parts: [
        mediaContent,
        { text: prompt },
      ],
    });

    // Cleanup uploaded Gemini file if it was created
    if (uploadedGeminiFile && uploadedGeminiFile.name) {
      try {
        await ai.files.delete({ name: uploadedGeminiFile.name });
      } catch (cleanupErr) {
        console.warn("Failed to delete Gemini temporary file:", cleanupErr);
      }
    }

    // Cleanup local temp file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    let rawSrt = response.text || "";
    // Clean markdown fences
    rawSrt = rawSrt.trim();
    rawSrt = rawSrt.replace(/^```[a-zA-Z]*\n/, "");
    rawSrt = rawSrt.replace(/\n```$/, "");
    rawSrt = rawSrt.trim();

    return res.json({
      srt: rawSrt,
      baseName,
      targetLang,
    });
  } catch (error: any) {
    console.error("Subtitle generation error:", error);

    // Clean up local temp file
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        // ignore
      }
    }

    // Clean up gemini file if created
    if (uploadedGeminiFile && uploadedGeminiFile.name) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        await ai.files.delete({ name: uploadedGeminiFile.name });
      } catch (e) {
        // ignore
      }
    }

    const userFriendlyError = formatGeminiError(error);
    return res.status(500).json({
      error: userFriendlyError,
    });
  }
});

// Guard: Ensure any unhandled /api routes return JSON 404 rather than Vite index.html
app.all("/api/*", (_req, res) => {
  res.status(404).json({ error: "المسار المطلوب غير موجود (404)" });
});

// API Error handling middleware
app.use("/api", (err: any, _req: any, res: any, _next: any) => {
  console.error("Express API error:", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || "حدث خطأ غير متوقع في الخادم.",
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`VidTrans IA server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
