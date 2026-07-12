/**
 * Backup page — create, list, download, restore, delete backups.
 */
import { Database, Plus, Download, RotateCcw, Trash2, HardDrive, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, Button, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { EmptyState } from '@components/layout/EmptyState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { useBackups, useCreateBackup, useRestoreBackup, useDeleteBackup, downloadBackupFile, type BackupRecord } from '../api/backup.api';
import { formatDateTime } from '@core/utils/date';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const STATUS_META: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive'; icon: typeof CheckCircle2 }> = {
  completed: { label: 'مكتمل', variant: 'success', icon: CheckCircle2 },
  restoring: { label: 'جارٍ الاستعادة', variant: 'warning', icon: Clock },
  failed: { label: 'فشل', variant: 'destructive', icon: AlertCircle },
};
const DEFAULT_STATUS = { label: '—', variant: 'secondary' as const, icon: AlertCircle };

export default function BackupPage() {
  const { data: backups = [], isLoading } = useBackups();
  const createMut = useCreateBackup();
  const restoreMut = useRestoreBackup();
  const deleteMut = useDeleteBackup();

  return (
    <div className="page-container">
      <PageHeader
        title="النسخ الاحتياطي"
        description={`${backups.length} نسخة احتياطية`}
        actions={
          <RequirePermission permission="backup.create">
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending}>
              <Plus className="size-4" />
              <span>نسخة احتياطية جديدة</span>
            </Button>
          </RequirePermission>
        }
      />

      {/* Info card */}
      <Card className="border-info/30 bg-info/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <Database className="mt-0.5 size-5 text-info" />
          <div className="space-y-1">
            <p className="font-medium text-info-foreground">معلومات النسخ الاحتياطي</p>
            <p className="text-muted-foreground">
              تشمل النسخة جميع جداول النظام (المستخدمون، المنتجات، المبيعات، الصيانة، المخزون، المالية، إلخ).
              يتم تخزينها كملف JSON في Supabase Storage. يمكن استعادتها في أي وقت.
            </p>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : backups.length === 0 ? (
        <EmptyState
          icon={<HardDrive />}
          title="لا توجد نسخ احتياطية"
          description="أنشئ أول نسخة احتياطية لحماية بياناتك"
          action={
            <RequirePermission permission="backup.create">
              <Button onClick={() => createMut.mutate()} loading={createMut.isPending}>
                <Plus className="size-4" />
                <span>نسخة احتياطية جديدة</span>
              </Button>
            </RequirePermission>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {backups.map((b: BackupRecord) => {
            const st = STATUS_META[b.status] ?? DEFAULT_STATUS;
            const StIcon = st.icon;
            return (
              <Card key={b.id} className="overflow-hidden">
                <CardContent className="space-y-3 p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <HardDrive className="size-5" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{b.filename}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(b.created_at)}</p>
                      </div>
                    </div>
                    <Badge variant={b.type === 'auto' ? 'info' : 'secondary'} className="text-[10px]">
                      {b.type === 'auto' ? 'تلقائي' : 'يدوي'}
                    </Badge>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <HardDrive className="size-3" />
                      {formatSize(b.size)}
                    </span>
                    <span className="flex items-center gap-1">
                      <StIcon className="size-3" />
                      {st.label}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 border-t pt-3">
                    <RequirePermission permission="backup.view">
                      <Button
                        size="sm" variant="outline" className="flex-1"
                        onClick={() => downloadBackupFile(b.id, b.filename)}
                      >
                        <Download className="size-3.5" />
                        <span>تحميل</span>
                      </Button>
                    </RequirePermission>
                    <RequirePermission permission="backup.restore">
                      <ConfirmDialog
                        trigger={
                          <Button size="sm" variant="warning" className="flex-1">
                            <RotateCcw className="size-3.5" />
                            <span>استعادة</span>
                          </Button>
                        }
                        title="استعادة النسخة الاحتياطية"
                        description={`سيتم استبدال جميع البيانات الحالية بالنسخة "${b.filename}". لا يمكن التراجع. هل أنت متأكد؟`}
                        confirmLabel="استعادة"
                        onConfirm={async () => { await restoreMut.mutateAsync(b.id); }}
                      />
                    </RequirePermission>
                    <RequirePermission permission="backup.create">
                      <ConfirmDialog
                        trigger={
                          <Button size="icon-sm" variant="ghost" className="text-destructive">
                            <Trash2 className="size-4" />
                          </Button>
                        }
                        title="حذف النسخة الاحتياطية"
                        description={`هل أنت متأكد من حذف "${b.filename}"؟`}
                        confirmLabel="حذف"
                        destructive
                        onConfirm={async () => { await deleteMut.mutateAsync(b.id); }}
                      />
                    </RequirePermission>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
