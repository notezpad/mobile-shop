import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Package,
  Warehouse,
  ShoppingCart,
  Wrench,
  Receipt,
  Wallet,
  Settings,
  LogOut,
  Menu,
  CloudOff,
  Cloud,
  ShieldCheck,
  Building2,
  Smartphone,
  FolderTree,
  ArrowRightLeft,
  History,
  ClipboardCheck,
  Truck,
  Undo2,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Briefcase,
  HardDrive,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@core/utils/cn';
import { useAuthStore } from '@stores/auth.store';
import { useUiStore } from '@stores/ui.store';
import { useSyncStore } from '@stores/sync.store';
import { usePermission } from '@core/hooks/usePermission';
import { NotificationsDropdown } from '@modules/notifications/components/NotificationsDropdown';
import { Button } from '@components/ui';
import { toast } from 'sonner';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: string;
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, permission: 'dashboard.view' },
  { to: '/pos', label: 'نقطة البيع', icon: ShoppingCart, permission: 'sales.create' },
  { to: '/sales', label: 'المبيعات', icon: Receipt, permission: 'sales.view' },
  { to: '/returns', label: 'المرتجعات', icon: Undo2, permission: 'returns.view' },
  { to: '/repairs', label: 'الصيانة', icon: Wrench, permission: 'repairs.view' },
  { to: '/customers', label: 'العملاء', icon: Users, permission: 'customers.view' },
  { to: '/suppliers', label: 'الموردون', icon: Truck, permission: 'catalog.suppliers.manage' },
  { to: '/catalog/products', label: 'المنتجات', icon: Package, permission: 'catalog.products.view' },
  { to: '/catalog/devices', label: 'الأجهزة (IMEI)', icon: Smartphone, permission: 'catalog.devices.view' },
  { to: '/catalog/categories', label: 'الفئات', icon: FolderTree, permission: 'catalog.products.view' },
  { to: '/inventory', label: 'المخزون', icon: Warehouse, permission: 'inventory.view' },
  { to: '/inventory/movements', label: 'حركات المخزون', icon: History, permission: 'inventory.view' },
  { to: '/inventory/stocktake', label: 'الجرد', icon: ClipboardCheck, permission: 'inventory.stocktake' },
  { to: '/inventory/transfers', label: 'التحويلات', icon: ArrowRightLeft, permission: 'inventory.transfer' },
  { to: '/invoices', label: 'الفواتير', icon: Receipt, permission: 'invoices.view' },
  { to: '/cashbox', label: 'الخزنة', icon: Wallet, permission: 'cashbox.view' },
  { to: '/expenses', label: 'المصروفات', icon: TrendingDown, permission: 'expenses.view' },
  { to: '/revenues', label: 'الإيرادات', icon: TrendingUp, permission: 'revenues.view' },
  { to: '/reports/sales', label: 'تقارير المبيعات', icon: BarChart3, permission: 'reports.sales' },
  { to: '/reports/inventory', label: 'تقارير المخزون', icon: BarChart3, permission: 'reports.inventory' },
  { to: '/reports/repairs', label: 'تقارير الصيانة', icon: BarChart3, permission: 'reports.repairs' },
  { to: '/reports/finance', label: 'التقرير المالي', icon: BarChart3, permission: 'reports.finance' },
  { to: '/branches', label: 'الفروع', icon: Building2, permission: 'branches.view' },
  { to: '/employees', label: 'الموظفون', icon: Briefcase, permission: 'employees.view' },
  { to: '/users', label: 'المستخدمون', icon: Users, permission: 'users.view' },
  { to: '/roles', label: 'الأدوار والصلاحيات', icon: ShieldCheck, permission: 'roles.view' },
  { to: '/backup', label: 'النسخ الاحتياطي', icon: HardDrive, permission: 'backup.view' },
  { to: '/audit-logs', label: 'سجل التدقيق', icon: History, permission: 'audit_logs.view' },
  { to: '/settings', label: 'الإعدادات', icon: Settings, permission: 'settings.view' },
];

export function DashboardLayout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const isOnline = useUiStore((s) => s.isOnline);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const { can } = usePermission();

  const handleLogout = async () => {
    try {
      // Fire logout endpoint (clears cookie + audit log).
      await import('@modules/auth/api/auth.api').then((m) => m.authApi.logout());
    } catch {
      // ignore network errors
    }
    clearSession();
    localStorage.removeItem('mse-access-token');
    toast.success('تم تسجيل الخروج بنجاح');
    navigate('/login', { replace: true });
  };

  const hasPermission = (perm?: string) => {
    if (!perm) return true;
    return can(perm);
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* ─── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-40 flex flex-col border-l bg-card transition-[width] duration-300',
          collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]',
        )}
      >
        {/* Logo */}
        <div className="flex h-[var(--header-height)] items-center gap-2 border-b px-4">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <SmartphoneIcon className="size-5" />
          </div>
          {!collapsed ? (
            <div className="flex-1">
              <p className="text-sm font-bold leading-none">Mobile Shop ERP</p>
              <p className="text-xs text-muted-foreground">إدارة المحلات والصيانة</p>
            </div>
          ) : null}
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3 no-scrollbar">
          {navItems
            .filter((item) => hasPermission(item.permission))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive && 'bg-primary text-primary-foreground hover:bg-primary/90',
                    collapsed && 'justify-center px-2',
                  )
                }
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="size-5 shrink-0" />
                {!collapsed ? <span className="flex-1">{item.label}</span> : null}
              </NavLink>
            ))}
        </nav>

        {/* User */}
        <div className="border-t p-3">
          <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
            <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-bold">
              {user?.fullName?.charAt(0) ?? 'U'}
            </div>
            {!collapsed ? (
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium">{user?.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.username}</p>
              </div>
            ) : null}
            {!collapsed ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleLogout}
                title="تسجيل الخروج"
                aria-label="تسجيل الخروج"
              >
                <LogOut className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </aside>

      {/* ─── Main ─────────────────────────────────────────────────── */}
      <div
        className={cn(
          'flex flex-1 flex-col transition-[padding] duration-300',
          collapsed ? 'md:pr-[var(--sidebar-collapsed-width)]' : 'md:pr-[var(--sidebar-width)]',
        )}
      >
        {/* Header */}
        <header className="flex h-[var(--header-height)] items-center gap-3 border-b bg-card px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="إظهار/إخفاء القائمة"
          >
            <Menu className="size-5" />
          </Button>

          <div className="flex-1" />

          {/* Online status */}
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
              isOnline
                ? 'bg-success/10 text-success'
                : 'bg-warning/10 text-warning',
            )}
            title={isOnline ? 'متصل بالإنترنت' : 'وضع عدم الاتصال'}
          >
            {isOnline ? <Cloud className="size-3.5" /> : <CloudOff className="size-3.5" />}
            <span className="hidden sm:inline">
              {isOnline ? 'متصل' : `غير متصل${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
            </span>
          </div>

          {/* Notifications */}
          <NotificationsDropdown />

          {/* User menu (mobile) */}
          <Button variant="ghost" size="icon" className="md:hidden" onClick={handleLogout}>
            <LogOut className="size-5" />
          </Button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-safe">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SmartphoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </svg>
  );
}

void ChevronRight; // tree-shake safety
