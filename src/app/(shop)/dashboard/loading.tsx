/**
 * ⚡ v9: skeleton لوحة التحكم — بيظهر فور الضغطة على "لوحة التحكم" بينما
 * chunk الصفحة بيتنزل (بديل الـ loading.tsx العام بشكل مطابق للوحة).
 */
import { PageSkeleton } from '@/components/shop/PageSkeleton'

export default function DashboardLoading() {
  return <PageSkeleton variant="dashboard" />
}
