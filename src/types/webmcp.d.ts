/**
 * WebMCP (Declarative API) — سمات HTML الوصفية اللي بتحوّل <form> لأداة يقدر وكيل الذكاء الاصطناعي
 * في المتصفح يستدعيها. المرجع: https://developer.chrome.com/docs/ai/webmcp/declarative-api
 *
 * السمات: toolname + tooldescription على الـ <form> (الاتنين لازم يتوجدوا وإلا الأداة تتشال)،
 * و toolparamdescription على الحقول (وصف الخاصية في الـ JSON Schema). اسم الخاصية بيجي من name="" للحقل.
 * ملاحظة: بنستخدم عمداً بدون toolautosubmit — الإرسال دايماً بتأكيد المستخدم.
 */
import "react";

declare module "react" {
  interface FormHTMLAttributes<T> {
    toolname?: string;
    tooldescription?: string;
    toolautosubmit?: boolean | "";
  }
  interface InputHTMLAttributes<T> {
    toolparamdescription?: string;
    toolparamtitle?: string;
  }
  interface SelectHTMLAttributes<T> {
    toolparamdescription?: string;
    toolparamtitle?: string;
  }
  interface TextareaHTMLAttributes<T> {
    toolparamdescription?: string;
    toolparamtitle?: string;
  }
}
