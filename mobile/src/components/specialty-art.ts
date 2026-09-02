/**
 * رسمات التخصصات المصوّرة — شبكة ٦٤×٦٤، مصدر واحد للجوال والويب.
 *
 * لماذا نصّ SVG خام لا بنية بيانات كالأيقونات الخطّية في specialty-paths.ts:
 * هذه رسماتٌ ملوّنة بتدرّجاتٍ وشفافياتٍ وتحويلات، وترميزها في `Shape[]` يعني
 * إعادة اختراع نصف مواصفة SVG. المحرّكان يقرآن النصّ كما هو — `SvgXml` في
 * الجوال و`innerHTML` في الويب — فتبقى الرسمة واحدةً بلا ترجمة.
 *
 * قواعد الرسم كي تبقى العائلة متّسقة:
 *   • الموضوع يشغل نحو ٤٤×٤٤ في وسط الشبكة، فيتنفّس داخل البلاطة.
 *   • تدرّجٌ واحد على الأقل لكل كتلة: النبرة الواحدة تُقرأ ملصقاً لا عضواً.
 *   • خطّ لمعةٍ أبيض شفيف على الحدّ المضيء — هو ما يعطي الإحساس المجسّم.
 *   • الحدّ الأدنى للسماكة ١.٦ لأن الرسمة تُعرض عند ٣٢px فينسحق ما دقّ.
 *   • مُعرّفات التدرّجات مسبوقةٌ باختصار التخصص: على الويب تتشارك كل الرسمات
 *     مستنداً واحداً، فالمُعرّف المكرّر يسرق تدرّج جاره.
 */

export const SPECIALTY_ART: Record<string, string> = {
  "general-practice": `
    <defs>
      <linearGradient id="gp-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5A6B7D"/><stop offset="1" stop-color="#2E3B49"/></linearGradient>
      <linearGradient id="gp-b" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#F2F6FA"/><stop offset=".5" stop-color="#BFCAD7"/><stop offset="1" stop-color="#7E8B99"/></linearGradient>
    </defs>
    <path d="M18 13C18 22 23 29 30 32" stroke="url(#gp-a)" stroke-width="4.8" fill="none" stroke-linecap="round"/>
    <path d="M46 13C46 22 41 29 34 32" stroke="url(#gp-a)" stroke-width="4.8" fill="none" stroke-linecap="round"/>
    <path d="M32 31.5C31 39.5 34 45.5 39.5 48.5" stroke="url(#gp-a)" stroke-width="4.8" fill="none" stroke-linecap="round"/>
    <circle cx="18" cy="11" r="3.6" fill="#8895A4"/>
    <circle cx="46" cy="11" r="3.6" fill="#8895A4"/>
    <circle cx="45" cy="50" r="9.5" fill="url(#gp-b)"/>
    <circle cx="45" cy="50" r="5.8" fill="#39485A"/>
    <circle cx="45" cy="50" r="5.8" fill="none" stroke="#75828F" stroke-width="1.6"/>
    <path d="M39.5 44.5c1.8-1.8 4.2-2.8 6.6-2.6" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".6"/>
  `,

  "internal-medicine": `
    <defs>
      <linearGradient id="im-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#7CC3D0"/><stop offset="1" stop-color="#2A7686"/></linearGradient>
    </defs>
    <circle cx="32" cy="13.5" r="7.5" fill="url(#im-a)"/>
    <path d="M32 22c8.4 0 14.2 5 15.2 13 .8 6.4.4 12.4-1.2 18.4-4.6 2.4-9.4 3.6-14 3.6-4.6 0-9.4-1.2-14-3.6-1.6-6-2-12-1.2-18.4C17.8 27 23.6 22 32 22Z" fill="url(#im-a)"/>
    <path d="M20.5 39h5.5l2.5-5.5 3.5 10 3-4.5h8.5" stroke="#fff" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M22 26.5c2.6-2 5.6-3.2 8.6-3.4" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".35"/>
  `,

  "pediatrics": `
    <defs>
      <linearGradient id="pd-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#F5C892"/><stop offset="1" stop-color="#C4864A"/></linearGradient>
      <linearGradient id="pd-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FCE7CA"/><stop offset="1" stop-color="#E6BE95"/></linearGradient>
    </defs>
    <circle cx="15.5" cy="18" r="8.5" fill="url(#pd-a)"/>
    <circle cx="48.5" cy="18" r="8.5" fill="url(#pd-a)"/>
    <circle cx="15.5" cy="18" r="4.2" fill="#D6A06A"/>
    <circle cx="48.5" cy="18" r="4.2" fill="#D6A06A"/>
    <ellipse cx="32" cy="33.5" rx="19" ry="17.5" fill="url(#pd-a)"/>
    <ellipse cx="32" cy="39.5" rx="10.5" ry="8" fill="url(#pd-b)"/>
    <ellipse cx="32" cy="36" rx="3.6" ry="2.8" fill="#6B4B2E"/>
    <path d="M32 38.8v3.4M32 42.2c-1.8 1.8-4.4 1.8-5.8 0M32 42.2c1.8 1.8 4.4 1.8 5.8 0" stroke="#6B4B2E" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <circle cx="24" cy="28.5" r="3" fill="#3B2716"/>
    <circle cx="40" cy="28.5" r="3" fill="#3B2716"/>
    <circle cx="23" cy="27.4" r="1.1" fill="#fff" opacity=".9"/>
    <circle cx="39" cy="27.4" r="1.1" fill="#fff" opacity=".9"/>
    <path d="M20 23c3.6-3.2 8.4-4.8 13-4.6" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".38"/>
  `,

  "obgyn": `
    <defs>
      <linearGradient id="ob-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#F19DB6"/><stop offset="1" stop-color="#BC5578"/></linearGradient>
    </defs>
    <path d="M24.5 22c-4-4.4-9.4-5-12.5-.4-2.8 4.2-1 9 2.6 10.6" stroke="url(#ob-a)" stroke-width="4.8" fill="none" stroke-linecap="round"/>
    <path d="M39.5 22c4-4.4 9.4-5 12.5-.4 2.8 4.2 1 9-2.6 10.6" stroke="url(#ob-a)" stroke-width="4.8" fill="none" stroke-linecap="round"/>
    <g transform="rotate(-20 12.5 35)"><ellipse cx="12.5" cy="35" rx="5" ry="3.8" fill="#DE7A9C"/></g>
    <g transform="rotate(20 51.5 35)"><ellipse cx="51.5" cy="35" rx="5" ry="3.8" fill="#DE7A9C"/></g>
    <path d="M32 50v6" stroke="#AC4A6D" stroke-width="5.4" stroke-linecap="round" fill="none"/>
    <path d="M23.5 21c5.4-2.2 11.6-2.2 17 0 3.2 8.4 3 17.6-1 24.8-1.8 3.2-4.4 4.8-7.5 4.8s-5.7-1.6-7.5-4.8c-4-7.2-4.2-16.4-1-24.8Z" fill="url(#ob-a)"/>
    <path d="M27 25c-1.2 6.4-1.2 13 .6 18.4" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".4"/>
  `,

  "general-surgery": `
    <defs>
      <linearGradient id="gs-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#FAFCFE"/><stop offset=".5" stop-color="#C6D0DC"/><stop offset="1" stop-color="#8A97A6"/></linearGradient>
      <linearGradient id="gs-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#526071"/><stop offset="1" stop-color="#252F3A"/></linearGradient>
    </defs>
    <g transform="rotate(-30 32 32)">
      <path d="M28.4 29.5h7.2c.9 0 1.6.7 1.6 1.6V53c0 1.2-1 2.2-2.2 2.2h-6c-1.2 0-2.2-1-2.2-2.2V31.1c0-.9.7-1.6 1.6-1.6Z" fill="url(#gs-b)"/>
      <path d="M29.4 34h5.2M29.4 37.8h5.2M29.4 41.6h5.2" stroke="#7C8998" stroke-width="1.4" stroke-linecap="round" fill="none"/>
      <path d="M28 29.5V14.6c0-3.2 2.2-5.9 5-6.6 1.9 4.2 2.9 9.4 3 14.8v6.7Z" fill="url(#gs-a)"/>
      <path d="M33.2 8.6c1.8 4.2 2.7 9.2 2.8 14.4" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".75"/>
    </g>
  `,

  "orthopedics": `
    <defs>
      <linearGradient id="or-a" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" stop-color="#FDF6E8"/><stop offset=".55" stop-color="#EFE0C4"/><stop offset="1" stop-color="#CFBB96"/></linearGradient>
    </defs>
    <g transform="rotate(-12 32 32)">
      <g fill="#B29B71" stroke="#B29B71" stroke-width="3.2" stroke-linejoin="round">
        <ellipse cx="25" cy="14" rx="6.4" ry="6"/>
        <ellipse cx="37.5" cy="13.5" rx="5.8" ry="5.4"/>
        <path d="M27.4 14c-1.2 11-1.2 22-.4 31h9.8c.8-9 .8-20-.4-31Z"/>
        <ellipse cx="26.5" cy="49.5" rx="6.4" ry="6"/>
        <ellipse cx="37.5" cy="49.5" rx="6.4" ry="6"/>
      </g>
      <g fill="url(#or-a)">
        <ellipse cx="25" cy="14" rx="6.4" ry="6"/>
        <ellipse cx="37.5" cy="13.5" rx="5.8" ry="5.4"/>
        <path d="M27.4 14c-1.2 11-1.2 22-.4 31h9.8c.8-9 .8-20-.4-31Z"/>
        <ellipse cx="26.5" cy="49.5" rx="6.4" ry="6"/>
        <ellipse cx="37.5" cy="49.5" rx="6.4" ry="6"/>
      </g>
      <path d="M29.4 20c-.6 7-.6 15 0 22" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".7"/>
      <path d="M25.6 35.5 30 30l3.6 5.5 5-5.5" stroke="#B8332B" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  `,

  "cardiology": `
    <defs>
      <linearGradient id="ca-a" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" stop-color="#EE5B72"/><stop offset=".55" stop-color="#D23A55"/><stop offset="1" stop-color="#9C1B33"/></linearGradient>
      <linearGradient id="ca-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#AFD2EE"/><stop offset="1" stop-color="#5A8CBA"/></linearGradient>
    </defs>
    <path d="M25 24C21.5 16 23.5 8 29 6.5" stroke="url(#ca-b)" stroke-width="6.6" fill="none" stroke-linecap="round"/>
    <path d="M41.5 20c3.5-7.5 1.5-12.5-3.5-13.5" stroke="url(#ca-b)" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M33 19C31 5.5 47 3.5 50.5 13c1.2 3.6 1.2 8 .8 11.5" stroke="#C7405A" stroke-width="6.8" fill="none" stroke-linecap="round"/>
    <path d="M18 29c-1-9 7.5-14.5 14.5-10C40 12.5 51.5 16.5 52 28c.5 10-4 18.5-11.5 23.5-5.5 3.6-12 5.4-16.5 2.6C19.5 47.5 18 37 18 29Z" fill="url(#ca-a)"/>
    <path d="M32.5 19c1.5 12-1 26-4.5 34.9-2 .5-3.6.4-4-.4C19.5 47.5 18 37 18 29c-1-9 7.5-14.5 14.5-10Z" fill="#6E0F26" opacity=".24"/>
    <path d="M32.5 19.5c1.4 11.6-1 25.6-4.4 34.4" stroke="#6E0F26" stroke-width="1.6" fill="none" opacity=".4" stroke-linecap="round"/>
    <path d="M34 21.5c3.4 5.4 8.4 7.6 13.5 6.6" stroke="#F9AEBB" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".8"/>
    <path d="M38 25c-.8 7.6-2.4 14.6-4.6 20.6" stroke="#F9AEBB" stroke-width="2.1" fill="none" stroke-linecap="round" opacity=".62"/>
    <path d="M47.5 24.5c2.4 3.4 3 8.4 2 13.5" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".3"/>
  `,

  "gastroenterology": `
    <defs>
      <linearGradient id="ge-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#F3A88D"/><stop offset="1" stop-color="#BE5F49"/></linearGradient>
    </defs>
    <path d="M25.5 16V5" stroke="#CE7C61" stroke-width="6.4" stroke-linecap="round" fill="none"/>
    <path d="M36.5 38c5.4 0 9 3.8 9 8.6 0 4.6-3.2 8.2-8 8.8" stroke="url(#ge-a)" stroke-width="6.4" fill="none" stroke-linecap="round"/>
    <path d="M26.5 12c-6.5 0-11.5 5-12 12-.5 6 1 12 3.5 17 2.5 5 8 7.5 13 5.5 4-1.5 6.5-5 6-9-.5-4.5-3.5-7.5-5.5-11.5-2-4-2.5-10-3-14Z" fill="url(#ge-a)"/>
    <path d="M19.5 21.5c3.4 2 6 5 7.5 8.6M17.5 30c3.6 1.8 6.6 4.6 8.5 8.2M19 39c3 1.4 5.6 3.6 7.4 6.4" stroke="#9E4632" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".5"/>
    <path d="M20.5 15.5c-2.6 2.6-4 6.4-4.2 10.5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".45"/>
  `,

  "nephrology-urology": `
    <defs>
      <linearGradient id="ne-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#B5735F"/><stop offset="1" stop-color="#76382B"/></linearGradient>
    </defs>
    <path d="M34 26h12.5" stroke="#C7405A" stroke-width="4.8" stroke-linecap="round" fill="none"/>
    <path d="M34.5 31.5h10.5" stroke="#5A8CBA" stroke-width="4.2" stroke-linecap="round" fill="none"/>
    <path d="M35 36.5c6 2.5 9 8 9 15.5" stroke="#DEC68A" stroke-width="4.6" fill="none" stroke-linecap="round"/>
    <path d="M26 10c8 0 14 6 15 14-4 1.6-6.6 4-6.6 7.4 0 3.6 2.6 6 6.4 7.2-1.6 7.6-7.6 13-14.8 13-8.4 0-14-7.6-14-20.8C12 17.6 17.6 10 26 10Z" fill="url(#ne-a)"/>
    <path d="M33.5 33c-4.6 1.2-7.4 4.6-7.4 8.8" stroke="#59281D" stroke-width="2" fill="none" stroke-linecap="round" opacity=".55"/>
    <path d="M20 16.5c-2.4 5.6-3.4 12-3 18" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".32"/>
  `,

  "pulmonology": `
    <defs>
      <linearGradient id="pu-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#F6A9B3"/><stop offset="1" stop-color="#BF5E6A"/></linearGradient>
      <linearGradient id="pu-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9EDF2"/><stop offset="1" stop-color="#AEB8C4"/></linearGradient>
    </defs>
    <path d="M32 7.5V26" stroke="url(#pu-b)" stroke-width="6.4" stroke-linecap="round" fill="none"/>
    <path d="M32 25.5 24 32M32 25.5l8 6.5" stroke="url(#pu-b)" stroke-width="5.2" stroke-linecap="round" fill="none"/>
    <path d="M28.8 12h6.4M28.8 16.5h6.4M28.8 21h6.4" stroke="#939EAB" stroke-width="1.7" stroke-linecap="round" fill="none"/>
    <path d="M26 28.5c2.8 0 4.2 2.1 4.2 4.8v18c0 3.5-3.5 5.8-6.9 4.5C16.7 53.3 12.5 46.4 12.5 38.5c0-5.2 1.7-9.3 4.2-11 2.7-1.7 6.6-.6 9.3.2Z" fill="url(#pu-a)"/>
    <path d="M38 28.5c-2.8 0-4.2 2.1-4.2 4.8v18c0 3.5 3.5 5.8 6.9 4.5 6.4-2.5 10.6-9.4 10.6-17.3 0-5.2-1.7-9.3-4.2-11-2.7-1.7-6.6-.6-9.3.2Z" fill="url(#pu-a)"/>
    <path d="M23.5 34c-.6 6.2-.6 12.4 0 17.6M23.5 39l-4.2 3.2M23.5 45.4l-4.2 3.2" stroke="#9E4551" stroke-width="1.7" fill="none" stroke-linecap="round" opacity=".5"/>
    <path d="M40.5 34c.6 6.2.6 12.4 0 17.6M40.5 39l4.2 3.2M40.5 45.4l4.2 3.2" stroke="#9E4551" stroke-width="1.7" fill="none" stroke-linecap="round" opacity=".5"/>
    <path d="M17.5 34.5c-1.8 3.2-2.6 7.4-2.4 11.4" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".35"/>
  `,

  "endocrinology": `
    <defs>
      <linearGradient id="en-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#F0A9A2"/><stop offset="1" stop-color="#B85752"/></linearGradient>
      <linearGradient id="en-b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#EDF1F5"/><stop offset="1" stop-color="#B8C2CD"/></linearGradient>
    </defs>
    <path d="M32 6v49" stroke="#94A0AC" stroke-width="14" stroke-linecap="round" fill="none"/>
    <path d="M32 6v49" stroke="url(#en-b)" stroke-width="11" stroke-linecap="round" fill="none"/>
    <path d="M26.6 10.5h10.8M26.6 16h10.8M26.6 45h10.8M26.6 50.5h10.8" stroke="#96A2AE" stroke-width="2.1" stroke-linecap="round" fill="none"/>
    <path d="M32 27c2-7 6-13 12-13.5 7-.5 11 5.5 9.5 13-1.5 8-7.5 14.5-14.5 16-4.5 1-7-2.5-7-7-.0 4.5-2.5 8-7 7-7-1.5-13-8-14.5-16-1.5-7.5 2.5-13.5 9.5-13 6 .5 10 6.5 12 13.5Z" fill="url(#en-a)"/>
    <path d="M32 28v8" stroke="#A84E49" stroke-width="1.8" stroke-linecap="round" opacity=".45" fill="none"/>
    <path d="M17.5 18.5c-2.2 3.4-3 7.8-2.2 12" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".45"/>
    <path d="M49.5 45c3.2 3.6 5.2 6.4 5.2 8.9 0 3-2.3 5.3-5.2 5.3s-5.2-2.3-5.2-5.3c0-2.5 2-5.3 5.2-8.9Z" fill="#C7405A"/>
    <circle cx="47.7" cy="52.4" r="1.6" fill="#fff" opacity=".55"/>
  `,

  "neurology": `
    <defs>
      <linearGradient id="nr-a" x1=".2" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#F3AFBF"/><stop offset="1" stop-color="#CE7089"/></linearGradient>
      <linearGradient id="nr-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E6EAEF"/><stop offset="1" stop-color="#AEB7C2"/></linearGradient>
    </defs>
    <path d="M32 39c1.5 6 1 10.5-1.5 14.5" stroke="url(#nr-b)" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M30 45.5h5.5M29.5 50h5" stroke="#94A0AC" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M38.5 38.5c8-1.5 13 2 11 6.5-2 4-9.5 5.5-15 2.5-.5-4 1-7.5 4-9Z" fill="#CB7189"/>
    <path d="M40.5 41c3.5 0 6 1.5 6.5 4M39 44.5c3.5 0 5.5 1 6.5 3" stroke="#A2536B" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M12.5 31c-2-7 2-13.5 8.5-15.5C23.5 10.5 31 8.5 36 12c8-2.5 16.5 3 16 10.5 3.5 3.5 3 10-2 13-2 4.5-8.5 6.5-14 4.5-8 2.5-19.5-1.5-23.5-9Z" fill="url(#nr-a)"/>
    <g stroke="#A34F6B" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8">
      <path d="M20.5 17c-3.5 2.5-4 7-1 9.5-3 2-3.5 5.5-1 8"/>
      <path d="M30 12.5c-3.5 2.5-4 7-.5 9.5-3.5 2-4 6-1 8.5"/>
      <path d="M40 12.5c-3.5 3-3.5 7.5 0 10-3 2-3.5 5.5-1.5 8"/>
      <path d="M49.5 18c-3.5 2-4.5 6-2 8.5-2.5 2-3 5-1 7"/>
    </g>
    <path d="M15 33c6-3.5 13.5-3.5 20 0" stroke="#8E4560" stroke-width="2" fill="none" stroke-linecap="round" opacity=".5"/>
    <path d="M22.5 17c5-3.5 11.5-4 16-2" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".3"/>
  `,

  "neurosurgery": `
    <defs>
      <linearGradient id="ns-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#93AABF"/><stop offset="1" stop-color="#4A5D72"/></linearGradient>
      <linearGradient id="ns-b" x1=".2" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#F3AFBF"/><stop offset="1" stop-color="#CE7089"/></linearGradient>
    </defs>
    <path d="M32 7c12 0 21 9 21 21 0 4.6-1.4 8-3.2 10.6-.9 1.3-.5 2.4.7 3 1.4.7 1.7 2.2.6 3.2-.7.7-1.8 1-3 1 .3 3.4-.6 6-2.6 7.4-2.2 1.6-5.6 1.8-9.5 1.4V57H16.5V43.6C13 40 11 34.6 11 28 11 16 20 7 32 7Z" fill="url(#ns-a)"/>
    <path d="M22 21.5c7.5-4.4 18-2.4 22.4 4.2 3.6 5.4 1.8 12.4-3.6 15.8-6.2 3.9-15 2.4-19.4-3.2-3.9-5-3.2-13.2 .6-16.8Z" fill="url(#ns-b)"/>
    <g stroke="#A34F6B" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8">
      <path d="M27 24c-3 2.2-3.2 6-.7 8.2-2.4 1.7-2.9 4.8-.9 6.8"/>
      <path d="M36.5 22.5c-3 2.4-3 6.2 0 8.4-2.4 1.7-2.9 4.6-1.2 6.4"/>
      <path d="M45 27c-2.8 1.8-3.4 5-1.4 7"/>
    </g>
    <path d="M18.5 22C24.5 13.5 36 11.5 44.5 16.5" stroke="#8FE0F0" stroke-width="2.2" stroke-dasharray="2.8 3.2" fill="none" stroke-linecap="round"/>
    <circle cx="44.5" cy="16.5" r="1.9" fill="#8FE0F0"/>
  `,

  "dermatology": `
    <defs>
      <linearGradient id="dr-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#F9D9BA"/><stop offset="1" stop-color="#D5A278"/></linearGradient>
      <linearGradient id="dr-b" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#DEE8F2"/><stop offset="1" stop-color="#8499AF"/></linearGradient>
    </defs>
    <path d="M14 20c0-3.3 2.7-6 6-6h24c3.3 0 6 2.7 6 6v18c0 3.3-2.7 6-6 6H20c-3.3 0-6-2.7-6-6V20Z" fill="url(#dr-a)"/>
    <circle cx="21.5" cy="23.5" r="2.7" fill="#B2764A" opacity=".8"/>
    <circle cx="41.5" cy="20.5" r="2" fill="#B2764A" opacity=".6"/>
    <circle cx="44.5" cy="36.5" r="2.9" fill="#A5673F" opacity=".75"/>
    <circle cx="20" cy="37.5" r="1.9" fill="#B2764A" opacity=".55"/>
    <circle cx="31.5" cy="30.5" r="12.5" fill="#EAF3FB" opacity=".5"/>
    <circle cx="30.5" cy="29.5" r="4.4" fill="#8A5730"/>
    <circle cx="31.5" cy="30.5" r="12.5" fill="none" stroke="url(#dr-b)" stroke-width="4.2"/>
    <path d="M41 40 51 50" stroke="#5C7286" stroke-width="5.6" stroke-linecap="round" fill="none"/>
    <path d="M24 24c2.6-2.6 6-3.9 9.4-3.7" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".7"/>
  `,

  "ophthalmology": `
    <defs>
      <radialGradient id="op-a" cx=".38" cy=".34" r=".72"><stop offset="0" stop-color="#63B4E8"/><stop offset=".62" stop-color="#2E76B8"/><stop offset="1" stop-color="#1B4E85"/></radialGradient>
      <linearGradient id="op-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCE3EB"/></linearGradient>
    </defs>
    <path d="M4 32c7-11.6 16.4-17.4 28-17.4S53 20.4 60 32c-7 11.6-16.4 17.4-28 17.4S11 43.6 4 32Z" fill="url(#op-b)"/>
    <path d="M4 32c7-11.6 16.4-17.4 28-17.4S53 20.4 60 32c-9-8-18-12-28-12S13 24 4 32Z" fill="#B9C6D4" opacity=".45"/>
    <circle cx="32" cy="32" r="13" fill="url(#op-a)"/>
    <g stroke="#8FD0F5" stroke-width="1.5" opacity=".55" stroke-linecap="round">
      <path d="M32 21v5M32 38v5M21 32h5M38 32h5M24.2 24.2l3.6 3.6M36.2 36.2l3.6 3.6M39.8 24.2l-3.6 3.6M27.8 36.2l-3.6 3.6"/>
    </g>
    <circle cx="32" cy="32" r="13" fill="none" stroke="#123A63" stroke-width="2"/>
    <circle cx="32" cy="32" r="5.6" fill="#0C1620"/>
    <circle cx="27.6" cy="27.4" r="3.1" fill="#fff" opacity=".92"/>
    <circle cx="36" cy="37" r="1.5" fill="#fff" opacity=".5"/>
    <path d="M4 32c7-11.6 16.4-17.4 28-17.4S53 20.4 60 32" fill="none" stroke="#3C4B5C" stroke-width="3" stroke-linecap="round"/>
    <path d="M11 20.5 8 16M32 14.6V9M53 20.5 56 16M21 16.6 19.4 11.6M43 16.6 44.6 11.6" stroke="#3C4B5C" stroke-width="2.6" stroke-linecap="round" fill="none"/>
    <path d="M4 32c7 11.6 16.4 17.4 28 17.4S53 43.6 60 32" fill="none" stroke="#54637A" stroke-width="2" stroke-linecap="round" opacity=".8"/>
  `,

  "ent": `
    <defs>
      <linearGradient id="et-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#F9D6B6"/><stop offset="1" stop-color="#C88E62"/></linearGradient>
    </defs>
    <path d="M16.5 38.6C16.5 23 24.7 9 38 9c9.6 0 15.8 7 15.8 16.4 0 7.4-3.6 12.2-6.9 15.9" stroke="url(#et-a)" stroke-width="9.6" fill="none" stroke-linecap="round"/>
    <path d="M16.5 37c0 8.4 4.6 14.6 11.5 16.4" stroke="url(#et-a)" stroke-width="9.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="29.5" cy="52" rx="6.4" ry="5.4" fill="url(#et-a)"/>
    <path d="M40.5 22c3.9 1.5 5.8 5.4 4.7 9.2-1.1 3.8-4.7 6-8.6 5.3-3.6-.6-6-3.8-5.8-7.5" stroke="#B98455" stroke-width="4.6" fill="none" stroke-linecap="round"/>
    <path d="M30.8 29c-2.8 3.2-3.6 7.5-2.1 11.3" stroke="#B98455" stroke-width="4.2" fill="none" stroke-linecap="round"/>
    <path d="M27 16.5c3.8-2.8 8.4-4.2 13-3.8" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".5"/>
  `,

  "dentistry": `
    <defs>
      <linearGradient id="dn-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#EFF4F9"/><stop offset="1" stop-color="#BECBD8"/></linearGradient>
    </defs>
    <path d="M20 10c3.4 0 5 1.5 12 1.5 7 0 8.6-1.5 12-1.5 5.6 0 9.6 4.4 9.6 11 0 5.8-1.9 10.2-3.2 15-1.1 4.2-1.3 8.7-2.3 12.1-.8 2.9-2.3 4.4-4.4 4.4-2.5 0-3.6-1.9-4.4-5.4-.8-3.5-1.1-8.3-2.9-8.3s-2.1 4.8-2.9 8.3c-.8 3.5-1.9 5.4-4.4 5.4-2.1 0-3.6-1.5-4.4-4.4-1-3.4-1.2-7.9-2.3-12.1-1.3-4.8-3.2-9.2-3.2-15 0-6.6 4-11 9.6-11Z" fill="url(#dn-a)"/>
    <path d="M24.5 18.5c4.6-2.6 10.2-2.8 15-.6" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".95"/>
    <path d="M25 35c.9 5.2 1.3 10 1.8 14.5M39 35c-.9 5.2-1.3 10-1.8 14.5" stroke="#AEBBC8" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".7"/>
  `,

  "psychiatry": `
    <defs>
      <linearGradient id="py-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#A9C7DE"/><stop offset="1" stop-color="#5A7893"/></linearGradient>
      <linearGradient id="py-b" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#F7A9BB"/><stop offset="1" stop-color="#CE5069"/></linearGradient>
    </defs>
    <g transform="translate(64,0) scale(-1,1)">
      <path d="M32 7c12 0 21 9 21 21 0 4.6-1.4 8-3.2 10.6-.9 1.3-.5 2.4.7 3 1.4.7 1.7 2.2.6 3.2-.7.7-1.8 1-3 1 .3 3.4-.6 6-2.6 7.4-2.2 1.6-5.6 1.8-9.5 1.4V57H16.5V43.6C13 40 11 34.6 11 28 11 16 20 7 32 7Z" fill="url(#py-a)"/>
      <path d="M17.5 16.5c3.8-3.8 9-5.9 14.3-5.9" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".32"/>
    </g>
    <path d="M31.5 38.5c-6.4-4.3-9.6-7.9-9.6-12.1 0-3.8 3-6.6 6.6-6.6 2.3 0 4.5 1.2 5.6 3.1 1.2-1.9 3.3-3.1 5.6-3.1 3.6 0 6.6 2.8 6.6 6.6 0 4.2-3.2 7.8-9.6 12.1-1.7 1.2-3.6 1.2-5.2 0Z" fill="url(#py-b)"/>
    <path d="M26.5 24.5c-.9 1.5-.9 3.2 0 4.7" stroke="#fff" stroke-width="2.1" fill="none" stroke-linecap="round" opacity=".6"/>
  `,

  "oncology": `
    <defs>
      <linearGradient id="on-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#CBA9EA"/><stop offset="1" stop-color="#7345AC"/></linearGradient>
    </defs>
    <path d="M24.5 54 34 34.5c6.5-11.5 10-17 6.5-21.5-3.2-4-11-4-14.5.5-3.6 4.6-.5 9.5 5.5 20.5L40 54" stroke="url(#on-a)" stroke-width="7.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M31 33.5 33.6 38.5" stroke="#5B348E" stroke-width="7.6" fill="none" stroke-linecap="round" opacity=".32"/>
    <path d="M28.5 16c3.2-2.6 7.8-2.8 11-.6" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".45"/>
  `,

  "rheumatology": `
    <defs>
      <linearGradient id="rh-a" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" stop-color="#FDF6E8"/><stop offset=".55" stop-color="#EFE0C4"/><stop offset="1" stop-color="#CFBB96"/></linearGradient>
      <radialGradient id="rh-b" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#E8503F" stop-opacity=".5"/><stop offset="1" stop-color="#E8503F" stop-opacity="0"/></radialGradient>
    </defs>
    <circle cx="32" cy="32" r="18" fill="url(#rh-b)"/>
    <g fill="#B29B71" stroke="#B29B71" stroke-width="3" stroke-linejoin="round">
      <path d="M27.5 9h9v14h-9z"/>
      <ellipse cx="26.5" cy="24" rx="6" ry="5.4"/>
      <ellipse cx="37.5" cy="24" rx="6" ry="5.4"/>
      <ellipse cx="26.5" cy="40" rx="6" ry="5.4"/>
      <ellipse cx="37.5" cy="40" rx="6" ry="5.4"/>
      <path d="M27.5 41h9v14h-9z"/>
    </g>
    <g fill="url(#rh-a)">
      <path d="M27.5 9h9v14h-9z"/>
      <ellipse cx="26.5" cy="24" rx="6" ry="5.4"/>
      <ellipse cx="37.5" cy="24" rx="6" ry="5.4"/>
      <ellipse cx="26.5" cy="40" rx="6" ry="5.4"/>
      <ellipse cx="37.5" cy="40" rx="6" ry="5.4"/>
      <path d="M27.5 41h9v14h-9z"/>
    </g>
    <rect x="20.5" y="29" width="23" height="6" rx="3" fill="#DF4A3D"/>
    <path d="M24 31.5h6" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".5" fill="none"/>
    <path d="M29.5 12c-.5 3-.5 6 0 9" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/>
  `,

  "hematology": `
    <defs>
      <linearGradient id="he-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#EE5B6E"/><stop offset=".6" stop-color="#CE2B45"/><stop offset="1" stop-color="#8E1228"/></linearGradient>
      <radialGradient id="he-b" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#FF9FAB"/><stop offset="1" stop-color="#D8455C"/></radialGradient>
    </defs>
    <path d="M32 6c8.5 11 17 20.5 17 29.5C49 46 41.4 54 32 54s-17-8-17-18.5C15 26.5 23.5 17 32 6Z" fill="url(#he-a)"/>
    <g fill="url(#he-b)">
      <ellipse cx="25.5" cy="34.5" rx="7.2" ry="5.8"/>
      <ellipse cx="38" cy="42.5" rx="6.4" ry="5.2"/>
      <ellipse cx="38.5" cy="28.5" rx="5.4" ry="4.4"/>
    </g>
    <g fill="#AF2340" opacity=".45">
      <ellipse cx="25.5" cy="34.5" rx="3.1" ry="2.5"/>
      <ellipse cx="38" cy="42.5" rx="2.7" ry="2.2"/>
      <ellipse cx="38.5" cy="28.5" rx="2.3" ry="1.9"/>
    </g>
    <path d="M24.5 19.5c-3.4 4.6-5.6 9-6.4 13.4" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".45"/>
  `,

  "vascular-surgery": `
    <defs>
      <linearGradient id="va-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E86274"/><stop offset=".5" stop-color="#CB3550"/><stop offset="1" stop-color="#8E1B31"/></linearGradient>
      <linearGradient id="va-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A3C7E6"/><stop offset=".5" stop-color="#6693C0"/><stop offset="1" stop-color="#3D6690"/></linearGradient>
    </defs>
    <path d="M13 47c8.5-3.2 13.8-9 16.4-17.4C32 20.6 37.4 14.4 47 11" stroke="url(#va-b)" stroke-width="8.2" fill="none" stroke-linecap="round"/>
    <path d="M11 20c9.4 1 15.6 5.2 19.8 12.5C34.4 39 39.6 43.2 46.5 44.8" stroke="url(#va-a)" stroke-width="9.2" fill="none" stroke-linecap="round"/>
    <path d="M30.5 32.5c2.6 5.8 3.1 11.6 1.5 17.7" stroke="url(#va-a)" stroke-width="5.6" fill="none" stroke-linecap="round"/>
    <circle cx="46.5" cy="44.8" r="2.7" fill="#5E0F22"/>
    <path d="M14.5 21.5c6.2 1.5 11 4.6 14.5 9.4" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".35"/>
  `,

  "plastic-surgery": `
    <defs>
      <linearGradient id="pg-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#FADCC0"/><stop offset="1" stop-color="#D29B71"/></linearGradient>
    </defs>
    <g transform="translate(64,0) scale(-1,1)">
      <path d="M32 7c12 0 21 9 21 21 0 4.6-1.4 8-3.2 10.6-.9 1.3-.5 2.4.7 3 1.4.7 1.7 2.2.6 3.2-.7.7-1.8 1-3 1 .3 3.4-.6 6-2.6 7.4-2.2 1.6-5.6 1.8-9.5 1.4V57H16.5V43.6C13 40 11 34.6 11 28 11 16 20 7 32 7Z" fill="url(#pg-a)"/>
      <path d="M46 24.5c1.8.6 3 1.8 3.6 3.4" stroke="#A97448" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".7"/>
      <path d="M42 46c2.4.6 4.6.4 6.6-.6" stroke="#A97448" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".55"/>
      <path d="M19 24c1.4-6 5.6-10.4 11.4-12.2" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".45"/>
    </g>
    <path d="M16.5 12.5 18.2 17.3 23 19l-4.8 1.7-1.7 4.8-1.7-4.8L10 19l4.8-1.7z" fill="#EFB63F"/>
    <path d="M50 33.5 51.3 37l3.5 1.3-3.5 1.3-1.3 3.5-1.3-3.5-3.5-1.3 3.5-1.3z" fill="#EFB63F" opacity=".85"/>
    <path d="M45.5 15.5 46.5 18.2 49.2 19.2 46.5 20.2 45.5 22.9 44.5 20.2 41.8 19.2 44.5 18.2z" fill="#EFB63F" opacity=".7"/>
  `,

  "fertility": `
    <defs>
      <radialGradient id="fe-a" cx=".38" cy=".34" r=".72"><stop offset="0" stop-color="#FCDDE7"/><stop offset=".6" stop-color="#F0A8C0"/><stop offset="1" stop-color="#C1638A"/></radialGradient>
    </defs>
    <circle cx="39" cy="27" r="19.5" fill="#F3C2D5" opacity=".4"/>
    <circle cx="39" cy="27" r="14.5" fill="url(#fe-a)"/>
    <circle cx="39" cy="27" r="6.2" fill="#B85A80" opacity=".5"/>
    <circle cx="32.5" cy="20.5" r="3.4" fill="#fff" opacity=".6"/>
    <circle cx="19" cy="45" r="6" fill="#5E7C97"/>
    <circle cx="17" cy="43" r="1.9" fill="#fff" opacity=".55"/>
    <path d="M15 49.5c-3 2.8-1.2 5.4-4.2 7" stroke="#5E7C97" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M10.8 56.5c-2.4 1.2-1 3.2-3.2 4" stroke="#5E7C97" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  `,

  "allergy-immunology": `
    <defs>
      <linearGradient id="ai-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#83CEDE"/><stop offset="1" stop-color="#28788E"/></linearGradient>
    </defs>
    <g fill="#E8A93C">
      <circle cx="11.5" cy="14" r="3.5"/>
      <circle cx="52.5" cy="11.5" r="2.9"/>
      <circle cx="56" cy="26" r="2.2"/>
      <circle cx="8.5" cy="27.5" r="2.4"/>
    </g>
    <path d="M32 8 50 13.5v14.8c0 11.6-7.2 20.4-18 24.7-10.8-4.3-18-13.1-18-24.7V13.5L32 8Z" fill="url(#ai-a)"/>
    <path d="M32 41V30.5M32 30.5 25.5 23M32 30.5 38.5 23" stroke="#fff" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17.5 16.5c-.6 4.2-.8 8.6-.4 12.8" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".3"/>
  `,

  "physiotherapy": `
    <defs>
      <linearGradient id="pt-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#83CFBB"/><stop offset="1" stop-color="#26816C"/></linearGradient>
    </defs>
    <path d="M12.5 45c-1.6-11.6 3.6-22 13.5-27.4" stroke="#8FD3C2" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-dasharray="1.6 5.6"/>
    <circle cx="42.5" cy="42.5" r="6.5" fill="#E8A93C" opacity=".35"/>
    <circle cx="34" cy="12" r="6.2" fill="url(#pt-a)"/>
    <path d="M34 19v14.5" stroke="url(#pt-a)" stroke-width="6.6" stroke-linecap="round" fill="none"/>
    <path d="M34.5 23.5 46.5 15M33.5 24.5 24.5 31.5" stroke="url(#pt-a)" stroke-width="5.4" fill="none" stroke-linecap="round"/>
    <path d="M33.5 33.5 25.5 43.5 23.5 53M34.5 33.5 42.5 42.5 48 50.5" stroke="url(#pt-a)" stroke-width="5.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  `,

  "nutrition": `
    <defs>
      <linearGradient id="nu-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#F0645C"/><stop offset=".6" stop-color="#D33A3E"/><stop offset="1" stop-color="#961F2C"/></linearGradient>
      <linearGradient id="nu-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#93D57F"/><stop offset="1" stop-color="#3B8A4B"/></linearGradient>
    </defs>
    <path d="M32 17.5c0-4.5.7-7.8 2.6-10" stroke="#7A5230" stroke-width="3.6" fill="none" stroke-linecap="round"/>
    <path d="M33.5 13.5c3.8-6.8 10.4-8.8 15.5-6.4-.6 6.4-5.2 11.6-11.4 12.2-2.1.2-3.5-1.3-4.1-2.7-.4-1.1-.4-2.1 0-3.1Z" fill="url(#nu-b)"/>
    <path d="M36.5 15.5c3.5-2.5 7.3-3.7 11-3.7" stroke="#2F6E3D" stroke-width="1.7" fill="none" stroke-linecap="round" opacity=".7"/>
    <path d="M32 19c3.1-2.7 7.6-3.5 11.3-1.6 5.1 2.5 7.8 8.6 6.8 15.8-1 7.8-5.1 15.8-10.3 19.9-2.7 2.1-5.1 1.6-7.8.4-2.7 1.2-5.1 1.7-7.8-.4-5.2-4.1-9.3-12.1-10.3-19.9-1-7.2 1.7-13.3 6.8-15.8 3.7-1.9 8.2-1.1 11.3 1.6Z" fill="url(#nu-a)"/>
    <path d="M21.5 24c-2.7 3.1-3.9 7.8-3.5 12.7" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".4"/>
  `,

  "radiology": `
    <defs>
      <linearGradient id="rd-a" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#31506E"/><stop offset="1" stop-color="#111F2E"/></linearGradient>
    </defs>
    <rect x="10" y="8" width="44" height="48" rx="5.5" fill="url(#rd-a)"/>
    <path d="M32 16.5V50" stroke="#E4EDF5" stroke-width="4.6" stroke-linecap="round" opacity=".92" fill="none"/>
    <g stroke="#CFDDEA" stroke-width="2.7" fill="none" stroke-linecap="round" opacity=".85">
      <path d="M30.5 20.5c-5.2.6-9 3.5-10.5 7.2M33.5 20.5c5.2.6 9 3.5 10.5 7.2"/>
      <path d="M30.5 28c-5.6.6-9.8 3.7-11.4 7.7M33.5 28c5.6.6 9.8 3.7 11.4 7.7"/>
      <path d="M30.5 35.5c-5.2.6-9 3.5-10.5 7.2M33.5 35.5c5.2.6 9 3.5 10.5 7.2"/>
    </g>
    <path d="M14.5 14.5 26 8.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".28" fill="none"/>
    <circle cx="47" cy="49" r="3.1" fill="#7FD0E0" opacity=".8"/>
  `,
};
