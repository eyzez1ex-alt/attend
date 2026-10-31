import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Suspense } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Activity, BarChart3, Bell, CalendarDays, CalendarRange,
  ChevronLeft, CircleHelp, Clock3, Command, Fingerprint, Gauge, MapPin, Menu, Moon,
  Settings2, ShieldCheck, Sun, Users, X,
} from 'lucide-react'

type Theme = 'light' | 'dark'
type ShellProps = { theme: Theme; onThemeChange: (theme: Theme) => void }

const adminNav = [
  { to: '/admin', label: 'نظرة عامة', icon: Gauge, end: true },
  { to: '/admin/employees', label: 'الموظفون', icon: Users },
  { to: '/admin/attendance', label: 'إدارة الحضور', icon: Clock3 },
  { to: '/admin/location', label: 'الموقع والنطاق', icon: MapPin },
  { to: '/admin/vacations', label: 'الإجازات', icon: CalendarRange },
  { to: '/admin/holidays', label: 'العطلات الرسمية', icon: CalendarDays },
  { to: '/admin/reports', label: 'التقارير والتحليلات', icon: BarChart3 },
  { to: '/admin/access', label: 'صلاحيات المشرفين', icon: ShieldCheck },
]
const employeeNav = [
  { to: '/employee', label: 'الرئيسية', icon: Gauge, end: true },
  { to: '/employee/history', label: 'سجل الحضور', icon: Clock3 },
  { to: '/employee/statistics', label: 'إحصائياتي', icon: Activity },
  { to: '/employee/vacations', label: 'إجازاتي', icon: CalendarRange },
  { to: '/employee/profile', label: 'الملف والجهاز', icon: Fingerprint },
]

const titles: Record<string, string> = {
  '/admin': 'نظرة عامة', '/admin/employees': 'إدارة الموظفين', '/admin/attendance': 'إدارة الحضور',
  '/admin/location': 'الموقع والنطاق الجغرافي', '/admin/vacations': 'إدارة الإجازات',
  '/admin/holidays': 'العطلات الرسمية المصرية', '/admin/reports': 'التقارير والتحليلات', '/admin/access': 'صلاحيات المشرفين',
  '/employee': 'مساحة الموظف', '/employee/history': 'سجل الحضور', '/employee/statistics': 'إحصائياتي',
  '/employee/vacations': 'طلباتي للإجازة', '/employee/profile': 'الملف الشخصي والجهاز',
}

export function AppShell({ theme, onThemeChange }: ShellProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion()
  const isEmployee = pathname.startsWith('/employee')
  const nav = isEmployee ? employeeNav : adminNav
  const title = titles[pathname] ?? (pathname.startsWith('/admin/employees/') ? 'ملف الموظف' : 'إدارة الحضور')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const today = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())

  return <div className={`app-frame ${theme}`} data-theme={theme}>
    {mobileOpen && <button className="mobile-scrim" aria-label="إغلاق القائمة" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark"><Command size={19} strokeWidth={1.8} /></div>
        <div className="brand-copy"><strong>RU here?</strong><span>إدارة القوى العاملة</span></div>
        <button className="icon-button sidebar-close" aria-label="إغلاق القائمة" onClick={() => setMobileOpen(false)}><X size={18} /></button>
      </div>
      {!isEmployee && <div className="role-switch" aria-label="التنقل بين معاينات الأدوار">
        <button className="selected">المشرف</button>
        <button onClick={() => { navigate('/employee'); setMobileOpen(false) }}>الموظف</button>
      </div>}
      <div className="nav-caption">{isEmployee ? 'مساحة الموظف' : 'مساحة المشرف'}</div>
      <nav className="side-nav" aria-label="التنقل الرئيسي">
        {nav.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Icon size={18} strokeWidth={1.8} /><span>{label}</span><ChevronLeft className="nav-chevron" size={14} />
        </NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="api-indicator"><span className="indicator-dot" /><div><strong>وضع الواجهة</strong><small>بانتظار ربط الخدمة</small></div></div>
        <button className="nav-link help-link" onClick={() => setShowHelp(v => !v)}><CircleHelp size={18} /><span>مركز المساعدة</span><ChevronLeft className="nav-chevron" size={14} /></button>
        {showHelp && <div className="help-note">هذه معاينة للواجهة. لا يتم إرسال بيانات إلى خادم.</div>}
        <button className="profile-row" onClick={() => navigate(isEmployee ? '/employee/profile' : '/admin')}>
          <div className="avatar">{isEmployee ? 'م' : 'إ'}</div>
          <div className="profile-copy"><strong>{isEmployee ? 'مساحة الموظف' : 'مساحة المشرف'}</strong><span>معاينة الواجهة</span></div>
          <Settings2 size={16} className="muted-icon" />
        </button>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="topbar-leading">
          <button className="icon-button menu-toggle" aria-label="فتح القائمة" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
          <div className="breadcrumbs"><span>{isEmployee ? 'مساحة الموظف' : 'المشرف'}</span><ChevronLeft size={14} /><strong>{title}</strong></div>
        </div>
        <div className="topbar-actions">
          <span className="topbar-date">{today}</span>
          <button className="icon-button" aria-label={theme === 'light' ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح'} onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <div className="notification-wrap"><button className="icon-button notification-button" aria-label="الإشعارات" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(open => !open)}><Bell size={17} /></button>{notificationsOpen && <div className="notification-popover"><strong>الإشعارات</strong><span>لا توجد إشعارات بعد.</span><small>ستظهر التحديثات عند ربط مصدر البيانات.</small></div>}</div>
          <div className="topbar-divider" />
          <div className="top-avatar">{isEmployee ? 'م' : 'ش'}</div>
        </div>
      </header>
      <div className="page-content"><AnimatePresence mode="wait" initial={false}><motion.div key={pathname} initial={reducedMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0, y: -3 }} transition={{ duration: reducedMotion ? 0 : 0.18, ease: 'easeOut' }}><Suspense fallback={<div className="route-loading" role="status"><span className="loading-ring" />جارٍ تحميل الصفحة</div>}><Outlet /></Suspense></motion.div></AnimatePresence></div>
      <footer className="app-footer"><span>RU here?</span><span>واجهة أمامية تجريبية · لا يتم حفظ البيانات على الخادم</span><ShieldCheck size={15} /></footer>
    </main>
  </div>
}
