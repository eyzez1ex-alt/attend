import type { Attendance, AttendanceStatus, OfficialHoliday, Vacation } from '../types'

export interface WorkingDayPolicy {
  /** ISO dates supplied by the official-holiday API or administrator. */
  holidays: Pick<OfficialHoliday, 'date'>[]
  /** JavaScript weekday numbers (Sunday = 0), supplied by organization settings. */
  weeklyOffDays: number[]
  /** Only approved requests are excluded from working-day/absence totals. */
  vacations: Pick<Vacation, 'startDate' | 'endDate' | 'status'>[]
}

/** A working day counts as attended only after check-in and check-out are both recorded. */
export function isCompletedAttendanceDay(record: Pick<Attendance, 'checkIn' | 'checkOut' | 'status'>): boolean {
  return (record.status === 'present' || record.status === 'late')
    && Boolean(record.checkIn?.trim())
    && Boolean(record.checkOut?.trim())
}

/** Counts unique employee-days and ignores incomplete sign-in/sign-out records. */
export function countCompletedAttendanceDays(
  records: Pick<Attendance, 'employeeId' | 'date' | 'checkIn' | 'checkOut' | 'status'>[],
): number {
  return new Set(records.filter(isCompletedAttendanceDay).map(record => `${record.employeeId}:${record.date}`)).size
}

const toIsoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Returns dates eligible for attendance evaluation; it invents no holiday calendar. */
export function getEligibleWorkingDates(startDate: string, endDate: string, policy: WorkingDayPolicy): string[] {
  if (!startDate || !endDate || endDate < startDate) return []
  const holidayDates = new Set(policy.holidays.map(item => item.date))
  const weeklyOffDays = new Set(policy.weeklyOffDays)
  const approvedVacations = policy.vacations.filter(item => item.status === 'approved')
  const eligible: string[] = []
  const cursor = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  while (cursor <= end) {
    const date = toIsoDate(cursor)
    const onApprovedVacation = approvedVacations.some(vacation => date >= vacation.startDate && date <= vacation.endDate)
    if (!holidayDates.has(date) && !weeklyOffDays.has(cursor.getDay()) && !onApprovedVacation) eligible.push(date)
    cursor.setDate(cursor.getDate() + 1)
  }
  return eligible
}

/** Absence totals use only eligible days; closed days and approved leave are always excluded. */
export function countEligibleAbsences(startDate: string, endDate: string, policy: WorkingDayPolicy, attendance: Pick<Attendance, 'date' | 'status'>[]): number {
  const absentDates = new Set(attendance.filter(item => item.status === 'absent' as AttendanceStatus).map(item => item.date))
  return getEligibleWorkingDates(startDate, endDate, policy).filter(date => absentDates.has(date)).length
}
