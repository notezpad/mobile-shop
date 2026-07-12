/**
 * Backup API client + hooks.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, API_PREFIX } from '@core/db/api-client';
import { toast } from 'sonner';

export interface BackupRecord {
  id: string;
  filename: string;
  size: number;
  type: 'manual' | 'auto';
  status: 'completed' | 'failed' | 'restoring';
  created_by: string | null;
  created_at: string;
}

export const backupApi = {
  list: () => api.get<BackupRecord[]>(`${API_PREFIX}/backups`),
  create: () => api.post<BackupRecord>(`${API_PREFIX}/backups`, {}),
  download: (id: string) => `${API_PREFIX}/backups/${id}/download`,
  restore: (id: string) => api.post<{ restoredTables: number; restoredRows: number }>(`${API_PREFIX}/backups/${id}/restore`, {}),
  delete: (id: string) => api.delete<null>(`${API_PREFIX}/backups/${id}`),
};

export function useBackups() {
  return useQuery({ queryKey: ['backups'], queryFn: backupApi.list, staleTime: 30_000 });
}

export function useCreateBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: backupApi.create,
    onSuccess: () => { toast.success('تم إنشاء نسخة احتياطية'); qc.invalidateQueries({ queryKey: ['backups'] }); },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: backupApi.restore,
    onSuccess: (data) => { toast.success(`تمت الاستعادة: ${data.restoredTables} جدول، ${data.restoredRows} صف`); qc.invalidateQueries(); },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: backupApi.delete,
    onSuccess: () => { toast.success('تم حذف النسخة الاحتياطية'); qc.invalidateQueries({ queryKey: ['backups'] }); },
    onError: (err: Error) => toast.error(err.message),
  });
}

/** Download backup as JSON file (uses auth token). */
export async function downloadBackupFile(id: string, filename: string) {
  const token = localStorage.getItem('mse-access-token');
  const res = await fetch(`${API_PREFIX}/backups/${id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) { toast.error('فشل تحميل النسخة الاحتياطية'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
