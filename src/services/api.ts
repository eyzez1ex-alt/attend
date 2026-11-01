import {
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { getBytes, getStorage, ref } from 'firebase/storage'
import { MODERATOR_OWNER_EMAIL } from '../constants/access'
import { countCompletedAttendanceDays, getEligibleWorkingDates } from '../utils/attendance'
import { firebaseApp, firebaseAuth, firebaseConfigured } from './firebase'
import { runMutation, runQuery } from './sqlConnect'
import type {
  Attendance,
  AttendanceStatistics,
  AuditEntry,
  AuthSession,
  Employee,
  GeofenceVerification,
  OfficialHoliday,
  SystemRole,
  Vacation,
  WorkLocation,
} from '../types'

export interface ApiError { message: string; code?: string }
export interface ApiResult<T> { data: T | null; error: ApiError | null }

const blockedByTrustedBackend = <T>(reason: string): Promise<ApiResult<T>> => Promise.resolve({
  data: null,
  error: { code: 'TRUSTED_BACKEND_REQUIRED', message: reason },
})

function firebaseError(error: unknown): ApiError {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'FIREBASE_ERROR'
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'بيانات تسجيل الدخول غير صحيحة.',
    'auth/user-not-found': 'بيانات تسجيل الدخول غير صحيحة.',
    'auth/wrong-password': 'بيانات تسجيل الدخول غير صحيحة.',
    'auth/too-many-requests': 'تم إيقاف المحاولة مؤقتاً. حاول لاحقاً.',
    'auth/network-request-failed': 'تعذر الاتصال بخدمة المصادقة. تحقق من اتصال الإنترنت.',
    'auth/operation-not-allowed': 'فعّل طريقة البريد الإلكتروني وكلمة المرور في Firebase Authentication.',
    'auth/unauthorized-domain': 'أضف نطاق التطبيق إلى النطاقات المصرح بها في Firebase Authentication.',
  }
  return { code, message: messages[code] ?? 'تعذر إكمال طلب المصادقة. تحقق من إعداد Firebase وحالة الحساب.' }
}

async function sessionForUser(user: User): Promise<ApiResult<AuthSession>> {
  const token = await user.getIdTokenResult()
  const claims = token.claims
  const email = user.email?.trim().toLocaleLowerCase() ?? ''
  const claimRole = claims.role
  let role: SystemRole | null = null

  if (email === MODERATOR_OWNER_EMAIL && user.emailVerified) role = 'owner'
  else if ((claimRole === 'moderator' || claimRole === 'admin' || claims.moderator === true || claims.admin === true) && user.emailVerified) role = 'moderator'
  else if (claimRole === 'employee' && user.emailVerified) role = 'employee'

  if (!role) return { data: null, error: { code: 'ROLE_NOT_CONFIGURED', message: 'تم التحقق من الحساب، لكن لم يُضف له دور نظام موثّق بعد.' } }
  return { data: { userId: user.uid, email, role }, error: null }
}

export const authService = {
  login: async (credentials: { email: string; accessCode: string; password: string; remember?: boolean }): Promise<ApiResult<AuthSession>> => {
    if (!firebaseConfigured || !firebaseAuth) return { data: null, error: { code: 'FIREBASE_NOT_CONFIGURED', message: 'إعداد Firebase غير مكتمل. راجع ملف .env.local ثم أعد تشغيل التطبيق.' } }
    try {
      await setPersistence(firebaseAuth, credentials.remember ? browserLocalPersistence : browserSessionPersistence)
      const result = await signInWithEmailAndPassword(firebaseAuth, credentials.email.trim(), credentials.password)
      const session = await sessionForUser(result.user)
      if (session.data?.role === 'employee') {
        const token = await result.user.getIdTokenResult()
        const registeredCode = String(token.claims.employeeCode ?? token.claims.employee_id ?? '').trim().toLocaleLowerCase()
        if (!registeredCode || registeredCode !== credentials.accessCode.trim().toLocaleLowerCase()) {
          await signOut(firebaseAuth)
          return { data: null, error: { code: 'EMPLOYEE_CODE_MISMATCH', message: 'رقم الموظف أو رمز الدخول غير مطابق للحساب.' } }
        }
      }
      if (!session.data) await signOut(firebaseAuth)
      return session
    } catch (error) { return { data: null, error: firebaseError(error) } }
  },
  getCurrentUser: async (): Promise<ApiResult<AuthSession>> => {
    if (!firebaseConfigured || !firebaseAuth) return { data: null, error: { code: 'FIREBASE_NOT_CONFIGURED', message: 'إعداد Firebase غير مكتمل.' } }
    if (!firebaseAuth.currentUser) return { data: null, error: null }
    try { return await sessionForUser(firebaseAuth.currentUser) } catch (error) { return { data: null, error: firebaseError(error) } }
  },
  onSessionChanged: (callback: (result: ApiResult<AuthSession>) => void) => {
    if (!firebaseAuth) { callback({ data: null, error: null }); return () => undefined }
    return onAuthStateChanged(firebaseAuth, async user => {
      if (!user) { callback({ data: null, error: null }); return }
      try { callback(await sessionForUser(user)) } catch (error) { callback({ data: null, error: firebaseError(error) }) }
    })
  },
  sendPasswordReset: async (email: string): Promise<ApiResult<void>> => {
    if (!firebaseAuth) return { data: null, error: { code: 'FIREBASE_NOT_CONFIGURED', message: 'إعداد Firebase غير مكتمل.' } }
    try { await sendPasswordResetEmail(firebaseAuth, email.trim()); return { data: undefined, error: null } }
    catch (error) { return { data: null, error: firebaseError(error) } }
  },
  logout: async (): Promise<ApiResult<void>> => {
    if (!firebaseAuth) return { data: null, error: { code: 'FIREBASE_NOT_CONFIGURED', message: 'إعداد Firebase غير مكتمل.' } }
    try { await signOut(firebaseAuth); return { data: undefined, error: null } }
    catch (error) { return { data: null, error: firebaseError(error) } }
  },
}

type EmployeeRow = { firebaseUid: string; employeeCode: string; fullName: string; email: string; department?: string | null; isActive: boolean }
type VacationRow = {
  id: string; employeeFirebaseUid?: string; employee?: { employeeCode: string; fullName: string } | null
  vacationType: string; startDate: string; endDate: string; totalWorkingDays?: number | null; status: string
  requestNote?: string | null; decisionNote?: string | null; createdAt?: string
}
type HolidayRow = {
  id: string; holidayName: string; holidayDate: string; category: string; announcementSource?: string | null
  sourceUrl?: string | null; confirmationStatus: string; notes?: string | null
}
type AttendanceRow = {
  employeeFirebaseUid: string; employee?: { employeeCode?: string; fullName?: string } | null
  workDate: string; checkInAt?: string | null; checkOutAt?: string | null; status?: string | null
  locationCheckStatus?: string | null
}
type RowCollection<T> = { employees?: T[]; vacations?: T[]; officialHolidays?: T[]; attendances?: T[]; workLocations?: T[]; monthlyReports?: T[]; moderatorAccesses?: T[]; weeklyHolidayRules?: T[]; adminLogs?: T[] }

const asArray = <T>(value: T[] | null | undefined): T[] => value ?? []
const managerRole = (role: SystemRole | null | undefined) => role === 'owner' || role === 'moderator'
const monthRange = (year: number, month: number) => ({
  fromDate: `${year}-${String(month).padStart(2, '0')}-01`,
  toDate: `${year}-${String(month).padStart(2, '0')}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`,
})
const yearRange = (year: number) => ({ fromDate: `${year}-01-01`, toDate: `${year}-12-31` })
const currentRange = () => { const now = new Date(); return monthRange(now.getFullYear(), now.getMonth() + 1) }
const displayTime = (timestamp?: string | null) => timestamp
  ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Cairo' }).format(new Date(timestamp))
  : undefined

function employeeFromRow(row: EmployeeRow): Employee {
  return { id: row.employeeCode, accountUid: row.firebaseUid, name: row.fullName, email: row.email, department: row.department ?? '', active: row.isActive, device: 'unknown' }
}

function mapAttendance(row: AttendanceRow): Attendance {
  const raw = row.status?.toLocaleLowerCase() ?? ''
  const status: Attendance['status'] = raw === 'late' ? 'late'
    : raw === 'present' ? 'present'
      : raw === 'on_leave' || raw === 'on-leave' ? 'leave'
        : raw === 'official_holiday' ? 'official-holiday'
          : raw === 'weekly_holiday' ? 'weekly-holiday' : 'absent'
  return {
    id: `${row.employeeFirebaseUid}:${row.workDate}`,
    employeeId: row.employee?.employeeCode ?? row.employeeFirebaseUid,
    employeeName: row.employee?.fullName ?? '',
    date: row.workDate,
    checkIn: displayTime(row.checkInAt),
    checkOut: displayTime(row.checkOutAt),
    status,
    gpsVerified: row.locationCheckStatus === 'INSIDE' ? true : row.locationCheckStatus === 'OUTSIDE' ? false : null,
  }
}

const vacationTypeLabels: Record<string, string> = { ANNUAL: 'سنوية', SICK: 'مرضية', EMERGENCY: 'طارئة', UNPAID: 'بدون أجر', OTHER: 'أخرى' }
function vacationTypeCode(type: string): string {
  const normalized = type.trim().toLocaleLowerCase()
  if (normalized === 'سنوية' || normalized === 'annual') return 'ANNUAL'
  if (normalized === 'مرضية' || normalized === 'sick') return 'SICK'
  if (normalized === 'طارئة' || normalized === 'emergency') return 'EMERGENCY'
  if (normalized === 'بدون أجر' || normalized === 'unpaid') return 'UNPAID'
  return 'OTHER'
}
function mapVacation(row: VacationRow): Vacation {
  const start = new Date(`${row.startDate}T00:00:00Z`)
  const end = new Date(`${row.endDate}T00:00:00Z`)
  const totalDays = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1)
  return {
    id: row.id,
    employeeId: row.employee?.employeeCode ?? row.employeeFirebaseUid ?? '',
    employeeName: row.employee?.fullName ?? '',
    type: vacationTypeLabels[row.vacationType] ?? row.vacationType,
    startDate: row.startDate,
    endDate: row.endDate,
    totalDays,
    status: row.status.toLocaleLowerCase() as Vacation['status'],
    notes: row.decisionNote || row.requestNote || '',
  }
}

const holidayCategories: Record<string, OfficialHoliday['category']> = { NATIONAL: 'national', RELIGIOUS: 'religious', GOVERNMENT: 'government', POSTPONED: 'postponed', ADMIN_SPECIAL: 'special', WEEKLY: 'weekly' }
function holidayCategoryCode(category: OfficialHoliday['category']): string {
  return ({ national: 'NATIONAL', religious: 'RELIGIOUS', government: 'GOVERNMENT', postponed: 'POSTPONED', special: 'ADMIN_SPECIAL', weekly: 'WEEKLY' })[category]
}
function mapHoliday(row: HolidayRow): OfficialHoliday {
  return {
    id: row.id, name: row.holidayName, date: row.holidayDate,
    category: holidayCategories[row.category] ?? 'special', announcementSource: row.announcementSource ?? '',
    sourceUrl: row.sourceUrl ?? '', confirmed: row.confirmationStatus === 'CONFIRMED', notes: row.notes ?? '',
  }
}

export const employeeService = {
  getEmployees: async (): Promise<ApiResult<Employee[]>> => {
    const result = await runQuery<RowCollection<EmployeeRow>, Record<string, never>>('ListEmployees', {})
    return result.error ? { data: null, error: result.error } : { data: asArray(result.data?.employees).map(employeeFromRow), error: null }
  },
  getEmployee: async (id: string): Promise<ApiResult<Employee>> => {
    const result = await employeeService.getEmployees()
    if (result.error) return { data: null, error: result.error }
    const employee = result.data?.find(item => item.id === id || item.accountUid === id)
    return employee ? { data: employee, error: null } : { data: null, error: { code: 'NOT_FOUND', message: 'لم يُعثر على الموظف المطلوب.' } }
  },
  getCurrentEmployee: async (): Promise<ApiResult<Employee | null>> => {
    const session = await authService.getCurrentUser()
    if (session.error) return { data: null, error: session.error }
    if (!session.data || session.data.role !== 'employee') return { data: null, error: { code: 'EMPLOYEE_SESSION_REQUIRED', message: 'يلزم تسجيل الدخول بحساب موظف.' } }
    const result = await runQuery<RowCollection<EmployeeRow>, Record<string, never>>('GetMyEmployeeProfile', {})
    if (result.error) return { data: null, error: result.error }
    const row = result.data?.employees?.[0]
    return { data: row ? employeeFromRow(row) : null, error: null }
  },
  createEmployee: (_employee: Omit<Employee, 'id'>) => blockedByTrustedBackend<Employee>('إنشاء حساب الموظف يحتاج خدمة خلفية موثوقة تنشئ حساب Firebase وتربط دوره قبل إنشاء الملف.'),
  updateEmployee: (_id: string, _updates: Partial<Employee>) => blockedByTrustedBackend<Employee>('تعديل ملفات الموظفين يحتاج عملية إدارية موثقة على الخادم.'),
}

async function loadAttendanceRows(filters?: { from?: string; to?: string; employeeId?: string }): Promise<ApiResult<Attendance[]>> {
  const session = await authService.getCurrentUser()
  if (session.error) return { data: null, error: session.error }
  if (!session.data) return { data: null, error: { code: 'AUTH_REQUIRED', message: 'سجّل الدخول لعرض سجلات الحضور.' } }
  const range = filters?.from && filters?.to ? { fromDate: filters.from, toDate: filters.to } : currentRange()
  if (session.data.role === 'employee') {
    const result = await runQuery<RowCollection<AttendanceRow>, Record<string, never>>('GetMyAttendance', {})
    if (result.error) return { data: null, error: result.error }
    return { data: asArray(result.data?.attendances).map(mapAttendance).filter(item => item.date >= range.fromDate && item.date <= range.toDate), error: null }
  }
  if (!managerRole(session.data.role)) return { data: null, error: { code: 'ROLE_NOT_ALLOWED', message: 'هذه البيانات متاحة للمشرفين المخولين فقط.' } }
  if (filters?.employeeId) {
    const employee = await employeeService.getEmployee(filters.employeeId)
    if (employee.error) return { data: null, error: employee.error }
    if (!employee.data?.accountUid) return { data: null, error: { code: 'EMPLOYEE_UID_MISSING', message: 'ملف الموظف غير مرتبط بحساب مصادقة.' } }
    const result = await runQuery<RowCollection<AttendanceRow>, { employeeUid: string; fromDate: string; toDate: string }>('ListAttendanceForEmployeeByRange', { employeeUid: employee.data.accountUid, ...range })
    return result.error ? { data: null, error: result.error } : { data: asArray(result.data?.attendances).map(mapAttendance), error: null }
  }
  const result = await runQuery<RowCollection<AttendanceRow>, { fromDate: string; toDate: string }>('ListAttendanceByRange', range)
  return result.error ? { data: null, error: result.error } : { data: asArray(result.data?.attendances).map(mapAttendance), error: null }
}

export const attendanceService = {
  getAttendance: loadAttendanceRows,
  /** Client-side geofence preview only; the trusted server must validate every check-in/out. */
  verifyAttendanceLocation: async (payload: { latitude: number; longitude: number }): Promise<ApiResult<GeofenceVerification>> => {
    const location = await locationService.getWorkLocation()
    if (location.error) return { data: null, error: location.error }
    if (!location.data || location.data.geofenceStatus !== 'configured') return { data: null, error: { code: 'WORK_LOCATION_NOT_CONFIGURED', message: 'لم يحدد المسؤول موقع العمل بعد.' } }
    const radians = (degrees: number) => degrees * Math.PI / 180
    const lat1 = radians(location.data.latitude); const lat2 = radians(payload.latitude)
    const latDelta = lat2 - lat1; const lngDelta = radians(payload.longitude - location.data.longitude)
    const earthRadius = 6371000
    const a = Math.sin(latDelta / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2
    const distanceMeters = earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return { data: { geofenceStatus: distanceMeters <= 600 ? 'inside' : 'outside' }, error: null }
  },
  registerCheckIn: (_payload: { latitude: number; longitude: number }) => blockedByTrustedBackend<import('../types').AttendanceActionResult>('تم تحديد الموقع من الواجهة فقط. لن يُسجل الحضور قبل إضافة عملية خلفية تتحقق من GPS ونطاق ٦٠٠ م والوقت.'),
  registerCheckOut: (_payload: { latitude: number; longitude: number }) => blockedByTrustedBackend<import('../types').AttendanceActionResult>('لن يُسجل الانصراف قبل إضافة عملية خلفية تتحقق من GPS وتكمل سجل الحضور.'),
  updateAttendance: (_id: string, _updates: Partial<Attendance>) => blockedByTrustedBackend<Attendance>('تعديل سجل الحضور يتطلب عملية خلفية موثوقة مع سجل تدقيق.'),
  getAttendanceStatistics: async (filters?: { from?: string; to?: string; employeeId?: string }): Promise<ApiResult<AttendanceStatistics>> => {
    const range = filters?.from && filters?.to ? { from: filters.from, to: filters.to } : (() => { const current = currentRange(); return { from: current.fromDate, to: current.toDate } })()
    const session = await authService.getCurrentUser()
    if (session.error) return { data: null, error: session.error }
    if (!session.data) return { data: null, error: { code: 'AUTH_REQUIRED', message: 'سجّل الدخول لعرض الإحصاءات.' } }
    const [attendance, holidays, vacations, weekly] = await Promise.all([
      loadAttendanceRows({ ...range, employeeId: filters?.employeeId }),
      holidayService.getOfficialHolidaysInRange(range.from, range.to),
      vacationService.getVacations(),
      runQuery<RowCollection<{ weekday: number }>, Record<string, never>>('ListWeeklyHolidayRules', {}),
    ])
    const firstError = attendance.error ?? holidays.error ?? vacations.error ?? weekly.error
    if (firstError) return { data: null, error: firstError }
    const weeklyDays = asArray(weekly.data?.weeklyHolidayRules).map(rule => rule.weekday % 7)
    if (weeklyDays.length === 0) return { data: null, error: { code: 'WEEKLY_RULES_NOT_CONFIGURED', message: 'لم تُضبط أيام العطلة الأسبوعية؛ لا يمكن حساب نسبة حضور دقيقة قبل ضبطها.' } }
    const records = asArray(attendance.data)
    const selectedVacations = asArray(vacations.data)
    let employeeIds: string[]
    if (session.data.role === 'employee') {
      const profile = await employeeService.getCurrentEmployee()
      if (profile.error) return { data: null, error: profile.error }
      if (!profile.data) return { data: null, error: { code: 'EMPLOYEE_PROFILE_MISSING', message: 'لا يوجد ملف موظف مرتبط بهذا الحساب.' } }
      employeeIds = [profile.data.id]
    } else if (filters?.employeeId) employeeIds = [filters.employeeId]
    else {
      const employees = await employeeService.getEmployees()
      if (employees.error) return { data: null, error: employees.error }
      employeeIds = asArray(employees.data).filter(employee => employee.active).map(employee => employee.id)
      if (employeeIds.length === 0) return { data: null, error: { code: 'NO_EMPLOYEES', message: 'أضف الموظفين وأيام العطلة الأسبوعية قبل احتساب مؤشرات الحضور.' } }
    }
    let eligibleDaysTotal = 0
    let absentDays = 0
    let approvedVacationDays = 0
    for (const employeeId of employeeIds) {
      const employeeVacations = selectedVacations.filter(item => item.employeeId === employeeId)
      const eligibleDays = getEligibleWorkingDates(range.from, range.to, {
        holidays: asArray(holidays.data).filter(item => item.confirmed && item.category !== 'weekly').map(item => ({ date: item.date })),
        weeklyOffDays: weeklyDays,
        vacations: employeeVacations.map(item => ({ startDate: item.startDate, endDate: item.endDate, status: item.status })),
      })
      const employeeRecords = records.filter(item => item.employeeId === employeeId)
      const absent = new Set(employeeRecords.filter(item => item.status === 'absent').map(item => item.date))
      eligibleDaysTotal += eligibleDays.length
      absentDays += eligibleDays.filter(date => absent.has(date)).length
      approvedVacationDays += employeeVacations.filter(item => item.status === 'approved').reduce((sum, item) => sum + item.totalDays, 0)
    }
    const completed = countCompletedAttendanceDays(records)
    const late = records.filter(item => item.status === 'late' && Boolean(item.checkIn?.trim()) && Boolean(item.checkOut?.trim())).length
    return { data: {
      presentDays: completed,
      absentDays,
      approvedVacationDays,
      lateArrivals: late,
      attendancePercentage: eligibleDaysTotal ? Math.min(100, Math.round(completed / eligibleDaysTotal * 1000) / 10) : 0,
    }, error: null }
  },
  getMonthlyAttendanceReport: async (year: number, month: number) => {
    const range = monthRange(year, month)
    const result = await loadAttendanceRows({ from: range.fromDate, to: range.toDate })
    return result.error ? { data: null, error: result.error } : { data: { year, month, generatedAt: new Date().toISOString(), attendance: result.data ?? [] }, error: null }
  },
}

async function loadVacationRows(): Promise<ApiResult<Vacation[]>> {
  const session = await authService.getCurrentUser()
  if (session.error) return { data: null, error: session.error }
  if (!session.data) return { data: null, error: { code: 'AUTH_REQUIRED', message: 'سجّل الدخول لعرض طلبات الإجازة.' } }
  const result = session.data.role === 'employee'
    ? await runQuery<RowCollection<VacationRow>, Record<string, never>>('GetMyVacations', {})
    : await runQuery<RowCollection<VacationRow>, Record<string, never>>('ListVacationRequests', {})
  return result.error ? { data: null, error: result.error } : { data: asArray(result.data?.vacations).map(mapVacation), error: null }
}

async function refetchVacation(id: string): Promise<ApiResult<Vacation>> {
  const result = await loadVacationRows()
  if (result.error) return { data: null, error: result.error }
  const item = result.data?.find(vacation => vacation.id === id)
  return item ? { data: item, error: null } : { data: null, error: { code: 'REFRESH_REQUIRED', message: 'تم إرسال التغيير، لكن تعذر تحميل السجل المحدّث.' } }
}

export const vacationService = {
  getVacations: loadVacationRows,
  createVacation: async (vacation: Omit<Vacation, 'id' | 'status'>): Promise<ApiResult<Vacation>> => {
    if (vacation.endDate < vacation.startDate) return { data: null, error: { code: 'INVALID_DATE_RANGE', message: 'تاريخ نهاية الإجازة يسبق تاريخ بدايتها.' } }
    const session = await authService.getCurrentUser()
    if (!session.data) return { data: null, error: session.error ?? { code: 'AUTH_REQUIRED', message: 'سجّل الدخول لإرسال طلب الإجازة.' } }
    if (session.data.role === 'employee') {
      const result = await runMutation<{ vacation_insert?: { id: string } }, { vacationType: string; startDate: string; endDate: string; requestNote?: string }>('CreateVacationRequest', {
        vacationType: vacationTypeCode(vacation.type), startDate: vacation.startDate, endDate: vacation.endDate, requestNote: vacation.notes,
      })
      if (result.error) return { data: null, error: result.error }
      const id = result.data?.vacation_insert?.id
      return id ? refetchVacation(id) : { data: null, error: { code: 'MISSING_MUTATION_KEY', message: 'أُرسل الطلب دون معرّف سجل لإعادة تحميله.' } }
    }
    if (!managerRole(session.data.role)) return { data: null, error: { code: 'ROLE_NOT_ALLOWED', message: 'لا يمكن لهذا الحساب إنشاء طلب إجازة.' } }
    const employee = await employeeService.getEmployee(vacation.employeeId)
    if (employee.error || !employee.data?.accountUid) return { data: null, error: employee.error ?? { code: 'EMPLOYEE_UID_MISSING', message: 'ملف الموظف غير مرتبط بحساب مصادقة.' } }
    const result = await runMutation<{ vacation_insert?: { id: string } }, { employeeUid: string; vacationType: string; startDate: string; endDate: string; requestNote?: string }>('CreateAdminVacationRequest', {
      employeeUid: employee.data.accountUid, vacationType: vacationTypeCode(vacation.type), startDate: vacation.startDate, endDate: vacation.endDate, requestNote: vacation.notes,
    })
    if (result.error) return { data: null, error: result.error }
    const id = result.data?.vacation_insert?.id
    return id ? refetchVacation(id) : { data: null, error: { code: 'MISSING_MUTATION_KEY', message: 'أُرسل الطلب دون معرّف سجل لإعادة تحميله.' } }
  },
  approveVacation: async (id: string): Promise<ApiResult<Vacation>> => {
    const result = await runMutation<{ vacation_update?: unknown }, { id: string; decisionNote?: string }>('ApproveVacation', { id })
    return result.error ? { data: null, error: result.error } : refetchVacation(id)
  },
  rejectVacation: async (id: string): Promise<ApiResult<Vacation>> => {
    const result = await runMutation<{ vacation_update?: unknown }, { id: string; decisionNote?: string }>('RejectVacation', { id })
    return result.error ? { data: null, error: result.error } : refetchVacation(id)
  },
  updateVacation: async (id: string, updates: Partial<Vacation>): Promise<ApiResult<Vacation>> => {
    if (updates.startDate && updates.endDate && updates.endDate < updates.startDate) return { data: null, error: { code: 'INVALID_DATE_RANGE', message: 'تاريخ نهاية الإجازة يسبق تاريخ بدايتها.' } }
    const current = (await loadVacationRows()).data?.find(item => item.id === id)
    if (!current) return { data: null, error: { code: 'NOT_FOUND', message: 'لم يُعثر على طلب الإجازة.' } }
    const result = await runMutation<{ vacation_update?: unknown }, { id: string; vacationType: string; startDate: string; endDate: string; requestNote?: string }>('UpdateVacationRequest', {
      id, vacationType: vacationTypeCode(updates.type ?? current.type), startDate: updates.startDate ?? current.startDate,
      endDate: updates.endDate ?? current.endDate, requestNote: updates.notes ?? current.notes,
    })
    return result.error ? { data: null, error: result.error } : refetchVacation(id)
  },
}

async function loadHolidayRange(fromDate: string, toDate: string): Promise<ApiResult<OfficialHoliday[]>> {
  const result = await runQuery<RowCollection<HolidayRow>, { fromDate: string; toDate: string }>('ListOfficialHolidaysForRange', { fromDate, toDate })
  return result.error ? { data: null, error: result.error } : { data: asArray(result.data?.officialHolidays).map(mapHoliday), error: null }
}
async function refetchHoliday(id: string): Promise<ApiResult<OfficialHoliday>> {
  const result = await runQuery<RowCollection<HolidayRow>, { id: string }>('GetOfficialHolidayById', { id })
  if (result.error) return { data: null, error: result.error }
  const row = result.data?.officialHolidays?.[0]
  return row ? { data: mapHoliday(row), error: null } : { data: null, error: { code: 'REFRESH_REQUIRED', message: 'تعذر تحميل العطلة بعد حفظها.' } }
}

export const holidayService = {
  getOfficialHolidays: (year = new Date().getFullYear()) => loadHolidayRange(yearRange(year).fromDate, yearRange(year).toDate),
  getOfficialHolidaysInRange: loadHolidayRange,
  createHoliday: async (holiday: Omit<OfficialHoliday, 'id'>): Promise<ApiResult<OfficialHoliday>> => {
    const result = await runMutation<{ officialHoliday_insert?: { id: string } }, { holidayName: string; holidayDate: string; category: string; announcementSource?: string; sourceUrl?: string; confirmationStatus: string; notes?: string }>('CreateOfficialHoliday', {
      holidayName: holiday.name, holidayDate: holiday.date, category: holidayCategoryCode(holiday.category),
      announcementSource: holiday.announcementSource, sourceUrl: holiday.sourceUrl, confirmationStatus: holiday.confirmed ? 'CONFIRMED' : 'PENDING', notes: holiday.notes,
    })
    if (result.error) return { data: null, error: result.error }
    const id = result.data?.officialHoliday_insert?.id
    return id ? refetchHoliday(id) : { data: null, error: { code: 'MISSING_MUTATION_KEY', message: 'أُرسلت العطلة دون معرّف سجل لإعادة تحميلها.' } }
  },
  updateHoliday: async (id: string, holiday: Partial<OfficialHoliday>): Promise<ApiResult<OfficialHoliday>> => {
    const existing = await refetchHoliday(id)
    if (existing.error || !existing.data) return { data: null, error: existing.error ?? { code: 'NOT_FOUND', message: 'لم يُعثر على العطلة.' } }
    const value = { ...existing.data, ...holiday }
    const result = await runMutation<{ officialHoliday_update?: unknown }, Record<string, unknown>>('UpdateOfficialHoliday', {
      id, holidayName: value.name, holidayDate: value.date, category: holidayCategoryCode(value.category),
      announcementSource: value.announcementSource, sourceUrl: value.sourceUrl, confirmationStatus: value.confirmed ? 'CONFIRMED' : 'PENDING', notes: value.notes,
    })
    return result.error ? { data: null, error: result.error } : refetchHoliday(id)
  },
  deleteHoliday: async (id: string): Promise<ApiResult<void>> => {
    const result = await runMutation<{ officialHoliday_delete?: unknown }, { id: string }>('DeleteOfficialHoliday', { id })
    return result.error ? { data: null, error: result.error } : { data: undefined, error: null }
  },
}

type WorkLocationRow = { locationName: string; latitude?: number | null; longitude?: number | null; radiusMeters: number; isActive: boolean }
export const locationService = {
  getWorkLocation: async (): Promise<ApiResult<WorkLocation | null>> => {
    const result = await runQuery<RowCollection<WorkLocationRow>, Record<string, never>>('GetActiveWorkLocation', {})
    if (result.error) return { data: null, error: result.error }
    const row = result.data?.workLocations?.[0]
    if (!row || typeof row.latitude !== 'number' || typeof row.longitude !== 'number') return { data: null, error: null }
    const configured = row.radiusMeters === 600 && row.isActive
    return { data: {
      name: row.locationName, latitude: row.latitude, longitude: row.longitude,
      radiusMeters: 600, geofenceStatus: configured ? 'configured' : 'not-configured',
    }, error: null }
  },
  updateWorkLocation: async (location: WorkLocation): Promise<ApiResult<WorkLocation>> => {
    if (location.radiusMeters !== 600 || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) {
      return { data: null, error: { code: 'INVALID_LOCATION', message: 'الإحداثيات غير صالحة ونصف القطر يجب أن يظل ٦٠٠ متر.' } }
    }
    const result = await runMutation<{ workLocation_upsert?: unknown }, { locationName: string; latitude: number; longitude: number }>('SaveWorkLocation', {
      locationName: location.name.trim(), latitude: location.latitude, longitude: location.longitude,
    })
    if (result.error) return { data: null, error: result.error }
    const savedLocation = await locationService.getWorkLocation()
    return savedLocation.data
      ? { data: savedLocation.data, error: null }
      : { data: null, error: savedLocation.error ?? { code: 'LOCATION_NOT_RETURNED', message: 'حُفظ التحديث، لكن تعذر تحميل إعداد الموقع.' } }
  },
}

export const accessService = {
  getModerators: async (): Promise<ApiResult<import('../types').ModeratorAccess[]>> => {
    const result = await runQuery<RowCollection<{ firebaseUid: string; email: string; status: string; grantedAt: string }>, Record<string, never>>('ListModeratorAccess', {})
    if (result.error) return { data: null, error: result.error }
    return { data: asArray(result.data?.moderatorAccesses).map(item => ({
      id: item.firebaseUid, email: item.email, status: item.status === 'ACTIVE' ? 'active' : item.status === 'REVOKED' ? 'revoked' : 'pending', grantedAt: item.grantedAt,
    })), error: null }
  },
  grantModeratorAccess: (_moderatorEmail: string) => blockedByTrustedBackend<import('../types').ModeratorAccess>('منح صلاحية المشرف يحتاج Cloud Function تتحقق من حساب المالك yusufgibrel3@gmail.com وتعيّن Firebase custom claims.'),
  revokeModeratorAccess: (_moderatorId: string) => blockedByTrustedBackend<void>('سحب صلاحية المشرف يحتاج Cloud Function موثوقة لتحديث custom claims وسجل التدقيق.'),
}

export const auditService = {
  getHistory: async (): Promise<ApiResult<AuditEntry[]>> => {
    const result = await runQuery<RowCollection<{
      id: string; actorUid: string; action: string; previousValue?: string | null; newValue?: string | null
      createdAt: string; targetEmployee?: { employeeCode: string; fullName: string } | null
    }>, Record<string, never>>('ListAdminLogs', {})
    if (result.error) return { data: null, error: result.error }
    return { data: asArray(result.data?.adminLogs).map(item => ({
      id: item.id,
      recordLabel: item.targetEmployee ? `${item.targetEmployee.fullName} · ${item.targetEmployee.employeeCode}` : item.action,
      changedAt: new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(item.createdAt)),
      summary: item.newValue ? `${item.action} · ${item.newValue}` : item.previousValue ? `${item.action} · ${item.previousValue}` : item.action,
    })), error: null }
  },
}

type MonthlyReportRow = { reportYear: number; reportMonth: number; storagePath?: string | null; generatedAt?: string | null }
export const monthlyReportService = {
  getSchedule: () => blockedByTrustedBackend<import('../types').MonthlyReportSchedule>('التوليد والتوزيع الشهري التلقائي يتطلبان Cloud Scheduler ووظيفة خلفية.'),
  updateSchedule: (_schedule: import('../types').MonthlyReportSchedule) => blockedByTrustedBackend<import('../types').MonthlyReportSchedule>('تغيير جدول التقارير يتطلب خدمة إدارية موثوقة.'),
  listReports: async (): Promise<ApiResult<import('../types').MonthlyReportArchiveItem[]>> => {
    const result = await runQuery<RowCollection<MonthlyReportRow>, Record<string, never>>('ListMonthlyReports', {})
    if (result.error) return { data: null, error: result.error }
    return { data: asArray(result.data?.monthlyReports).map(item => ({
      id: `${item.reportYear}-${String(item.reportMonth).padStart(2, '0')}`,
      year: item.reportYear, month: item.reportMonth, generatedAt: item.generatedAt ?? '',
      storagePath: item.storagePath ?? undefined,
      formats: item.storagePath?.toLocaleLowerCase().endsWith('.pdf') ? ['pdf'] : item.storagePath ? ['csv'] : [],
    })), error: null }
  },
  getReport: attendanceService.getMonthlyAttendanceReport,
  downloadReport: async (item: import('../types').MonthlyReportArchiveItem): Promise<ApiResult<string>> => {
    if (!item.storagePath) return { data: null, error: { code: 'REPORT_FILE_NOT_READY', message: 'لم يُرفق ملف تنزيل بهذا التقرير بعد.' } }
    if (!item.storagePath.startsWith('monthly-reports/')) return { data: null, error: { code: 'INVALID_REPORT_PATH', message: 'مسار التقرير غير صالح.' } }
    if (!firebaseApp) return { data: null, error: { code: 'FIREBASE_NOT_CONFIGURED', message: 'إعداد Firebase غير مكتمل.' } }
    try {
      const bytes = await getBytes(ref(getStorage(firebaseApp), item.storagePath))
      const contentType = item.storagePath.toLocaleLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/csv;charset=utf-8'
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: contentType }))
      return { data: objectUrl, error: null }
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'STORAGE_ERROR'
      return { data: null, error: { code, message: 'تعذر تنزيل التقرير. تحقق من صلاحية المشرف ووجود الملف في التخزين.' } }
    }
  },
}
