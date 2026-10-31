'use client'

/**
 * الطباعة جوه iframe مخفي في نفس الصفحة — بدل النافذة المنبثقة.
 *
 * ليه؟ كل الطباعة القديمة كانت `window.open` + `print()` في نافذة جديدة،
 * ودي كانت بتعمل مشكلتين مزعجتين:
 *  1) لما المستخدم يكنسل حوار الطباعة، كروم غالباً مبيبعتش حدث `afterprint`
 *     للنافذة — فالنافذة تفضل مفتوحة فاضية والسياق المودال بتاع الطباعة بيسيب
 *     الصفحة الرئيسية ميستقبلش ضغطات خالص (لا «طباعة» ولا «إلغاء» ولا X)
 *     والمستخدم مضطر يعمل ريفرش.
 *  2) حاجب النوافذ المنبثقة ممكن يمنع النافذة خالص.
 *
 * مع الـ iframe مفيش نافذة تانية أصلاً: المعاينة بتظهر فوق نفس التاب، ولما
 * تتقفل (طبع فعلاً أو كنسل) المستخدم يلاقي نفس الصفحة قدامه شغالة عادي
 * ويقدر يضغط «طباعة» تاني فوراً. حاجب النوافذ مالوش دعوة بالـ iframe.
 *
 * التنظيف على 3 طبقات (حتى لو واحد فشل الباقي بيغطي):
 *  - `afterprint` على إطار الطباعة + على الصفحة (كروم بيبعتها أحياناً للاتنين).
 *  - مؤقت احتياطي بينضّف لو `afterprint` ماوصلش (إلغاء في إصدارات كروم القديمة).
 *  - قبل أي طباعة جديدة بنشيل أي إطار قديم — فالطباعة التانية شغالة دايماً.
 */

const PRINT_FRAME_ID = '__sholel_print_frame__'
const CLEANUP_FALLBACK_MS = 90_000

/** يطبع مستند HTML كامل جوه iframe مخفي في نفس الصفحة.
 *  بيرجّع `true` لو أمر الطباعة انطلق — المستند static بالكامل فمفيش انتظار
 *  شبكة أو سكريبتات، سيك واحد كفاية للترتيب (نفس توقيت النوافذ القديمة).
 *
 *  `pageWidthPx`: عرض صفحة الطباعة بالبكسل (794 = A4، 280 = فاتورة 74مم،
 *  204 = فاتورة 54مم) — بنكبّر الإطار بالمقاس ده بدل 1px عشان عرض الـ viewport
 *  بتاع مستند الإطار يكون مطابق للورقة: فايرفوكس بيترتب مستند الإطار بعرض
 *  عنصر الإطار نفسه عند الطباعة، ومتصفحات تانية بتاخد بالها من الـ viewport
 *  في وحدات زي 100%/vw. العرض الافتراضي A4. */
export function printHtmlInFrame(
  html: string,
  title = 'طباعة',
  opts?: { pageWidthPx?: number; pageHeightPx?: number },
): boolean {
  if (typeof document === 'undefined' || !document.body) return false

  // إطار قديم من طباعة قبلها؟ نشيله الأول — ضمان إن «طباعة تاني» تشتغل دايماً
  document.getElementById(PRINT_FRAME_ID)?.remove()

  const pageW = Math.max(64, Math.round(opts?.pageWidthPx ?? 794))
  const pageH = Math.max(64, Math.round(opts?.pageHeightPx ?? 1024))

  const frame = document.createElement('iframe')
  frame.id = PRINT_FRAME_ID
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  // برّه الشاشة تماماً بس بمقاس الورقة الكامل — مش display:none (كروم مبيطبعش
  // إطارات display:none بشكل موثوق) ولا 1px (المتصفح بيترتب المستند بعرض
 //  الإطار فالمحتوى كان ممكن يتقص). +4px عشان ميبانش سكرول بار يغيّر الترتيب.
  const st = frame.style
  st.position = 'fixed'
  st.top = '0'
  st.left = '-10000px'
  st.width = `${pageW + 4}px`
  st.height = `${pageH}px`
  st.border = '0'
  st.pointerEvents = 'none'
  document.body.appendChild(frame)

  const win = frame.contentWindow
  if (!win) {
    frame.remove()
    return false
  }

  let fallback = 0
  const cleanup = () => {
    if (fallback) window.clearTimeout(fallback)
    fallback = 0
    try {
      frame.remove()
    } catch {
      /* ignore */
    }
    try {
      // نفضّي المقبضين اللي اتسجلوا هنا عشان ما يتعمدوش على عنصر اتشال
      win.onafterprint = null
      window.onafterprint = null
    } catch {
      /* ignore */
    }
  }
  // ⏱️ لو `afterprint` ماوصلش (إلغاء في إصدارات كروم القديمة) — التنظيف الاحتياطي
  fallback = window.setTimeout(cleanup, CLEANUP_FALLBACK_MS)

  try {
    win.onafterprint = cleanup
  } catch {
    /* ignore */
  }
  try {
    // كروم بيبعت afterprint ساعات للصفحة الرئيسية مش للإطار — بنسمع الاتنين
    window.onafterprint = cleanup
  } catch {
    /* ignore */
  }

  const doc = win.document
  doc.open()
  doc.write(html)
  doc.close()
  try {
    doc.title = title
  } catch {
    /* ignore */
  }

  // سيك واحد عشان الـ layout يترسم قبل أمر الطباعة
  window.setTimeout(() => {
    try {
      win.focus()
      win.print()
    } catch {
      cleanup()
    }
  }, 250)

  return true
}
