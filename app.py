import streamlit as st
import os
import re
from google import genai

# إعداد واجهة التطبيق
st.set_page_config(page_title="VidTrans IA - مولد الترجمة الذكي", layout="centered")

st.title("🎬 VidTrans IA")
st.subheader("توليد، مراجعة، وتعديل ملفات الترجمة (SRT) بالذكاء الاصطناعي")

# إعداد العميل (يأخذ المفتاح من البيئة أو الإعدادات)
client = genai.Client()

# خيارات المستخدم
uploaded_file = st.file_uploader("اختر ملف فيديو أو صوت (mp4, mp3, wav, mov)", type=["mp4", "mov", "mp3", "wav"])
target_lang = st.selectbox("اختر لغة الترجمة المطلوبة", ["العربية", "الإنجليزية", "التركية"])

# زر بدء المعالجة
if uploaded_file is not None:
    # حفظ اسم الملف الأصلي لاستخدامه في تسمية ملف الـ SRT لاحقاً
    base_name = os.path.splitext(uploaded_file.name)[0]
    
    if st.button("🚀 ابدأ استخراج وتوليد الترجمة"):
        try:
            # حفظ الملف مؤقتاً على السيرفر
            tmp_path = uploaded_file.name
            with open(tmp_path, "wb") as f:
                f.write(uploaded_file.getbuffer())

            with st.spinner("جاري رفع الملف ومعالجته عبر الذكاء الاصطناعي (قد يستغرق ذلك دقيقة)..."):
                # رفع الملف لخوادم Gemini
                uploaded_file_gemini = client.files.upload(file=tmp_path)
                
                # توجيه الذكاء الاصطناعي بالصيغة الصحيحة تماماً للـ SRT
                prompt = f"""قم بالاستماع إلى هذا الملف الصوتي أو الفيديو، واكتب تفريغاً للنص مع التوقيتات الزمنية، ثم قم بترجمته وترتيبه حصراً إلى اللغة {target_lang}.
يجب أن يكون الناتج بصيغة ملف ترجمة SRT نظامية تماماً بالشكل التالي بدون أي زيادة أو رموز غريبة:
1
00:00:21,500 --> 00:00:23,500
النص المترجم هنا

احرص على استخدام السهم القياسي حصراً (-->) في جميع التوقيتات."""

                response = client.models.generate_content(
                    model='gemini-3.6-flash',
                    contents=[uploaded_file_gemini, prompt]
                )

            # تنظيف الملفات المؤقتة من السيرفر
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            
            if hasattr(uploaded_file_gemini, 'name'):
                client.files.delete(name=uploaded_file_gemini.name)

            # تنظيف الرموز الزائدة من نص الرد
            raw_srt = response.text
            raw_srt = re.sub(r'^```[a-zA-Z]*\n', '', raw_srt.strip())
            raw_srt = re.sub(r'\n```$', '', raw_srt.strip())

            # تخزين النص في الـ Session State ليبقى محفوظاً أثناء التعديل
            st.session_state['editable_srt'] = raw_srt
            st.success("تم توليد الترجمة بنجاح! يمكنك مراجعتها وتعديلها بالأسفل.")

        except Exception as e:
            st.error(f"حدث خطأ أثناء المعالجة: {e}")

# مرحلة المحرر البسيط (تظهر إذا تم توليد الترجمة المخزنة)
if 'editable_srt' in st.session_state:
    st.markdown("---")
    st.markdown("### 📝 محرر الترجمة البسيط")
    st.info("يمكنك تعديل أي جملة أو توقيت هنا مباشرة قبل تحميل الملف النهائي:")

    # صندوق النص للتعديل الحر
    edited_srt = st.text_area(
        "نص الترجمة (قابل للتعديل)",
        value=st.session_state['editable_srt'],
        height=350
    )

    # تحديث القيمة في الـ session إذا عدل عليها المستخدم
    st.session_state['editable_srt'] = edited_srt

    # زر تحميل ملف الـ SRT النهائي بالتعديلات الجديدة
    st.download_button(
        label="📥 تحميل ملف الترجمة الصافي (.srt)",
        data=st.session_state['editable_srt'],
        file_name=f"{base_name}_{target_lang}.srt",
        mime="text/plain"
    )
