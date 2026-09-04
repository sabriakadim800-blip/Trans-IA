import React, { useState, useRef } from "react";
import {
  Film,
  Upload,
  FileAudio,
  FileVideo,
  Play,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  FileText,
  Clock,
  Sparkles,
  X,
  Copy,
  Check,
  ExternalLink,
  Settings,
  Share2
} from "lucide-react";
import { SettingsModal } from "./components/SettingsModal";
import { getStoredApiKey, generateSubtitlesDirect } from "./services/geminiDirect";
import { saveAndShareSrt, shareSrtDirect } from "./services/fileSaver";

interface SubtitleCue {
  id: number;
  timeRange: string;
  text: string;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [targetLang, setTargetLang] = useState<string>("العربية");
  const [customLang, setCustomLang] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [srtText, setSrtText] = useState<string | null>(null);
  const [baseFileName, setBaseFileName] = useState<string>("subtitles");
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [copied, setCopied] = useState<boolean>(false);
  const [isCookieBlocked, setIsCookieBlocked] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    getStoredApiKey().then((key) => {
      setHasApiKey(Boolean(key && key.trim()));
    });
  }, []);

  const MAX_PROXY_FILE_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB
  const MAX_DIRECT_FILE_SIZE_BYTES = 250 * 1024 * 1024; // 250 MB for direct phone-to-Gemini upload

  const validateAndSetFile = (selected: File) => {
    const limit = hasApiKey ? MAX_DIRECT_FILE_SIZE_BYTES : MAX_PROXY_FILE_SIZE_BYTES;
    if (selected.size > limit) {
      const sizeMB = (selected.size / (1024 * 1024)).toFixed(1);
      const limitMB = (limit / (1024 * 1024)).toFixed(0);
      setErrorMessage(
        `حجم الملف المختار (${sizeMB} ميغابايت) يتجاوز الحد المسموح به (${limitMB} ميغابايت). ${
          !hasApiKey ? "ملاحظة: يمكنك إدخال مفتاحك الخاص في الإعدادات (⚙️) لرفع ملفات حتى 250 ميغابايت." : ""
        }`
      );
      setFile(null);
      return false;
    }
    setFile(selected);
    const nameParts = selected.name.split(".");
    if (nameParts.length > 1) {
      nameParts.pop();
    }
    setBaseFileName(nameParts.join("."));
    setErrorMessage(null);
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const effectiveLang = targetLang === "أخرى" ? (customLang.trim() || "العربية") : targetLang;

  const handleGenerate = async () => {
    if (!file) {
      setErrorMessage("يرجى اختيار ملف فيديو أو صوت أولاً.");
      return;
    }

    const storedApiKey = await getStoredApiKey();

    // Mode 1: Direct Standalone Execution (from device straight to Gemini API)
    if (storedApiKey && storedApiKey.trim()) {
      setIsProcessing(true);
      setErrorMessage(null);
      setIsCookieBlocked(false);
      setStatusMessage("جاري إعداد الملف للاتصال المباشر بـ Gemini...");

      try {
        const directSrt = await generateSubtitlesDirect(
          file,
          effectiveLang,
          storedApiKey.trim(),
          (msg) => setStatusMessage(msg)
        );
        setSrtText(directSrt);
      } catch (err: any) {
        console.error("Direct Gemini Error:", err);
        let msg = err?.message || "فشلت المعالجة المباشرة عبر Gemini.";
        if (msg.includes("API key not valid") || msg.includes("400") || msg.includes("403")) {
          msg = "مفتاح Gemini API غير صالح أو غير مفعل. يرجى الضغط على زر الإعدادات (⚙️) في الأعلى للتأكد منه.";
        } else if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
          msg = "تعذر الاتصال بخوادم Google. يرجى التأكد من اتصال هاتفك بالإنترنت والمحاولة مجدداً.";
        }
        setErrorMessage(msg);
      } finally {
        setIsProcessing(false);
        setStatusMessage("");
      }
      return;
    }

    // Mode 2: Web Proxy fallback (when testing in web preview without a custom API key)
    if (file.size > MAX_PROXY_FILE_SIZE_BYTES) {
      setErrorMessage(
        "حجم الملف يتجاوز 30 ميغابايت للخادم الوسيط. أدخل مفتاحك الخاص في الإعدادات (⚙️) لتفعيل الرفع المباشر حتى 250 ميغابايت."
      );
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setIsCookieBlocked(false);
    setStatusMessage("جاري رفع الملف ومعالجته عبر الذكاء الاصطناعي (قد يستغرق ذلك دقيقة أو دقيقتين)...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("targetLang", effectiveLang);

      const response = await fetch("/api/generate-subtitles", {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
        body: formData,
      });

      const contentType = response.headers.get("content-type") || "";
      let data: any = {};

      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const rawText = await response.text();
        if (
          rawText.includes("security cookie") ||
          rawText.includes("Cookie check") ||
          rawText.includes("Authenticate in new window") ||
          rawText.includes("AUTH_FLOW_TEST_COOKIE_NAME") ||
          rawText.includes("__SECURE-aistudio") ||
          rawText.includes("Action required to load your app")
        ) {
          setIsCookieBlocked(true);
          throw new Error(
            "المتصفح يقيد ملفات تعريف الارتباط الأمنية داخل إطار المعاينة. يمكنك أيضاً النقر على زر الإعدادات (⚙️) في الأعلى ووضع مفتاح API الخاص بك للعمل المباشر دون قيود المتصفح."
          );
        }
        if (response.status === 413) {
          throw new Error("حجم الملف كبير جداً (أكثر من 30 ميغابايت). يرجى وضع مفتاحك الخاص في الإعدادات لرفع أحجام أكبر.");
        }
        if (response.status === 502 || response.status === 503 || response.status === 504) {
          throw new Error("الخادم قيد الإقلاع أو استغرق الطلب وقتاً أطول من المعتاد. يرجى إعادة المحاولة.");
        }
        throw new Error(`فشلت الاستجابة من الخادم (رمز الحالة: ${response.status})`);
      }

      if (!response.ok) {
        throw new Error(data.error || "فشل توليد الترجمة.");
      }

      setSrtText(data.srt);
      if (data.baseName) {
        setBaseFileName(data.baseName);
      }
    } catch (err: any) {
      console.error("Subtitle generation error:", err);
      let message = err?.message || "حدث خطأ أثناء المعالجة.";
      if (message.includes("503") || message.includes("UNAVAILABLE") || message.includes("high demand")) {
        message = "النموذج يواجه ضغطاً مرتفعاً مؤقتاً في الوقت الحالي. يرجى الانتظار بضع لحظات ثم النقر على زر المعالجة مجدداً.";
      }
      setErrorMessage(message);
    } finally {
      setIsProcessing(false);
      setStatusMessage("");
    }
  };

  const handleDownload = async () => {
    if (!srtText) return;
    const fileName = `${baseFileName}_${effectiveLang}.srt`;
    const result = await saveAndShareSrt(srtText, fileName);
    if (result.success) {
      setSaveNotice(
        result.savedPath?.startsWith("Documents")
          ? `تم حفظ ملف الترجمة في جهازك: ${result.savedPath}`
          : "تم تنزيل ملف الترجمة بنجاح!"
      );
      setTimeout(() => setSaveNotice(null), 4000);
    } else if (result.error) {
      setErrorMessage(`تعذر حفظ الملف: ${result.error}`);
    }
  };

  const handleShare = async () => {
    if (!srtText) return;
    const fileName = `${baseFileName}_${effectiveLang}.srt`;
    const shared = await shareSrtDirect(srtText, fileName);
    if (!shared) {
      // If native sharing is not available, trigger download
      await handleDownload();
    }
  };

  const handleCopy = async () => {
    if (!srtText) return;
    await navigator.clipboard.writeText(srtText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const parseSrtCues = (raw: string): SubtitleCue[] => {
    const blocks = raw.replace(/\r\n/g, "\n").split(/\n\s*\n/);
    const cues: SubtitleCue[] = [];

    for (const block of blocks) {
      const lines = block.trim().split("\n");
      if (lines.length >= 2) {
        const idMatch = lines[0].match(/^\d+$/);
        const timeIndex = idMatch ? 1 : 0;
        const timeRange = lines[timeIndex] || "";

        if (timeRange.includes("-->")) {
          const id = idMatch ? parseInt(lines[0], 10) : cues.length + 1;
          const text = lines.slice(timeIndex + 1).join("\n");
          cues.push({ id, timeRange, text });
        }
      }
    }
    return cues;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} ك.ب`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
  };

  const parsedCues = srtText ? parseSrtCues(srtText) : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-10 px-4 sm:px-6 lg:px-8 text-slate-800">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header matching original Streamlit app */}
        <header className="text-center space-y-3">
          <div className="flex items-center justify-between">
            <div className="w-24 hidden sm:block"></div>
            <div className="inline-flex items-center justify-center gap-3 bg-white px-5 py-2 rounded-2xl shadow-sm border border-slate-200 mx-auto">
              <span className="text-3xl">🎬</span>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">VidTrans IA</h1>
            </div>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-indigo-600 hover:border-indigo-300 shadow-sm transition-all flex items-center gap-1.5 text-xs font-semibold"
              title="إعدادات مفتاح Gemini API للاتصال المباشر"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">{hasApiKey ? "مفتاح API مفعل" : "إعداد المفتاح"}</span>
              <span
                className={`w-2 h-2 rounded-full ${hasApiKey ? "bg-emerald-500 ring-2 ring-emerald-200" : "bg-amber-400"}`}
              ></span>
            </button>
          </div>
          <h2 className="text-lg text-slate-600 font-medium pt-1">
            توليد، مراجعة، وتعديل ملفات الترجمة (SRT) بالذكاء الاصطناعي
          </h2>
          {hasApiKey && (
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>وضع الاتصال المباشر فائق السرعة من الهاتف إلى Gemini مفعل</span>
            </div>
          )}
        </header>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6">
          {/* File Upload Section */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-700">
              اختر ملف فيديو أو صوت (mp4, mp3, wav, mov)
            </label>

            {!file ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/40 rounded-xl p-8 text-center cursor-pointer transition-colors group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp4,.mov,.mp3,.wav,video/mp4,video/quicktime,audio/mpeg,audio/wav"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center text-slate-500 group-hover:text-indigo-600 transition-colors">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      اسحب وأفلت الملف هنا، أو انقر للاختيار
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      يدعم ملفات: MP4, MOV, MP3, WAV (الحد الأقصى: 30 ميغابايت)
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    {file.type.startsWith("audio") ? (
                      <FileAudio className="w-5 h-5" />
                    ) : (
                      <FileVideo className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 truncate max-w-xs sm:max-w-md">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setSrtText(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  title="إزالة الملف"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {/* Target Language Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-700">
              اختر لغة الترجمة المطلوبة
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {["العربية", "الإنجليزية", "التركية", "أخرى"].map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setTargetLang(lang)}
                  className={`py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all ${
                    targetLang === lang
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>

            {targetLang === "أخرى" && (
              <div className="pt-2">
                <input
                  type="text"
                  placeholder="اكتب اسم اللغة (مثال: الفرنسية، الإسبانية، الألمانية)..."
                  value={customLang}
                  onChange={(e) => setCustomLang(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="flex flex-col gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{errorMessage}</div>
              </div>
              {isCookieBlocked && (
                <div className="pt-2 border-t border-red-200/60 flex items-center justify-end">
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
                  >
                    <span>فتح التطبيق في نافذة مستقلة للمتابعة</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Action Button */}
          <div>
            <button
              type="button"
              disabled={!file || isProcessing}
              onClick={handleGenerate}
              className={`w-full py-3.5 px-6 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-sm ${
                !file || isProcessing
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 active:scale-[0.99]"
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>جاري استخراج وتوليد الترجمة...</span>
                </>
              ) : (
                <>
                  <span>🚀 ابدأ استخراج وتوليد الترجمة</span>
                </>
              )}
            </button>
          </div>

          {/* Status / Processing Indicator */}
          {isProcessing && (
            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-3 text-indigo-900 text-sm animate-pulse">
              <Loader2 className="w-5 h-5 text-indigo-600 animate-spin shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Subtitle Editor Section (appears once SRT is generated) */}
        {srtText !== null && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl text-sm font-medium">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>تم توليد الترجمة بنجاح! يمكنك مراجعتها وتعديلها بالأسفل.</span>
            </div>

            <div className="border-t border-slate-200 pt-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <span>📝</span>
                    <span>محرر الترجمة البسيط</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    يمكنك تعديل أي جملة أو توقيت هنا مباشرة قبل تحميل الملف النهائي:
                  </p>
                </div>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActiveTab("editor")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === "editor"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    محرر SRT الخام
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("preview")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === "preview"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    معاينة الفقرات ({parsedCues.length})
                  </button>
                </div>
              </div>

              {activeTab === "editor" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">نص الترجمة (قابل للتعديل):</span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1 py-1 px-2 rounded hover:bg-slate-100 transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? "تم النسخ" : "نسخ النص"}</span>
                    </button>
                  </div>
                  <textarea
                    rows={14}
                    value={srtText}
                    onChange={(e) => setSrtText(e.target.value)}
                    dir="ltr"
                    className="w-full p-4 font-mono text-sm bg-slate-900 text-slate-100 rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed tracking-wide resize-y"
                    placeholder="1&#10;00:00:00,000 --> 00:00:02,000&#10;النص المترجم..."
                  />
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {parsedCues.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-6">
                      لا توجد فقرات ترجمة معروفة في النص الحالي.
                    </p>
                  ) : (
                    parsedCues.map((cue) => (
                      <div
                        key={cue.id}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs text-slate-500" dir="ltr">
                          <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                            #{cue.id}
                          </span>
                          <span className="font-mono flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {cue.timeRange}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-800 whitespace-pre-wrap">
                          {cue.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Save / Download Notification */}
              {saveNotice && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{saveNotice}</span>
                </div>
              )}

              {/* Download and Secondary Actions */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="w-full sm:flex-1 py-3.5 px-6 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Download className="w-5 h-5" />
                  <span>📥 حفظ ملف الترجمة (.srt)</span>
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  className="w-full sm:w-auto py-3.5 px-5 rounded-xl font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 active:scale-[0.99] flex items-center justify-center gap-2 transition-all text-sm"
                  title="مشاركة الملف عبر تطبيقات الهاتف"
                >
                  <Share2 className="w-4 h-4 text-indigo-600" />
                  <span>مشاركة</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setSrtText(null);
                    setSaveNotice(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="w-full sm:w-auto py-3.5 px-5 rounded-xl font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 flex items-center justify-center gap-2 transition-colors text-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>ملف جديد</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onKeySaved={(has) => setHasApiKey(has)}
      />
    </div>
  );
}
