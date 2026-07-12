import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, RotateCcw, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Badge,
} from '@components/ui';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { LoadingState } from '@components/feedback/LoadingState';
import { useSettings, useInvalidateSettings } from '../hooks/useSettings';
import { settingsApi } from '../api/settings.api';
import {
  SETTING_KEYS,
  type Setting,
  type SettingCategory,
  type UpsertSettingInput,
} from '@mobile-shop/shared';
import { toast } from 'sonner';

const TABS: Array<{ key: SettingCategory; label: string; icon: typeof SettingsIcon }> = [
  { key: 'general', label: 'عام', icon: SettingsIcon },
  { key: 'finance', label: 'مالي', icon: SettingsIcon },
  { key: 'receipt', label: 'الفواتير', icon: SettingsIcon },
  { key: 'notifications', label: 'الإشعارات', icon: SettingsIcon },
  { key: 'sync', label: 'المزامنة', icon: SettingsIcon },
  { key: 'security', label: 'الأمان', icon: SettingsIcon },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingCategory>('general');
  const invalidate = useInvalidateSettings();
  const queryClient = useQueryClient();
  const { settings, isLoading } = useSettings(activeTab);

  // Local state mirror for editing.
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  useEffect(() => {
    const m: Record<string, unknown> = {};
    settings.forEach((s: Setting) => (m[s.key] = s.value));
    setDraft(m);
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (inputs: UpsertSettingInput[]) => settingsApi.batchUpsert(inputs),
    onSuccess: () => {
      invalidate();
      toast.success('تم حفظ الإعدادات');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const seedMutation = useMutation({
    mutationFn: () => settingsApi.seedDefaults(),
    onSuccess: (data) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(`تم زرع ${data.inserted} إعداد افتراضي جديد`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = () => {
    const inputs: UpsertSettingInput[] = Object.entries(draft).map(([key, value]) => {
      const original = settings.find((s) => s.key === key);
      return {
        key,
        value: value as unknown,
        category: activeTab,
        branchId: original?.branchId ?? null,
      };
    });
    updateMutation.mutate(inputs);
  };

  if (isLoading && settings.length === 0) return <LoadingState />;

  return (
    <div className="page-container">
      <PageHeader
        title="الإعدادات"
        description="إعدادات النظام العامة — تنطبق على كل الفروع ما لم تُحدد إعدادات فرعية"
        actions={
          <RequirePermission permission="settings.manage">
            <Button
              variant="outline"
              onClick={() => seedMutation.mutate()}
              loading={seedMutation.isPending}
            >
              <Sparkles className="size-4" />
              <span>زرع الافتراضي</span>
            </Button>
          </RequirePermission>
        }
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <tab.icon className="size-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>{TABS.find((t) => t.key === activeTab)?.label}</CardTitle>
          <Badge variant="outline">{settings.length} إعداد</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeTab === 'general' && (
            <GeneralSettings draft={draft} setDraft={setDraft} />
          )}
          {activeTab === 'finance' && (
            <FinanceSettings draft={draft} setDraft={setDraft} />
          )}
          {activeTab === 'receipt' && (
            <ReceiptSettings draft={draft} setDraft={setDraft} />
          )}
          {activeTab === 'notifications' && (
            <NotificationSettings draft={draft} setDraft={setDraft} />
          )}
          {activeTab === 'sync' && (
            <SyncSettings draft={draft} setDraft={setDraft} />
          )}
          {activeTab === 'security' && (
            <SecuritySettings draft={draft} setDraft={setDraft} />
          )}
        </CardContent>
      </Card>

      {/* Save bar */}
      <RequirePermission permission="settings.manage">
        <div className="sticky bottom-4 flex justify-end gap-2 rounded-lg border bg-card/95 p-3 shadow-elevated backdrop-blur">
          <Button variant="outline" onClick={() => setDraft({})} disabled={updateMutation.isPending}>
            <RotateCcw className="size-4" />
            <span>تراجع</span>
          </Button>
          <Button onClick={handleSave} loading={updateMutation.isPending}>
            <Save className="size-4" />
            <span>حفظ الإعدادات</span>
          </Button>
        </div>
      </RequirePermission>
    </div>
  );
}

// ─── Tab content components ────────────────────────────────────────

interface TabProps {
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}

function GeneralSettings({ draft, setDraft }: TabProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="app_name">اسم التطبيق</Label>
        <Input
          id="app_name"
          value={(draft[SETTING_KEYS.APP_NAME] as string) ?? ''}
          onChange={(e) =>
            setDraft((d) => ({ ...d, [SETTING_KEYS.APP_NAME]: e.target.value }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="default_language">اللغة الافتراضية</Label>
        <select
          id="default_language"
          value={(draft[SETTING_KEYS.DEFAULT_LANGUAGE] as string) ?? 'ar'}
          onChange={(e) =>
            setDraft((d) => ({ ...d, [SETTING_KEYS.DEFAULT_LANGUAGE]: e.target.value }))
          }
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring"
        >
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="timezone">المنطقة الزمنية</Label>
        <Input
          id="timezone"
          value={(draft[SETTING_KEYS.TIMEZONE] as string) ?? ''}
          onChange={(e) =>
            setDraft((d) => ({ ...d, [SETTING_KEYS.TIMEZONE]: e.target.value }))
          }
          dir="ltr"
        />
      </div>
    </div>
  );
}

function FinanceSettings({ draft, setDraft }: TabProps) {
  const paymentMethods = (draft[SETTING_KEYS.ENABLE_PAYMENT_METHODS] as string[]) ?? [
    'cash',
    'card',
    'vodafone_cash',
    'instapay',
    'fawry',
  ];

  const toggleMethod = (method: string) => {
    const next = paymentMethods.includes(method)
      ? paymentMethods.filter((m) => m !== method)
      : [...paymentMethods, method];
    setDraft((d) => ({ ...d, [SETTING_KEYS.ENABLE_PAYMENT_METHODS]: next }));
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="default_currency">العملة الافتراضية</Label>
          <Input
            id="default_currency"
            value={(draft[SETTING_KEYS.DEFAULT_CURRENCY] as string) ?? 'EGP'}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                [SETTING_KEYS.DEFAULT_CURRENCY]: e.target.value.toUpperCase(),
              }))
            }
            maxLength={5}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="default_tax_rate">نسبة الضريبة الافتراضية (%)</Label>
          <Input
            id="default_tax_rate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={(draft[SETTING_KEYS.DEFAULT_TAX_RATE] as number) ?? 14}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                [SETTING_KEYS.DEFAULT_TAX_RATE]: Number(e.target.value),
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={(draft[SETTING_KEYS.ENABLE_MULTI_TAX] as boolean) ?? false}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  [SETTING_KEYS.ENABLE_MULTI_TAX]: e.target.checked,
                }))
              }
              className="size-4 accent-primary"
            />
            <span>تفعيل نظام ضرائب متعدد</span>
          </Label>
        </div>
      </div>

      <div className="space-y-2">
        <Label>وسائل الدفع المفعّلة</Label>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'cash', label: 'كاش' },
            { key: 'card', label: 'بطاقة' },
            { key: 'vodafone_cash', label: 'فودافون كاش' },
            { key: 'instapay', label: 'إنستاباي' },
            { key: 'fawry', label: 'فوري' },
            { key: 'credit', label: 'آجل' },
          ].map((m) => (
            <label
              key={m.key}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                paymentMethods.includes(m.key)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-input text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <input
                type="checkbox"
                checked={paymentMethods.includes(m.key)}
                onChange={() => toggleMethod(m.key)}
                className="size-3 accent-primary"
              />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReceiptSettings({ draft, setDraft }: TabProps) {
  return (
    <div className="grid gap-4">
      <div className="space-y-2">
        <Label htmlFor="invoice_template">قالب الفاتورة</Label>
        <select
          id="invoice_template"
          value={(draft[SETTING_KEYS.INVOICE_TEMPLATE] as string) ?? 'standard_a4'}
          onChange={(e) =>
            setDraft((d) => ({ ...d, [SETTING_KEYS.INVOICE_TEMPLATE]: e.target.value }))
          }
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring"
        >
          <option value="standard_a4">A4 قياسي</option>
          <option value="compact_a4">A4 مختصر</option>
          <option value="thermal_80">حرارية 80mm</option>
          <option value="thermal_58">حرارية 58mm</option>
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="invoice_header">رأس الفاتورة</Label>
          <textarea
            id="invoice_header"
            value={(draft[SETTING_KEYS.INVOICE_HEADER] as string) ?? ''}
            onChange={(e) =>
              setDraft((d) => ({ ...d, [SETTING_KEYS.INVOICE_HEADER]: e.target.value }))
            }
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-ring"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoice_footer">تذييل الفاتورة</Label>
          <textarea
            id="invoice_footer"
            value={(draft[SETTING_KEYS.INVOICE_FOOTER] as string) ?? ''}
            onChange={(e) =>
              setDraft((d) => ({ ...d, [SETTING_KEYS.INVOICE_FOOTER]: e.target.value }))
            }
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-ring"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={(draft[SETTING_KEYS.SHOW_QR_ON_INVOICE] as boolean) ?? true}
            onChange={(e) =>
              setDraft((d) => ({ ...d, [SETTING_KEYS.SHOW_QR_ON_INVOICE]: e.target.checked }))
            }
            className="size-4 accent-primary"
          />
          <span>إظهار QR Code على الفاتورة</span>
        </Label>
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={(draft[SETTING_KEYS.SHOW_BARCODE_ON_INVOICE] as boolean) ?? false}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                [SETTING_KEYS.SHOW_BARCODE_ON_INVOICE]: e.target.checked,
              }))
            }
            className="size-4 accent-primary"
          />
          <span>إظهار Barcode على الفاتورة</span>
        </Label>
      </div>
    </div>
  );
}

function NotificationSettings({ draft, setDraft }: TabProps) {
  return (
    <div className="grid gap-4">
      <Label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={(draft[SETTING_KEYS.LOW_STOCK_ALERT] as boolean) ?? true}
          onChange={(e) =>
            setDraft((d) => ({ ...d, [SETTING_KEYS.LOW_STOCK_ALERT]: e.target.checked }))
          }
          className="size-4 accent-primary"
        />
        <span>تنبيه عند انخفاض المخزون</span>
      </Label>
      <Label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={(draft[SETTING_KEYS.REPAIR_STATUS_ALERT] as boolean) ?? true}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              [SETTING_KEYS.REPAIR_STATUS_ALERT]: e.target.checked,
            }))
          }
          className="size-4 accent-primary"
        />
        <span>تنبيه عند تغيير حالة الصيانة</span>
      </Label>
    </div>
  );
}

function SyncSettings({ draft, setDraft }: TabProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="sync_interval">فترة المزامنة (مللي ثانية)</Label>
        <Input
          id="sync_interval"
          type="number"
          min="5000"
          step="1000"
          value={(draft[SETTING_KEYS.SYNC_INTERVAL_MS] as number) ?? 30000}
          onChange={(e) =>
            setDraft((d) => ({ ...d, [SETTING_KEYS.SYNC_INTERVAL_MS]: Number(e.target.value) }))
          }
        />
        <p className="text-xs text-muted-foreground">الحد الأدنى: 5000ms (5 ثواني).</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="conflict_strategy">استراتيجية حل التعارض</Label>
        <select
          id="conflict_strategy"
          value={(draft[SETTING_KEYS.SYNC_CONFLICT_STRATEGY] as string) ?? 'last_write_wins'}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              [SETTING_KEYS.SYNC_CONFLICT_STRATEGY]: e.target.value,
            }))
          }
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring"
        >
          <option value="last_write_wins">آخر تعديل يفوز (تلقائي)</option>
          <option value="manual">حل يدوي (يتطلب مراجعة)</option>
        </select>
      </div>
    </div>
  );
}

function SecuritySettings({ draft, setDraft }: TabProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="password_min_length">الحد الأدنى لطول كلمة المرور</Label>
        <Input
          id="password_min_length"
          type="number"
          min="6"
          max="32"
          value={(draft[SETTING_KEYS.PASSWORD_MIN_LENGTH] as number) ?? 8}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              [SETTING_KEYS.PASSWORD_MIN_LENGTH]: Number(e.target.value),
            }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="session_timeout">انتهاء الجلسة (دقائق)</Label>
        <Input
          id="session_timeout"
          type="number"
          min="5"
          max="1440"
          value={(draft[SETTING_KEYS.SESSION_TIMEOUT_MIN] as number) ?? 15}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              [SETTING_KEYS.SESSION_TIMEOUT_MIN]: Number(e.target.value),
            }))
          }
        />
      </div>
      <Label className="flex items-center gap-2 sm:col-span-2">
        <input
          type="checkbox"
          checked={(draft[SETTING_KEYS.REQUIRE_PIN] as boolean) ?? false}
          onChange={(e) =>
            setDraft((d) => ({ ...d, [SETTING_KEYS.REQUIRE_PIN]: e.target.checked }))
          }
          className="size-4 accent-primary"
        />
        <span>إلزام تعيين PIN لكل المستخدمين (دخول سريع)</span>
      </Label>
    </div>
  );
}
