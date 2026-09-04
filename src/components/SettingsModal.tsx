import React, { useState, useEffect } from "react";
import {
  X,
  Key,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Trash2,
  Eye,
  EyeOff,
  ShieldCheck
} from "lucide-react";
import {
  getStoredApiKey,
  setStoredApiKey,
  removeStoredApiKey,
  testGeminiConnection
} from "../services/geminiDirect";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeySaved: (hasKey: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onKeySaved,
}) => {
  const [apiKey, setApiKey] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      getStoredApiKey().then((stored) => {
        setApiKey(stored || "");
        setTestResult(null);
        setSaveSuccess(false);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setTestResult({ ok: false, message: "يرجى كتابة مفتاح API قبل الاختبار." });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testGeminiConnection(apiKey);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.message || "فشل اختبار الاتصال." });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    const trimmed = apiKey.trim();
    await setStoredApiKey(trimmed);
    setSaveSuccess(true);
    onKeySaved(trimmed.length > 0);
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  const handleClear = async () => {
    await removeStoredApiKey();
    setApiKey("");
    setTestResult(null);
    setSaveSuccess(false);
    onKeySaved(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">إعدادات مفتاح Gemini API</h3>
              <p className="text-xs text-slate-500">للاتصال المباشر من الهاتف بدون أي سيرفر وسيط</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200/70 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 text-xs text-indigo-900 flex items-start gap-2.5 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <strong>تخزين آمن ومحلي:</strong> يُحفظ المفتاح داخل ذاكرة هاتفك فقط ولا يُرسل إلى أي طرف ثالث. يتم استخدامه حصرياً للاتصال مباشرة بخوادم Google Gemini الرسمية.
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              مفتاح Google Gemini API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                  setSaveSuccess(false);
                }}
                placeholder="AIzaSy..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-left dir-ltr"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center justify-between pt-1 text-xs">
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center gap-1"
              >
                <span>الحصول على مفتاح مجاني من Google AI Studio</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              {apiKey && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-red-500 hover:text-red-700 inline-flex items-center gap-1 font-medium"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>حذف المفتاح</span>
                </button>
              )}
            </div>
          </div>

          {/* Test connection results */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                testResult.ok
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 leading-relaxed">{testResult.message}</div>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>تم حفظ المفتاح بنجاح!</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={isTesting || !apiKey.trim()}
            onClick={handleTestConnection}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {isTesting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>جاري الاختبار...</span>
              </>
            ) : (
              <span>اختبار الاتصال</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm"
          >
            حفظ وإغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
