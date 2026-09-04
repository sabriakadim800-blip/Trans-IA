"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_multer = __toESM(require("multer"), 1);
var import_genai = require("@google/genai");
var import_vite = require("vite");
var app = (0, import_express.default)();
var PORT = 3e3;
var uploadDir = import_path.default.join("/tmp", "vidtrans-uploads");
if (!import_fs.default.existsSync(uploadDir)) {
  import_fs.default.mkdirSync(uploadDir, { recursive: true });
}
var storage = import_multer.default.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeName = Date.now() + "-" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, safeName);
  }
});
var MAX_UPLOAD_SIZE = 30 * 1024 * 1024;
var upload = (0, import_multer.default)({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE
  }
});
app.use(import_express.default.json({ limit: "20mb" }));
var handleUpload = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      console.error("Multer upload error:", err);
      if (err instanceof import_multer.default.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            error: "\u062D\u062C\u0645 \u0627\u0644\u0645\u0644\u0641 \u0643\u0628\u064A\u0631 \u062C\u062F\u0627\u064B (\u0623\u0643\u062B\u0631 \u0645\u0646 30 \u0645\u064A\u063A\u0627\u0628\u0627\u064A\u062A). \u064A\u0631\u062C\u0649 \u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0644\u0641 \u0623\u0635\u063A\u0631 \u0623\u0648 \u0627\u0633\u062A\u062E\u0631\u0627\u062C \u0627\u0644\u0635\u0648\u062A \u0645\u0646\u0647 \u0623\u0648\u0644\u0627\u064B."
          });
        }
        return res.status(400).json({
          error: `\u062E\u0637\u0623 \u0641\u064A \u0631\u0641\u0639 \u0627\u0644\u0645\u0644\u0641: ${err.message}`
        });
      }
      return res.status(400).json({
        error: `\u062A\u0639\u0630\u0631 \u0645\u0639\u0627\u0644\u062C\u0629 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u0631\u0641\u0648\u0639: ${err.message || err}`
      });
    }
    next();
  });
};
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "VidTrans IA" });
});
function formatGeminiError(err) {
  const raw = err?.message || String(err || "");
  let parsedCode = null;
  let parsedMsg = "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed.error) {
      parsedCode = parsed.error.code || parsed.error.status;
      parsedMsg = parsed.error.message || "";
    }
  } catch (_) {
  }
  const is503 = parsedCode === 503 || parsedCode === "UNAVAILABLE" || raw.includes("503") || raw.includes("high demand") || raw.includes("UNAVAILABLE") || raw.includes("overloaded");
  if (is503) {
    return "\u0646\u0645\u0648\u0630\u062C \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u064A\u0648\u0627\u062C\u0647 \u0636\u063A\u0637\u0627\u064B \u0645\u0631\u062A\u0641\u0639\u0627\u064B \u0648\u0645\u0624\u0642\u062A\u0627\u064B \u0641\u064A \u0627\u0644\u0648\u0642\u062A \u0627\u0644\u062D\u0627\u0644\u064A. \u062A\u0645 \u062A\u0643\u0631\u0627\u0631 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0639\u062F\u0629 \u0645\u0631\u0627\u062A\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u0628\u0636\u0639 \u0644\u062D\u0638\u0627\u062A \u062B\u0645 \u0627\u0644\u0646\u0642\u0631 \u0639\u0644\u0649 \u0632\u0631 \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629 \u0645\u062C\u062F\u062F\u0627\u064B.";
  }
  const is429 = parsedCode === 429 || parsedCode === "RESOURCE_EXHAUSTED" || raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED");
  if (is429) {
    return "\u062A\u0645 \u062A\u062C\u0627\u0648\u0632 \u062D\u062F \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0645\u0633\u0645\u0648\u062D \u0628\u0647 \u0645\u0624\u0642\u062A\u0627\u064B (Rate Limit). \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u062F\u0642\u064A\u0642\u0629 \u0648\u0627\u062D\u062F\u0629 \u062B\u0645 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.";
  }
  if (raw.includes("API key not valid") || raw.includes("API_KEY_INVALID")) {
    return "\u0645\u0641\u062A\u0627\u062D Gemini API \u063A\u064A\u0631 \u0635\u0627\u0644\u062D. \u064A\u064F\u0631\u062C\u0649 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0641\u064A \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u062A\u0637\u0628\u064A\u0642 (Settings > Secrets).";
  }
  if (parsedMsg) {
    return `\u062A\u0639\u0630\u0631 \u0627\u0633\u062A\u062E\u0631\u0627\u062C \u0627\u0644\u062A\u0631\u062C\u0645\u0629: ${parsedMsg}`;
  }
  return `\u062D\u062F\u062B \u062E\u0637\u0623 \u0623\u062B\u0646\u0627\u0621 \u0645\u0639\u0627\u0644\u062C\u0629 \u0627\u0644\u062A\u0631\u062C\u0645\u0629: ${raw.slice(0, 300)}`;
}
async function generateSubtitlesWithRetry(ai, contents) {
  const modelsToTry = [
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.5-transcribe"
  ];
  let lastError = null;
  for (const model of modelsToTry) {
    try {
      console.log(`[Gemini] Processing subtitles with model "${model}"...`);
      const response = await ai.models.generateContent({
        model,
        contents
      });
      console.log(`[Gemini] Subtitle generation completed successfully with model "${model}"`);
      return response;
    } catch (err) {
      lastError = err;
      const errMsg = String(err?.message || err);
      const isTransient = errMsg.includes("503") || errMsg.includes("UNAVAILABLE") || errMsg.includes("high demand") || errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("overloaded");
      if (isTransient) {
        console.log(`[Gemini] Model "${model}" is currently at capacity, switching to next candidate model...`);
        await new Promise((resolve) => setTimeout(resolve, 600));
        continue;
      }
      break;
    }
  }
  throw lastError;
}
app.post("/api/generate-subtitles", handleUpload, async (req, res) => {
  const uploadedFile = req.file;
  const targetLang = (req.body.targetLang || "\u0627\u0644\u0639\u0631\u0628\u064A\u0629").trim();
  if (!uploadedFile) {
    return res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0644\u0641 \u0641\u064A\u062F\u064A\u0648 \u0623\u0648 \u0635\u0648\u062A." });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    if (uploadedFile && import_fs.default.existsSync(uploadedFile.path)) {
      import_fs.default.unlinkSync(uploadedFile.path);
    }
    return res.status(500).json({
      error: "\u0645\u0641\u062A\u0627\u062D GEMINI_API_KEY \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631. \u064A\u0631\u062C\u0649 \u0625\u0636\u0627\u0641\u0629 \u0645\u0641\u062A\u0627\u062D Gemini API \u0641\u064A \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0628\u064A\u0626\u0629 (Settings > Secrets)."
    });
  }
  const filePath = uploadedFile.path;
  const originalName = uploadedFile.originalname;
  const baseName = import_path.default.parse(originalName).name || "subtitles";
  let uploadedGeminiFile = null;
  try {
    const ai = new import_genai.GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    let mediaContent = null;
    try {
      uploadedGeminiFile = await ai.files.upload({
        file: filePath,
        config: {
          mimeType: uploadedFile.mimetype || "video/mp4"
        }
      });
      let fileStatus = uploadedGeminiFile;
      let waitSeconds = 0;
      while (fileStatus.state === "PROCESSING" && waitSeconds < 60) {
        await new Promise((r) => setTimeout(r, 2e3));
        waitSeconds += 2;
        fileStatus = await ai.files.get({ name: uploadedGeminiFile.name });
      }
      mediaContent = {
        fileData: {
          fileUri: uploadedGeminiFile.uri,
          mimeType: fileStatus.mimeType || uploadedGeminiFile.mimeType || uploadedFile.mimetype || "video/mp4"
        }
      };
    } catch (uploadError) {
      console.warn("Files API upload unsuccessful, using base64 inlineData fallback:", uploadError);
      const buffer = import_fs.default.readFileSync(filePath);
      mediaContent = {
        inlineData: {
          mimeType: uploadedFile.mimetype || "video/mp4",
          data: buffer.toString("base64")
        }
      };
    }
    const prompt = `\u0642\u0645 \u0628\u0627\u0644\u0627\u0633\u062A\u0645\u0627\u0639 \u0625\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0635\u0648\u062A\u064A \u0623\u0648 \u0627\u0644\u0641\u064A\u062F\u064A\u0648\u060C \u0648\u0627\u0643\u062A\u0628 \u062A\u0641\u0631\u064A\u063A\u0627\u064B \u0644\u0644\u0646\u0635 \u0645\u0639 \u0627\u0644\u062A\u0648\u0642\u064A\u062A\u0627\u062A \u0627\u0644\u0632\u0645\u0646\u064A\u0629\u060C \u062B\u0645 \u0642\u0645 \u0628\u062A\u0631\u062C\u0645\u062A\u0647 \u0648\u062A\u0631\u062A\u064A\u0628\u0647 \u062D\u0635\u0631\u0627\u064B \u0625\u0644\u0649 \u0627\u0644\u0644\u063A\u0629 ${targetLang}.
\u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0627\u0644\u0646\u0627\u062A\u062C \u0628\u0635\u064A\u063A\u0629 \u0645\u0644\u0641 \u062A\u0631\u062C\u0645\u0629 SRT \u0646\u0638\u0627\u0645\u064A\u0629 \u062A\u0645\u0627\u0645\u0627\u064B \u0628\u0627\u0644\u0634\u0643\u0644 \u0627\u0644\u062A\u0627\u0644\u064A \u0628\u062F\u0648\u0646 \u0623\u064A \u0632\u064A\u0627\u062F\u0629 \u0623\u0648 \u0631\u0645\u0648\u0632 \u063A\u0631\u064A\u0628\u0629:
1
00:00:21,500 --> 00:00:23,500
\u0627\u0644\u0646\u0635 \u0627\u0644\u0645\u062A\u0631\u062C\u0645 \u0647\u0646\u0627

\u0627\u062D\u0631\u0635 \u0639\u0644\u0649 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0633\u0647\u0645 \u0627\u0644\u0642\u064A\u0627\u0633\u064A \u062D\u0635\u0631\u0627\u064B (-->) \u0641\u064A \u062C\u0645\u064A\u0639 \u0627\u0644\u062A\u0648\u0642\u064A\u062A\u0627\u062A.`;
    const response = await generateSubtitlesWithRetry(ai, {
      parts: [
        mediaContent,
        { text: prompt }
      ]
    });
    if (uploadedGeminiFile && uploadedGeminiFile.name) {
      try {
        await ai.files.delete({ name: uploadedGeminiFile.name });
      } catch (cleanupErr) {
        console.warn("Failed to delete Gemini temporary file:", cleanupErr);
      }
    }
    if (import_fs.default.existsSync(filePath)) {
      import_fs.default.unlinkSync(filePath);
    }
    let rawSrt = response.text || "";
    rawSrt = rawSrt.trim();
    rawSrt = rawSrt.replace(/^```[a-zA-Z]*\n/, "");
    rawSrt = rawSrt.replace(/\n```$/, "");
    rawSrt = rawSrt.trim();
    return res.json({
      srt: rawSrt,
      baseName,
      targetLang
    });
  } catch (error) {
    console.error("Subtitle generation error:", error);
    if (import_fs.default.existsSync(filePath)) {
      try {
        import_fs.default.unlinkSync(filePath);
      } catch (e) {
      }
    }
    if (uploadedGeminiFile && uploadedGeminiFile.name) {
      try {
        const ai = new import_genai.GoogleGenAI({ apiKey });
        await ai.files.delete({ name: uploadedGeminiFile.name });
      } catch (e) {
      }
    }
    const userFriendlyError = formatGeminiError(error);
    return res.status(500).json({
      error: userFriendlyError
    });
  }
});
app.all("/api/*", (_req, res) => {
  res.status(404).json({ error: "\u0627\u0644\u0645\u0633\u0627\u0631 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F (404)" });
});
app.use("/api", (err, _req, res, _next) => {
  console.error("Express API error:", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || "\u062D\u062F\u062B \u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645."
  });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`VidTrans IA server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
