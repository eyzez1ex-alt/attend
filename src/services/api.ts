/** API contract boundary. Implementations intentionally make no network or persistence calls. */
export interface ApiError { message: string; code?: string }
export interface ApiResult<T> { data: T | null; error: ApiError | null }

const pending = <T>(): Promise<ApiResult<T>> => Promise.resolve({
  data: null,
  error: { code: 'API_NOT_CONFIGURED', message: 'واجهة الخدمة جاهزة، لكن لم يتم ربط الخادم بعد.' },
})

export const authService = {
  login: (_credentials: { email: string; accessCode: string; password: string }) => pending<never>(),
  getCurrentUser: () => pending<import('../types').AuthSession>(),
  logout: () => pending<void>(),
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
