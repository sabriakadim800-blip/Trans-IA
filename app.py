import streamlit as st
import os
import re
from google import genai

# إعداد الصفحة وتطبيق VidTrans IA
st.set_page_config(page_title="VidTrans IA", layout="centered")

st.title("VidTrans IA - مولد ومترجم الترجمة الذكي")

# مفتاح API أو إعدادات العميل (تأكد من مطابقتها لمتغيرات تطبيقك)
client = genai.Client()

uploaded_file = st.file_uploader("اختر ملف فيديو أو صوت", type=["mp4", "mov", "mp3", "wav"])
target_lang = st.selectbox("اختر لغة الترجمة", ["العربية", "الإنجليزية", "التركية"])

if uploaded_file is not None:
    if st.button("بدء الترجمة والمعالجة"):
        try:
            # حفظ الملف مؤقتاً
            with open(uploaded_file.name, "wb") as f:
                f.write(uploaded_file.getbuffer())
            tmp_path = uploaded_file.name

            with st.spinner("جاري رفع الملف ومعالجته عبر الذكاء الاصطناعي..."):
                uploaded_file_gemini = client.files.upload(file=tmp_path)
                
                prompt = f"قم بالاستماع إلى هذا الملف الصوتي/الفيديو، واكتب تفريغاً للنص مع توقيتات زمنية تقريبية، ثم قم بترجمته إلى اللغة {target_lang}. أعطني النتيجة بصيغة ملف ترجمة SRT دقيقة ومرتبة."
                
                response = client.models.generate_content(
                    model='gemini-3.6-flash',
                    contents=[uploaded_file_gemini, prompt]
                )

            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            
            if hasattr(uploaded_file_gemini, 'name'):
                client.files.delete(name=uploaded_file_gemini.name)

            st.success("تمت المعالجة بنجاح!")
            
            srt_content = response.text

            # تنظيف الرموز الزائدة لضمان توافق ملف الـ SRT مع مشغلات الموبايل
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
