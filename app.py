import streamlit as st
import openai
import os
from tempfile import NamedTemporaryFile

# إعداد مفتاح API
if "OPENAI_API_KEY" in st.secrets:
    api_key = st.secrets["OPENAI_API_KEY"]
else:
    api_key = os.getenv("OPENAI_API_KEY")

if not api_key:
    st.error("الرجاء إضافة مفتاح OpenAI API في إعدادات Secrets لموقع Streamlit.")
    st.stop()

client = openai.OpenAI(api_key=api_key)

st.title("🎬 أداة ترجمة ودبلجة الفيديوهات")
st.write("قم بتنزيل ملف فيديو أو صوت، وسقوم بتفريغه وترجمته باحترافية.")

uploaded_file = st.file_uploader("اختر ملف فيديو أو صوت", type=["mp3", "mp4", "wav", "m4a", "mov"])

target_lang = st.selectbox(
    "اختر اللغة المستهدفة للترجمة:",
    ["العربية (Arabic)", "الإنجليزية (English)", "التركية (Turkish)", "Original"]
)

if uploaded_file is not None:
    st.video(uploaded_file)
    
    if st.button("بدء التفريغ والترجمة"):
        with st.spinner("جاري رفع الملف ومعالجته..."):
            with NamedTemporaryFile(delete=False, suffix='.' + uploaded_file.name.split('.')[-1]) as tmp:
                tmp.write(uploaded_file.getvalue())
                tmp_path = tmp.name

        try:
            with st.spinner("جاري تفريغ الصوت وتحويله إلى نص..."):
                with open(tmp_path, "rb") as audio_file:
                    transcript = client.audio.transcriptions.create(
                        model="whisper-1",
                        file=audio_file,
                        response_format="verbose_json"
                    )

            os.unlink(tmp_path)
            st.success("تم تفريغ الصوت بنجاح! جاري ترجمة النصوص...")

            segments = getattr(transcript, 'segments', [])
            srt_content = ""
            translated_segments = []

            for i, seg in enumerate(segments):
                start = seg.get('start', 0)
                end = seg.get('end', 0)
                text = seg.get('text', '').strip()

                if target_lang != "Original":
                    response = client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[
                            {"role": "system", "content": f"You are a professional translator for video subtitles. Translate the following text to {target_lang}. Return only the translated text without extra notes."},
                            {"role": "user", "content": text}
                        ]
                    )
                    translated_text = response.choices[0].message.content.strip()
                else:
                    translated_text = text

                translated_segments.append((start, end, translated_text))

            def format_time(seconds):
                hours = int(seconds // 3600)
                minutes = int((seconds % 3600) // 60)
                secs = int(seconds % 60)
                milliseconds = int((seconds - int(seconds)) * 1000)
                return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"

            for i, (start, end, text) in enumerate(translated_segments, start=1):
                start_str = format_time(start)
                end_str = format_time(end)
                srt_content += f"{i}\n{start_str} --> {end_str}\n{text}\n\n"

            st.subheader("النص المترجم (SRT):")
            st.text_area("نتيجة الترجمة", srt_content, height=300)

            st.download_button(
                label="تحميل ملف الترجمة (SRT)",
                data=srt_content,
                file_name="subtitles.srt",
                mime="text/plain"
            )

        except Exception as e:
            st.error(f"حدث خطأ أثناء المعالجة: {e}")
