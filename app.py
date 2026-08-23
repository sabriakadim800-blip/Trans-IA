import os
import tempfile
import streamlit as st
from openai import OpenAI

# إعداد الصفحة
st.set_page_config(page_title="Video Translator & Subtitle Generator", page_icon="🎬", layout="centered")

st.title("🎬 Video Translator & Subtitle Generator")
st.write("رفع الفيديو لاستخراج الصوت، تفريغه بـ OpenAI Whisper، وترجمته بدقة مع تصدير ملف SRT.")

# إدخال مفتاح OpenAI API (أو سحبه تلقائياً من إعدادات المنصة Secrets)
api_key = os.environ.get("OPENAI_API_KEY", "")
if not api_key:
    api_key = st.sidebar.text_input("أدخل مفتاح OpenAI API (sk-...)", type="password")

if api_key:
    client = OpenAI(api_key=api_key)
    
    # اختيار لغة الترجمة
    target_lang = st.selectbox(
        "اختر لغة الترجمة المستهدفة:",
        ["Arabic", "English", "Hindi", "French"]
    )
    
    # رفع الفيديو
    uploaded_file = st.file_uploader("اختر ملف فيديو (MP4, MKV, MOV):", type=["mp4", "mkv", "mov", "avi"])
    
    if uploaded_file is not None:
        st.video(uploaded_file)
        
        if st.button("بدء المعالجة والتفريغ 🚀"):
            with st.spinner("جاري معالجة الفيديو واستخراج النص وترجمته... يرجى الانتظار"):
                try:
                    # حفظ الفيديو المؤقت
                    tfile = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
                    tfile.write(uploaded_file.read())
                    video_path = tfile.name
                    
                    # استخراج الصوت أو إرساله مباشرة لـ Whisper
                    with open(video_path, "rb") as audio_file:
                        # استخدام Whisper لتفريغ الصوت مع التوقيتات (verbose_json للحصول على الأجزاء)
                        transcript = client.audio.transcriptions.create(
                            model="whisper-1",
                            file=audio_file,
                            response_format="verbose_json"
                        )
                    
                    st.success("تم تفريغ الصوت بنجاح! جاري ترجمة النصوص...")
                    
                    # عرض النص الأصلي أو ترجمته
                    segments = getattr(transcript, 'segments', [])
                    
                    srt_content = ""
                    translated_segments = []
                    
                    for i, seg in enumerate(segments):
                        start = seg.get('start', 0)
                        end = seg.get('end', 0)
                        text = seg.get('text', '').strip()
                        
                        # ترجمة النص باستخدام نموذج Chat باحترافية للغة المطلوبة
                        if target_lang != "Original":
                            response = client.chat.completions.create(
                                model="gpt-4o-mini",
                                messages=[
                                    {"role": "system", "content": f"You are a professional translator for video subtitles. Translate the following text accurately into {target_lang}. Return only the translated text without extra notes."},
                                    {"role": "user", "content": text}
                                ]
                            }
                            translated_text = response.choices[0].message.content.strip()
                        else:
                            translated_text = text
                            
                        translated_segments.append((start, end, translated_text))
                        
                        # تنسيق وقت SRT (ساعات:دقائق:ثواني,مللي ثانية)
                        def format_time(seconds):
                            hours = int(seconds // 3600)
                            minutes = int((seconds % 3600) // 60)
                            secs = int(seconds % 60)
                            milliseconds = int(int((seconds - int(seconds)) * 1000))
                            return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"
                        
                        start_str = format_time(start)
                        end_str = format_time(end)
                        
                        srt_content += f"{i+1}\n{start_str} --> {end_str}\n{translated_text}\n\n"
                    
                    # عرض النتائج ونصوص الترجمة
                    st.subheader("📝 النصوص المترجمة:")
                    for _, _, t_text in translated_segments:
                        st.write(f"- {t_text}")
                        
                    # زر تحميل ملف الـ SRT بترميز UTF-8 الصحيح تماماً
                    st.download_button(
                        label="📥 تحميل ملف الترجمة (.SRT)",
                        data=srt_content.encode('utf-8'),
                        file_name="translated_subtitle.srt",
                        mime="text/plain"
                    )
                    
                    # تنظيف الملف المؤقت
                    os.unlink(video_path)
                    
                except Exception as e:
                    st.error(f"حدث خطأ أثناء المعالجة: {str(e)}")
else:
    st.warning("الرجاء إدخال مفتاح OpenAI API في الشريط الجانبي للبدء.")
                  
