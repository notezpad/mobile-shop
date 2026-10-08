'use client'

/**
 * ⚡ SANDBOX DEMO ENTRY (2026-10-08):
 * في الموقع الحقيقي هذه الصفحة هي اللاندنج + HomeGate (يقرر الزائر vs
 * المسجّل vs السوبر أدمن). في بيئة المعاينة هنا بنفتح لوحة الأدمن مباشرة
 * على صفحة "المحلات المشتركة" — وهي الصفحة المطلوب تطوير ستايلها.
 *
 * (النسخة الأصلية محفوظة في مستودع الموقع — هذا ملف عرض فقط.)
 */

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import { useShopStore } from '@/lib/store'

const SuperAdminApp = dynamic(
  () => import('@/components/admin/SuperAdminApp').then((m) => m.SuperAdminApp),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-amber-500" />
      </div>
    ),
  },
)

export default function AdminDemoPage() {
  const setUser = useShopStore((s) => s.setUser)

  React.useEffect(() => {
    setUser({
      userId: 'demo-super-admin',
      name: 'أحمد الأدمن',
      email: 'admin@nezam.pos',
      role: 'SUPER_ADMIN',
      tenantId: 'platform-tenant',
      branchId: null,
    })
  }, [setUser])

  return <SuperAdminApp />
}
