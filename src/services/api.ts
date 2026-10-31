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
import { MODERATOR_OWNER_EMAIL } from '../constants/access'
import { firebaseAuth, firebaseConfigured } from './firebase'
import type { AuthSession, SystemRole } from '../types'

/** API contract boundary. Authentication uses Firebase; data services stay unconfigured until SQL Connect is deployed. */
export interface ApiError { message: string; code?: string }
export interface ApiResult<T> { data: T | null; error: ApiError | null }

const pending = <T>(): Promise<ApiResult<T>> => Promise.resolve({
  data: null,
  error: { code: 'SQL_CONNECT_NOT_CONFIGURED', message: 'تم إعداد Firebase Authentication. يلزم إعداد خدمة SQL Connect قبل تحميل بيانات النظام أو حفظها.' },
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

  if (!role) {
    return { data: null, error: { code: 'ROLE_NOT_CONFIGURED', message: 'تم التحقق من الحساب، لكن لم يُضف له دور نظام موثّق بعد.' } }
  }
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
    } catch (error) {
      return { data: null, error: firebaseError(error) }
    }
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
export const employeeService = {
  getEmployees: () => pending<import('../types').Employee[]>(),
  getEmployee: (_id: string) => pending<import('../types').Employee>(),
  createEmployee: (_employee: Omit<import('../types').Employee, 'id'>) => pending<import('../types').Employee>(),
  updateEmployee: (_id: string, _updates: Partial<import('../types').Employee>) => pending<import('../types').Employee>(),
}
export const attendanceService = {
  getAttendance: (_filters?: { from?: string; to?: string; employeeId?: string }) => pending<import('../types').Attendance[]>(),
  verifyAttendanceLocation: (_payload: { latitude: number; longitude: number }) => pending<import('../types').GeofenceVerification>(),
  registerCheckIn: (_payload: { latitude: number; longitude: number }) => pending<import('../types').AttendanceActionResult>(),
  registerCheckOut: (_payload: { latitude: number; longitude: number }) => pending<import('../types').AttendanceActionResult>(),
  updateAttendance: (_id: string, _updates: Partial<import('../types').Attendance>) => pending<import('../types').Attendance>(),
  getAttendanceStatistics: (_filters?: { from?: string; to?: string; employeeId?: string }) => pending<import('../types').AttendanceStatistics>(),
  getMonthlyAttendanceReport: (_year: number, _month: number) => pending<import('../types').MonthlyAttendanceReport>(),
}
export const vacationService = {
  getVacations: () => pending<import('../types').Vacation[]>(),
  createVacation: (_vacation: Omit<import('../types').Vacation, 'id' | 'status'>) => pending<import('../types').Vacation>(),
  approveVacation: (_id: string) => pending<import('../types').Vacation>(),
  rejectVacation: (_id: string) => pending<import('../types').Vacation>(),
  updateVacation: (_id: string, _updates: Partial<import('../types').Vacation>) => pending<import('../types').Vacation>(),
}
export const holidayService = {
  getOfficialHolidays: (_year?: number) => pending<import('../types').OfficialHoliday[]>(),
  createHoliday: (_holiday: Omit<import('../types').OfficialHoliday, 'id'>) => pending<import('../types').OfficialHoliday>(),
  updateHoliday: (_id: string, _updates: Partial<import('../types').OfficialHoliday>) => pending<import('../types').OfficialHoliday>(),
  deleteHoliday: (_id: string) => pending<void>(),
}
export const locationService = {
  updateWorkLocation: (_location: import('../types').WorkLocation) => pending<import('../types').WorkLocation>(),
}
export const accessService = {
  /** These methods must enforce the owner identity on the server for every mutation. */
  getModerators: () => pending<import('../types').ModeratorAccess[]>(),
  grantModeratorAccess: (_moderatorEmail: string) => pending<import('../types').ModeratorAccess>(),
  revokeModeratorAccess: (_moderatorId: string) => pending<void>(),
}
export const monthlyReportService = {
  getSchedule: () => pending<import('../types').MonthlyReportSchedule>(),
  updateSchedule: (_schedule: import('../types').MonthlyReportSchedule) => pending<import('../types').MonthlyReportSchedule>(),
  listReports: () => pending<import('../types').MonthlyReportArchiveItem[]>(),
  getReport: (_year: number, _month: number) => pending<import('../types').MonthlyAttendanceReport>(),
}
