import streamlit as st
import os
from tempfile import NamedTemporaryFile
from google import genai

# إعداد مفتاح Gemini API
if "GEMINI_API_KEY" in st.secrets:
    api_key = st.secrets["GEMINI_API_KEY"]
else:
    api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    st.error("الرجاء إضافة مفتاح GEMINI_API_KEY في إعدادات Secrets لموقع Streamlit.")
    st.stop()

client = genai.Client(api_key=api_key)

st.title("🎬 أداة ترجمة وتحليل الفيديوهات بالذكاء الاصطناعي")
st.write("قم برفع ملف الفيديو أو الصوت، وسقوم بترجمته ومعالجته مجاناً عبر Gemini.")

uploaded_file = st.file_uploader("اختر ملف فيديو أو صوت", type=["mp3", "mp4", "wav", "m4a", "mov"])

target_lang = st.selectbox(
    "اختر اللغة المستهدفة للترجمة:",
    ["العربية (Arabic)", "الإنجليزية (English)", "التركية (Turkish)"]
)

if uploaded_file is not None:
    st.video(uploaded_file)
    
    if st.button("بدء المعالجة والترجمة"):
        with st.spinner("جاري رفع الملف ومعالجته بواسطة Gemini..."):
            with NamedTemporaryFile(delete=False, suffix='.' + uploaded_file.name.split('.')[-1]) as tmp:
                tmp.write(uploaded_file.getvalue())
                tmp_path = tmp.name

        try:
            with st.spinner("جاري رفع الملف إلى خوادم الذكاء الاصطناعي وتحليله..."):
                # رفع الملف باستخدام واجهة الملفات الخاصة بـ Gemini
                uploaded_file_gemini = client.files.upload(file=tmp_path)
                
            try:
            with st.spinner("جاري استخراج الترجمة وتوليد الملف..."):
                prompt = f"قم بالاستماع إلى هذا الملف الصوتي/الفيديو، واكتب تفريغاً للنص مع توقيتات زمنية تقريبية، ثم قم بترجمته إلى اللغة {target_lang}. أعطني النتيجة بصيغة ملف ترجمة SRT دقيقة ومرتبة."
                
                response = client.models.generate_content(
                    model='gemini-3.6-flash',
                    contents=[uploaded_file_gemini, prompt]
                )

            os.unlink(tmp_path)
            
            # حذف الملف من خوادم جيميناي بعد الانتهاء
            client.files.delete(name=uploaded_file_gemini.name)

            st.success("تمت المعالجة بنجاح!")
            
            srt_content = response.text

            # تنظيف الرموز الزائدة لضمان توافق ملف الـ SRT
            import re
            srt_content = re.sub(r'^```[a-zA-Z]*\n', '', srt_content.strip())
            srt_content = re.sub(r'\n```$', '', srt_content.strip())

            st.subheader("نتيجة الترجمة والملف (SRT):")
            st.text_area("الكود الناتج", srt_content, height=300)

            st.download_button(
                label="تحميل ملف الترجمة (SRT)",
                data=srt_content,
                file_name="subtitles.srt",
                mime="text/plain"
            )

        except Exception as e:
            st.error(f"حدث خطأ أثناء المعالجة: {e}")
