import { lazy, Suspense, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/Shell'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const AdminOverview = lazy(() => import('./pages/AdminPages').then(page => ({ default: page.AdminOverview })))
const EmployeesPage = lazy(() => import('./pages/AdminPages').then(page => ({ default: page.EmployeesPage })))
const EmployeeDetailsPage = lazy(() => import('./pages/AdminPages').then(page => ({ default: page.EmployeeDetailsPage })))
const AccessManagementPage = lazy(() => import('./pages/AdminPages').then(page => ({ default: page.AccessManagementPage })))
const AttendancePage = lazy(() => import('./pages/AdminPages').then(page => ({ default: page.AttendancePage })))
const LocationPage = lazy(() => import('./pages/AdminPages').then(page => ({ default: page.LocationPage })))
const VacationsPage = lazy(() => import('./pages/AdminPages').then(page => ({ default: page.VacationsPage })))
const HolidaysPage = lazy(() => import('./pages/AdminPages').then(page => ({ default: page.HolidaysPage })))
const ReportsPage = lazy(() => import('./pages/AdminPages').then(page => ({ default: page.ReportsPage })))
const EmployeeHome = lazy(() => import('./pages/EmployeePages').then(page => ({ default: page.EmployeeHome })))
const EmployeeHistory = lazy(() => import('./pages/EmployeePages').then(page => ({ default: page.EmployeeHistory })))
const EmployeeStatistics = lazy(() => import('./pages/EmployeePages').then(page => ({ default: page.EmployeeStatistics })))
const EmployeeVacations = lazy(() => import('./pages/EmployeePages').then(page => ({ default: page.EmployeeVacations })))
const EmployeeProfile = lazy(() => import('./pages/EmployeePages').then(page => ({ default: page.EmployeeProfile })))

type Theme = 'light' | 'dark'
function AdminLayout({ theme, onThemeChange }: { theme: Theme; onThemeChange: (theme: Theme) => void }) { return <AppShell theme={theme} onThemeChange={onThemeChange} /> }
function EmployeeLayout({ theme, onThemeChange }: { theme: Theme; onThemeChange: (theme: Theme) => void }) { return <AppShell theme={theme} onThemeChange={onThemeChange} /> }

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => window.localStorage.getItem('attendance-theme') === 'dark' ? 'dark' : 'light')
  const updateTheme = (next: Theme) => { setTheme(next); window.localStorage.setItem('attendance-theme', next) }
  return <Suspense fallback={<div className="route-loading" role="status"><span className="loading-ring" />جارٍ تحميل الصفحة</div>}><Routes>
    <Route path="/login" element={<LoginPage theme={theme} onThemeChange={updateTheme} />} />
    <Route path="/admin" element={<AdminLayout theme={theme} onThemeChange={updateTheme} />}>
      <Route index element={<AdminOverview />} />
      <Route path="employees" element={<EmployeesPage />} />
      <Route path="employees/:employeeId" element={<EmployeeDetailsPage />} />
      <Route path="attendance" element={<AttendancePage />} />
      <Route path="location" element={<LocationPage />} />
      <Route path="vacations" element={<VacationsPage />} />
      <Route path="holidays" element={<HolidaysPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="access" element={<AccessManagementPage />} />
    </Route>
    <Route path="/employee" element={<EmployeeLayout theme={theme} onThemeChange={updateTheme} />}>
      <Route index element={<EmployeeHome />} />
      <Route path="history" element={<EmployeeHistory />} />
      <Route path="statistics" element={<EmployeeStatistics />} />
      <Route path="vacations" element={<EmployeeVacations />} />
      <Route path="profile" element={<EmployeeProfile />} />
    </Route>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes></Suspense>
}
