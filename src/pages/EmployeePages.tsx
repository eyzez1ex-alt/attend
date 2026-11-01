import { useEffect, useState } from 'react'
import { Activity, CalendarDays, Check, Clock3, Fingerprint, LogIn, LogOut, MapPin, ShieldCheck, Smartphone, TimerReset } from 'lucide-react'
import { attendanceService, authService, employeeService, vacationService } from '../services/api'
import type { Attendance, AttendanceStatistics, Employee, Vacation } from '../types'
import { Button, EmptyState, FormField, MetricCard, Modal, MonthCalendar, PageHeading, StatusBadge } from '../components/UI'

function InlineNotice({ children }: { children: React.ReactNode }) { return <div className="inline-notice"><ShieldCheck size={16} /><span>{children}</span></div> }
function DeviceCard() {
  return <div className="device-card"><div className="device-icon"><Smartphone size={19} /></div><div><strong>حالة الجهاز المسجل</strong><span>غير متاحة حتى ربط بيانات الحساب</span></div><StatusBadge status="pending">بانتظار البيانات</StatusBadge></div>
}

type LocationState = 'idle' | 'requesting' | 'permission-unavailable' | 'awaiting-server' | 'outside' | 'inside' | 'recorded'
type AttendanceActionKind = 'check-in' | 'check-out'
function AttendanceAction({ attendance, onAttendanceChange }: { attendance: Attendance | null; onAttendanceChange: (value: Attendance) => void }) {
  const [state, setState] = useState<LocationState>('idle')
  const [activeAction, setActiveAction] = useState<AttendanceActionKind | null>(null)
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null)
  const [message, setMessage] = useState('تحقق من موقعك لتمكين تسجيل الحضور أو الانصراف.')
  const hasCheckIn = Boolean(attendance?.checkIn)
  const hasCheckOut = Boolean(attendance?.checkOut)

  const checkLocation = () => {
    if (!navigator.geolocation) {
      setState('permission-unavailable')
      setMessage('الموقع غير متاح في هذا المتصفح. فعّل خدمات الموقع أو استخدم متصفحاً يدعمها.')
      return
    }
    setCoordinates(null)
    setState('requesting')
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const currentCoordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude }
        const result = await attendanceService.verifyAttendanceLocation(currentCoordinates)
        if (!result.data) {
          setState('awaiting-server')
          setMessage(result.error?.message ?? 'تم تحديد موقع الجهاز. يلزم ربط الخدمة للتحقق من النطاق.')
          return
        }
        if (result.data.geofenceStatus === 'outside') {
          setState('outside')
          setMessage('موقعك خارج نطاق العمل البالغ ٦٠٠ متر. تم تعطيل زري الحضور والانصراف.')
          return
        }
        setCoordinates(currentCoordinates)
        setState('inside')
        setMessage(hasCheckIn ? 'موقعك داخل النطاق. أصبح تسجيل الانصراف متاحاً.' : 'موقعك داخل النطاق. أصبح تسجيل الحضور متاحاً.')
      } catch {
        setState('awaiting-server')
        setMessage('تعذر التحقق من نطاق الموقع عبر الخدمة. لم يتم تمكين تسجيل الحضور أو الانصراف.')
      }
    }, () => {
      setState('permission-unavailable')
      setMessage('تعذر الوصول إلى موقعك. فعّل إذن الموقع في إعدادات المتصفح ثم أعد المحاولة.')
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 })
  }

  const register = async (action: AttendanceActionKind) => {
    if (state !== 'inside' || !coordinates) return
    if (action === 'check-in' && hasCheckIn) return
    if (action === 'check-out' && (!hasCheckIn || hasCheckOut)) return
    setActiveAction(action)
    try {
      const result = action === 'check-in'
        ? await attendanceService.registerCheckIn(coordinates)
        : await attendanceService.registerCheckOut(coordinates)
      setActiveAction(null)
      if (!result.data) {
          setState('awaiting-server')
        setMessage(result.error?.message ?? 'لم تُسجل العملية. يلزم ربط الخدمة لتسجيل الحضور والانصراف.')
        return
      }
      if (result.data.geofenceStatus === 'outside') {
        setState('outside')
        setMessage('موقعك خارج نطاق العمل البالغ ٦٠٠ متر. لن يتم تسجيل العملية.')
        return
      }
      if (!result.data.attendance || !result.data.attendance.checkIn || (action === 'check-out' && !result.data.attendance.checkOut)) {
        setState('awaiting-server')
        setMessage('لم تُعتمد العملية. يجب أن يعيد الخادم سجل الحضور بعد التحقق.')
        return
      }
      onAttendanceChange(result.data.attendance)
      setCoordinates(null)
      setState('recorded')
      setMessage(action === 'check-in' ? 'أكدت الخدمة تسجيل الحضور. أعد التحقق من الموقع قبل الانصراف.' : 'أكدت الخدمة تسجيل الانصراف واكتمال اليوم.')
    } catch {
      setActiveAction(null)
      setState('awaiting-server')
      setMessage('تعذر الاتصال بخدمة الحضور. لم يتم تسجيل العملية، ويمكن المحاولة مرة أخرى.')
    }
  }

  const isLoading = activeAction !== null || state === 'requesting'
  const permissionError = state === 'permission-unavailable'
  const blockedOutside = state === 'outside'
  const checkInEnabled = state === 'inside' && !hasCheckIn
  const checkOutEnabled = state === 'inside' && hasCheckIn && !hasCheckOut
  const locationLabel = state === 'requesting' ? 'جارٍ تحديد الموقع' : state === 'inside' ? 'تم التحقق · ٦٠٠ م' : state === 'outside' || permissionError || state === 'awaiting-server' || state === 'recorded' ? 'إعادة التحقق من الموقع' : 'تحقق من الموقع'
  return <div className="checkin-card"><div className="checkin-orbit orbit-one" /><div className="checkin-orbit orbit-two" /><div className="checkin-main">
    <span className="checkin-label"><MapPin size={15} />نطاق العمل · ٦٠٠ متر</span>
    <button className="location-check-button" type="button" disabled={isLoading} onClick={checkLocation}><MapPin size={14} />{locationLabel}</button>
    <div className="attendance-actions">
      <button className={`checkin-button ${checkInEnabled ? 'is-enabled' : ''} ${hasCheckIn || !checkInEnabled ? 'is-locked' : ''} ${permissionError ? 'is-error' : ''}`} disabled={isLoading || !checkInEnabled} onClick={() => void register('check-in')}>
        <span className="checkin-mark"><LogIn size={23} strokeWidth={1.6} /></span><strong>{isLoading && activeAction === 'check-in' ? 'جارٍ التسجيل' : hasCheckIn ? 'تم الحضور' : 'تسجيل الحضور'}</strong><small>{hasCheckIn ? attendance?.checkIn : 'بداية اليوم'}</small>
      </button>
      <button className={`checkin-button ${checkOutEnabled ? 'is-enabled' : ''} ${!checkOutEnabled ? 'is-locked' : ''} ${permissionError ? 'is-error' : ''}`} disabled={isLoading || !checkOutEnabled} onClick={() => void register('check-out')}>
        <span className="checkin-mark"><LogOut size={23} strokeWidth={1.6} /></span><strong>{isLoading && activeAction === 'check-out' ? 'جارٍ التسجيل' : hasCheckOut ? 'تم الانصراف' : 'تسجيل الانصراف'}</strong><small>{hasCheckOut ? attendance?.checkOut : hasCheckIn ? 'إنهاء يوم العمل' : 'بعد تأكيد الحضور'}</small>
      </button>
    </div>
    <div className={`gps-feedback ${permissionError || blockedOutside ? 'gps-error' : ''}`} role="status"><span className="gps-dot" />{message}</div>
  </div><div className="checkin-footer"><span><ShieldCheck size={14} />التحقق النهائي مسؤولية الخادم</span><span>{hasCheckIn && hasCheckOut ? 'اليوم مكتمل' : 'يُحتسب اليوم بعد الحضور والانصراف'}</span></div></div>
}

export function EmployeeHome() {
  const [now, setNow] = useState(new Date())
  const [todayAttendance, setTodayAttendance] = useState<Attendance | null>(null)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [notice, setNotice] = useState('')
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(timer) }, [])
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  useEffect(() => {
    let active = true
    Promise.all([employeeService.getCurrentEmployee(), attendanceService.getAttendance({ from: todayIso, to: todayIso })]).then(([profile, attendance]) => {
      if (!active) return
      if (profile.error) setNotice(profile.error.message)
      else if (profile.data) setEmployee(profile.data)
      if (attendance.error) setNotice(attendance.error.message)
      else setTodayAttendance(attendance.data?.find(record => record.date === todayIso) ?? null)
    })
    return () => { active = false }
  }, [todayIso])
  const date = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)
  const time = new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' }).format(now)
  return <>
    <div className="employee-greeting"><div><div className="eyebrow">مساحة الموظف</div><h1>{employee ? `مرحباً، ${employee.name}` : 'مرحباً بعودتك'}</h1><p>{employee ? `رقم الموظف ${employee.id} · ${employee.department || 'القسم غير محدد'}` : 'سيظهر اسمك ورقمك الوظيفي بعد ربط ملف الحساب.'}</p></div><div className="employee-date"><span>{date}</span><strong>{time}</strong></div></div>
    <div className="employee-home-grid"><div className="employee-main-column"><AttendanceAction attendance={todayAttendance} onAttendanceChange={setTodayAttendance} /><div className="employee-stats-grid"><MetricCard label="أيام الحضور" icon={Check} /><MetricCard label="أيام الغياب" icon={Activity} /><MetricCard label="التأخيرات" icon={TimerReset} /></div></div><div className="employee-side-column"><section className="panel today-panel"><div className="panel-heading"><div><h2>حالة اليوم</h2><p>ملخص تسجيل الحضور</p></div><Clock3 size={18} className="muted-icon" /></div><div className="today-status"><div className="status-glyph"><Clock3 size={20} /></div><div><strong>{todayAttendance?.checkOut ? 'اكتمل الحضور والانصراف' : todayAttendance?.checkIn ? 'تم الحضور، بانتظار الانصراف' : 'لا يوجد سجل اليوم'}</strong><span>{todayAttendance ? 'وصلت حالة اليوم من الخدمة.' : 'ستظهر حالتك بعد وصول سجل حقيقي.'}</span></div></div><div className="today-meta"><span>وقت الحضور</span><strong>{todayAttendance?.checkIn ?? '—'}</strong><span>وقت الانصراف</span><strong>{todayAttendance?.checkOut ?? '—'}</strong></div></section><section className="panel employee-identity"><div className="employee-id-mark">{employee?.name.slice(0, 1) ?? 'م'}</div><div><strong>بيانات الموظف</strong><p>الاسم: {employee?.name ?? '—'}<br />الرقم الوظيفي: {employee?.id ?? '—'}</p></div></section><DeviceCard /></div></div>
    <div className="employee-home-bottom"><section className="panel"><div className="panel-heading"><div><h2>آخر أيام الحضور</h2><p>سجل موجز من بياناتك</p></div><a className="text-link" href="/employee/history">عرض السجل</a></div>{todayAttendance ? <div className="today-meta"><span>التاريخ</span><strong>{todayAttendance.date}</strong><span>الحالة</span><strong><StatusBadge status={todayAttendance.status} /></strong></div> : <EmptyState title="سجل حضورك فارغ حالياً" description="ستظهر أيام الحضور هنا بعد وصول سجلات Firebase." icon="records" />}</section><section className="panel employee-policy"><div className="policy-icon"><ShieldCheck size={20} /></div><div><strong>خصوصية وموقع آمن</strong><p>يستخدم الموقع للتحقق من نطاق العمل. لا يُسجل الحضور من الواجهة وحدها، ويجب التحقق النهائي عبر الخادم.</p><span>النطاق المحدد: ٦٠٠ متر حول موقع العمل</span></div></section></div>
    {notice && <InlineNotice>{notice}</InlineNotice>}
  </>
}

export function EmployeeHistory() {
  const [month, setMonth] = useState(new Date())
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const [filter, setFilter] = useState('')
  const [records, setRecords] = useState<Attendance[]>([])
  const [notice, setNotice] = useState('')
  const from = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(month.getFullYear(), month.getMonth() + 1, 0)).getUTCDate()
  const to = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  useEffect(() => {
    let active = true
    attendanceService.getAttendance({ from, to }).then(result => {
      if (!active) return
      if (result.error) setNotice(result.error.message)
      else setRecords(result.data ?? [])
    })
    return () => { active = false }
  }, [from, to])
  const filtered = records.filter(record => !filter || record.status === filter)
  const marks = Object.fromEntries(records.map(record => [record.date, record.status]))
  return <><PageHeading eyebrow="سجلك الشخصي" title="سجل الحضور" description="راجع أيام حضورك وساعات تسجيلك من Firebase." actions={<label className="history-filter"><span>الحالة</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="">كل الحالات</option><option value="present">حاضر</option><option value="late">متأخر</option><option value="leave">في إجازة</option></select></label>} />{notice && <InlineNotice>{notice}</InlineNotice>}<MonthCalendar month={month} onMonthChange={setMonth} mode={mode} onModeChange={setMode} marks={marks} /><section className="panel employee-history-table"><div className="panel-heading"><div><h2>تفاصيل الأيام</h2><p>الحضور والانصراف حسب اليوم</p></div><span className="count-pill">{filtered.length}</span></div>{filtered.length ? <div className="table-scroll"><table><thead><tr><th>التاريخ</th><th>الحضور</th><th>الانصراف</th><th>الحالة</th></tr></thead><tbody>{filtered.map(record => <tr key={record.id}><td>{record.date}</td><td>{record.checkIn ?? '—'}</td><td>{record.checkOut ?? '—'}</td><td><StatusBadge status={record.status} /></td></tr>)}</tbody></table></div> : <EmptyState title="لا توجد سجلات لهذا الشهر" description="ستظهر سجلات الحضور هنا عند وصول بيانات فعلية." icon="records" />}</section></>
}

export function EmployeeStatistics() {
  const [statistics, setStatistics] = useState<AttendanceStatistics | null>(null)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    attendanceService.getAttendanceStatistics().then(result => {
      if (!active) return
      if (result.error) setNotice(result.error.message)
      else setStatistics(result.data)
    })
    return () => { active = false }
  }, [])
  return <><PageHeading eyebrow="ملخص الأداء" title="إحصائياتي" description="مؤشرات الحضور والإجازات الخاصة بي." />{notice && <InlineNotice>{notice}</InlineNotice>}<div className="metric-grid employee-metrics"><MetricCard label="إجمالي أيام الحضور" value={statistics ? String(statistics.presentDays) : undefined} empty={!statistics} icon={Check} /><MetricCard label="أيام الغياب" value={statistics ? String(statistics.absentDays) : undefined} empty={!statistics} icon={Activity} /><MetricCard label="الإجازات المعتمدة" value={statistics ? String(statistics.approvedVacationDays) : undefined} empty={!statistics} icon={CalendarDays} /><MetricCard label="مرات التأخير" value={statistics ? String(statistics.lateArrivals) : undefined} empty={!statistics} icon={Clock3} /><MetricCard label="نسبة الحضور" value={statistics ? `${statistics.attendancePercentage}%` : undefined} empty={!statistics} icon={Activity} /></div><div className="panel personal-chart"><div className="panel-heading"><div><h2>اتجاه الحضور</h2><p>نظرة شهرية على سجل الحضور</p></div><Activity size={17} className="muted-icon" /></div><EmptyState title="سيظهر الرسم بعد توفر البيانات" description="لم يتم تحميل سجل حضور لحسابك بعد." icon="records" /></div></>
}

type RequestDraft = { type: string; startDate: string; endDate: string; notes: string }
const blankRequest: RequestDraft = { type: '', startDate: '', endDate: '', notes: '' }
const daysBetween = (a: string, b: string) => a && b ? Math.max(0, Math.floor((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000) + 1) : 0
export function EmployeeVacations() {
  const [items, setItems] = useState<Vacation[]>([])
  const [dialog, setDialog] = useState(false)
  const [draft, setDraft] = useState(blankRequest)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    vacationService.getVacations().then(result => {
      if (!active) return
      if (result.error) setNotice(result.error.message)
      else setItems(result.data ?? [])
    })
    return () => { active = false }
  }, [])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const result = await vacationService.createVacation({ employeeId: '', employeeName: '', type: draft.type, startDate: draft.startDate, endDate: draft.endDate, totalDays: daysBetween(draft.startDate, draft.endDate), notes: draft.notes })
    if (result.error) { setNotice(result.error.message); return }
    if (result.data) setItems(list => [result.data!, ...list])
    setDraft(blankRequest); setDialog(false); setNotice('تم إرسال طلب الإجازة إلى Firebase.')
  }
  return <><PageHeading eyebrow="طلب إجازة" title="إجازاتي" description="أنشئ طلباً وتابع حالة المراجعة وسجل الإجازات." actions={<Button onClick={() => setDialog(true)}><CalendarDays size={16} />طلب إجازة</Button>} /><div className="vacation-policy panel"><CalendarDays size={18} /><span>لن يُعتمد الطلب حتى مراجعته من مسؤول النظام.</span></div>{notice && <InlineNotice>{notice}</InlineNotice>}{items.length === 0 ? <div className="panel empty-panel"><EmptyState title="لا توجد طلبات إجازة" description="ستظهر طلباتك وحالات الموافقة هنا." icon="records" action={<Button variant="secondary" onClick={() => setDialog(true)}>إنشاء طلب</Button>} /></div> : <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>نوع الإجازة</th><th>من</th><th>إلى</th><th>عدد الأيام</th><th>حالة الطلب</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.type}</td><td>{item.startDate}</td><td>{item.endDate}</td><td>{item.totalDays}</td><td><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div></div>}<section className="panel history-panel"><div className="panel-heading"><div><h2>سجل الإجازات</h2><p>الطلبات السابقة وقراراتها</p></div><CalendarDays size={17} className="muted-icon" /></div>{items.some(i => i.status !== 'pending') ? <EmptyState title="لا توجد قرارات بعد" description="ستظهر الطلبات المعتمدة أو المرفوضة في هذا السجل." /> : <EmptyState title="لا يوجد سجل سابق" description="لا توجد إجازات سابقة مرتبطة بحسابك." icon="records" />}</section>{dialog && <Modal title="طلب إجازة" description="سيُرسل الطلب إلى سجل الإجازات المرتبط بحسابك." onClose={() => setDialog(false)}><form className="modal-form" onSubmit={submit}><FormField label="نوع الإجازة"><select required value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}><option value="">اختر النوع</option><option>سنوية</option><option>مرضية</option><option>طارئة</option><option>أخرى</option></select></FormField><FormField label="تاريخ البداية"><input type="date" required value={draft.startDate} onChange={e => setDraft({ ...draft, startDate: e.target.value })} /></FormField><FormField label="تاريخ النهاية"><input type="date" min={draft.startDate} required value={draft.endDate} onChange={e => setDraft({ ...draft, endDate: e.target.value })} /></FormField><FormField label="ملاحظات"><textarea rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></FormField><div className="form-callout"><CalendarDays size={15} />إجمالي الأيام التقويمي: {daysBetween(draft.startDate, draft.endDate) || '—'}</div><div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setDialog(false)}>إلغاء</Button><Button type="submit">إرسال للمراجعة</Button></div></form></Modal>}</>
}

export function EmployeeProfile() {
  const [notice, setNotice] = useState('')
  const [employee, setEmployee] = useState<Employee | null>(null)
  useEffect(() => {
    let active = true
    employeeService.getCurrentEmployee().then(result => {
      if (!active) return
      if (result.error) setNotice(result.error.message)
      else setEmployee(result.data)
    })
    return () => { active = false }
  }, [])
  const logout = async () => { const result = await authService.logout(); setNotice(result.error?.message ?? 'تم إنهاء الجلسة.') }
  return <><PageHeading eyebrow="الحساب" title="الملف الشخصي والجهاز" description="معلومات الحساب والجهاز المسجل للموظف." /><div className="profile-layout"><section className="panel profile-card"><div className="profile-hero"><div className="profile-large-avatar">م</div><div><div className="eyebrow">الملف الشخصي</div><h2>{employee?.name ?? 'اسم الموظف غير متاح'}</h2><p>{employee?.email ?? 'تُحمّل بيانات الملف من خدمة الحساب.'}</p></div></div><div className="detail-list profile-details"><div><span>الاسم</span><strong>{employee?.name ?? '—'}</strong></div><div><span>الرقم الوظيفي</span><strong>{employee?.id ?? '—'}</strong></div><div><span>البريد الإلكتروني</span><strong>{employee?.email ?? '—'}</strong></div><div><span>القسم</span><strong>{employee?.department ?? '—'}</strong></div><div><span>نوع الحساب</span><strong>موظف</strong></div></div></section><div className="profile-side"><section className="panel"><div className="panel-heading"><div><h2>الجهاز</h2><p>الجهاز المرتبط بحساب الحضور</p></div><Smartphone size={18} className="muted-icon" /></div><DeviceCard /><div className="form-callout"><ShieldCheck size={15} />لا يمكن تغيير الجهاز من مساحة الموظف.</div></section><section className="panel logout-panel"><div className="logout-mark"><Fingerprint size={19} /></div><div><strong>إنهاء الجلسة</strong><p>يُنهي هذا الإجراء جلسة Firebase الحالية.</p></div><Button variant="secondary" onClick={logout}>تسجيل الخروج</Button></section></div></div>{notice && <InlineNotice>{notice}</InlineNotice>}</>
}
