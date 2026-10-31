import { useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Clock3, FileSearch, X } from 'lucide-react'
import type { AttendanceStatus } from '../types'

export function PageHeading({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="page-heading">
    <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="heading-actions">{actions}</div>}
  </div>
}

export function Button({ children, variant = 'primary', size = 'normal', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; size?: 'normal' | 'small' }) {
  return <button className={`button button-${variant} button-${size} ${className}`} {...props}>{children}</button>
}

export function EmptyState({ title, description, icon = 'default', action }: { title: string; description: string; icon?: 'default' | 'records'; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-illustration">{icon === 'records' ? <FileSearch size={23} strokeWidth={1.5} /> : <Clock3 size={22} strokeWidth={1.5} />}</div><strong>{title}</strong><p>{description}</p>{action}</div>
}

export function MetricCard({ label, value = '—', detail, icon: Icon, empty = true }: { label: string; value?: string; detail?: string; icon: React.ElementType; empty?: boolean }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><div className="metric-icon"><Icon size={17} strokeWidth={1.75} /></div></div><strong className={empty ? 'metric-empty' : ''}>{value}</strong><small>{detail ?? 'بانتظار البيانات'}</small></article>
}

export function StatusBadge({ status, children }: { status?: AttendanceStatus | string; children?: React.ReactNode }) {
  const labels: Record<string, string> = { present: 'حاضر', absent: 'غائب', late: 'متأخر', leave: 'في إجازة', 'official-holiday': 'عطلة رسمية', 'weekly-holiday': 'عطلة أسبوعية', pending: 'قيد المراجعة', approved: 'معتمدة', rejected: 'مرفوضة', confirmed: 'مؤكدة', unconfirmed: 'غير مؤكدة' }
  const key = status ?? 'pending'
  return <span className={`status-badge status-${key}`}>{children ?? labels[key] ?? String(key)}</span>
}

export function Modal({ title, description, onClose, children, wide = false }: { title: string; description?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className={`modal-card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-heading"><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" aria-label="إغلاق" onClick={onClose}><X size={18} /></button></div>
      {children}
    </section>
  </div>
}

export type CalendarMark = 'present' | 'absent' | 'late' | 'leave' | 'official-holiday' | 'weekly-holiday' | 'pending'
const weekdays = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']

export function MonthCalendar({ month, onMonthChange, marks = {}, mode = 'month', onModeChange }: {
  month: Date; onMonthChange: (month: Date) => void; marks?: Record<string, CalendarMark>; mode?: 'month' | 'week'; onModeChange?: (mode: 'month' | 'week') => void
}) {
  const cells = useMemo(() => {
    const year = month.getFullYear(), monthNumber = month.getMonth()
    const startOffset = (new Date(year, monthNumber, 1).getDay() + 1) % 7
    const daysInMonth = new Date(year, monthNumber + 1, 0).getDate()
    const all = Array.from({ length: 42 }, (_, i) => i - startOffset + 1)
    if (mode === 'month') return all.map(day => day > 0 && day <= daysInMonth ? new Date(year, monthNumber, day) : null)
    const focusDate = new Date(month)
    const start = (focusDate.getDay() + 1) % 7
    focusDate.setDate(focusDate.getDate() - start)
    return Array.from({ length: 7 }, (_, i) => new Date(focusDate.getFullYear(), focusDate.getMonth(), focusDate.getDate() + i))
  }, [month, mode])
  const monthLabel = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(month)
  const shift = (amount: number) => { const next = new Date(month); mode === 'month' ? next.setMonth(next.getMonth() + amount) : next.setDate(next.getDate() + amount * 7); onMonthChange(next) }

  return <section className="calendar-card">
    <div className="calendar-toolbar"><div className="calendar-month"><div className="calendar-icon"><Clock3 size={17} /></div><strong>{monthLabel}</strong></div><div className="calendar-controls">
      {onModeChange && <div className="segmented-control"><button className={mode === 'month' ? 'selected' : ''} onClick={() => onModeChange('month')}>شهري</button><button className={mode === 'week' ? 'selected' : ''} onClick={() => onModeChange('week')}>أسبوعي</button></div>}
      <button className="calendar-arrow" aria-label="الفترة السابقة" onClick={() => shift(-1)}><ChevronRight size={17} /></button><button className="calendar-arrow" aria-label="الفترة التالية" onClick={() => shift(1)}><ChevronLeft size={17} /></button>
    </div></div>
    <div className={`calendar-grid ${mode === 'week' ? 'calendar-week' : ''}`}>
      {weekdays.map(day => <div className="weekday" key={day}>{day}</div>)}
      {cells.map((date, i) => {
        if (!date) return <div className="calendar-cell outside" key={`blank-${i}`} />
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        const mark = marks[key]
        return <div key={key} className={`calendar-cell ${mark ? `marked mark-${mark}` : ''}`}><span className="calendar-day-number">{new Intl.NumberFormat('ar-EG').format(date.getDate())}</span>{mark && <span className="calendar-mark-label">{statusName[mark]}</span>}</div>
      })}
    </div>
    <div className="calendar-legend"><span><i className="legend-dot dot-present" />حضور</span><span><i className="legend-dot dot-absent" />غياب</span><span><i className="legend-dot dot-leave" />إجازة</span><span><i className="legend-dot dot-holiday" />عطلة رسمية</span><span><i className="legend-dot dot-weekly" />عطلة أسبوعية</span></div>
  </section>
}
const statusName: Record<CalendarMark, string> = { present: 'حضور', absent: 'غياب', late: 'تأخير', leave: 'إجازة', 'official-holiday': 'رسمية', 'weekly-holiday': 'أسبوعية', pending: 'قيد المراجعة' }

export function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}
