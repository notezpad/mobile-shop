import type { Metadata } from 'next'

// صفحة خاصة بالمستخدم — مش المفروض تظهر في نتايج البحث.
// canonical: null عشان ما ترثش canonical الصفحة الرئيسية ("/") من الـ layout الأساسي.
export const metadata: Metadata = {
  title: 'تسجيل الدخول',
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  alternates: { canonical: null },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
