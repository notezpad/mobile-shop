import type { Metadata } from 'next'

// صفحة خاصة بالمستخدم — مش المفروض تظهر في نتايج البحث.
export const metadata: Metadata = {
  title: 'استعادة كلمة المرور',
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
