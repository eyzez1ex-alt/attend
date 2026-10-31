export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave' | 'official-holiday' | 'weekly-holiday'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type SystemRole = 'owner' | 'moderator' | 'employee'

export interface Employee {
  id: string
  name: string
  email: string
  department: string
  active: boolean
  device: 'assigned' | 'unassigned'
}

export interface Admin { id: string; name: string; email: string }
export interface AuthSession { userId: string; email: string; role: SystemRole }
export interface ModeratorAccess {
  id: string
  email: string
  status: 'pending' | 'active' | 'revoked'
  grantedAt?: string
}
export interface MonthlyAttendanceReport {
  year: number
  month: number
  generatedAt: string
  attendance: Attendance[]
}
export interface MonthlyReportSchedule {
  enabled: boolean
  cadence: 'monthly'
  generationWindow: 'after-month-close'
  recipientRole: 'moderator'
  formats: Array<'pdf' | 'csv'>
}
export interface MonthlyReportArchiveItem {
  id: string
  year: number
  month: number
  generatedAt: string
  formats: Array<'pdf' | 'csv'>
}
export interface Device { id: string; status: 'assigned' | 'unassigned'; lastSeenAt?: string }
export interface Attendance {
  id: string
  employeeId: string
  employeeName: string
  date: string
  checkIn?: string
  checkOut?: string
  status: AttendanceStatus
  gpsVerified: boolean | null
}
export interface AttendanceActionResult {
  geofenceStatus: 'inside' | 'outside'
  /** Present only after the server accepts and records the requested action. */
  attendance: Attendance | null
}
export interface GeofenceVerification { geofenceStatus: 'inside' | 'outside' }
export interface Vacation {
  id: string
  employeeId: string
  employeeName: string
  type: string
  startDate: string
  endDate: string
  totalDays: number
  status: ApprovalStatus
  notes?: string
}
export interface OfficialHoliday {
  id: string
  name: string
  date: string
  category: 'national' | 'religious' | 'government' | 'postponed' | 'special' | 'weekly'
  announcementSource: string
  confirmed: boolean
  notes?: string
}
export interface WorkLocation {
  name: string
  latitude: number
  longitude: number
  radiusMeters: 600
  geofenceStatus: 'configured' | 'not-configured'
}
export interface AttendanceStatistics {
  /** Present/late days count only when both checkIn and checkOut are present. */
  presentDays: number
  absentDays: number
  approvedVacationDays: number
  lateArrivals: number
  attendancePercentage: number
}
export interface AuditEntry {
  id: string
  recordLabel: string
  changedAt: string
  summary: string
}
