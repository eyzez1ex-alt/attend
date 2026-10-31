import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowDownToLine, ArrowUpRight, CalendarDays, CalendarRange, Check, CircleAlert, Clock3, Download, FileSpreadsheet, FileText, Filter, MapPin, Pencil, Plus, Search, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { Attendance, AttendanceStatus, AuditEntry, Employee, ModeratorAccess, MonthlyReportArchiveItem, OfficialHoliday, Vacation } from '../types'
import { Button, EmptyState, FormField, MetricCard, Modal, MonthCalendar, PageHeading, StatusBadge, type CalendarMark } from '../components/UI'
import { MODERATOR_OWNER_EMAIL, canDownloadModeratorReports, canGrantModeratorAccess } from '../constants/access'
import { accessService, monthlyReportService } from '../services/api'

const holidayLabels: Record<OfficialHoliday['category'], string> = { national: 'وطنية', religious: 'دينية', government: 'بقرار حكومي', postponed: 'مؤجلة رسمياً', special: 'مناسبة خاصة', weekly: 'أسبوعية' }
const statusChoices: { id: AttendanceStatus; label: string }[] = [
  { id: 'present', label: 'حاضر' }, { id: 'absent', label: 'غائب' }, { id: 'late', label: 'متأخر' },
  { id: 'leave', label: 'في إجازة' }, { id: 'official-holiday', label: 'عطلة رسمية' }, { id: 'weekly-holiday', label: 'عطلة أسبوعية' },
]

function InlineNotice({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return <div className="inline-notice"><CircleAlert size={17} /><span>{children}</span>{onClose && <button className="icon-button" aria-label="إخفاء" onClick={onClose}><X size={15} /></button>}</div>
}

export function AdminOverview() {
  return <>
    <PageHeading eyebrow="مساحة المشرف" title="نظرة عامة" description="تابع حالة الحضور والموظفين من مكان واحد." actions={<Button variant="secondary" onClick={() => window.location.assign('/admin/reports')}><ArrowUpRight size={16} />عرض التقارير</Button>} />
    <div className="metric-grid six-metrics">
      <MetricCard label="إجمالي الموظفين" icon={Users} /><MetricCard label="حاضرون اليوم" icon={Check} /><MetricCard label="غياب اليوم" icon={Activity} />
      <MetricCard label="في إجازة" icon={CalendarDays} /><MetricCard label="نسبة الحضور" icon={ArrowUpRight} /><MetricCard label="تأخر اليوم" icon={Clock3} />
    </div>
    <div className="overview-grid">
      <section className="panel chart-panel"><div className="panel-heading"><div><h2>نظرة الحضور</h2><p>توزيع الحضور خلال الفترة المحددة</p></div><button className="select-shell">آخر ٣٠ يوماً <Filter size={14} /></button></div><div className="chart-empty"><div className="chart-axis"><span>١٠٠٪</span><span>٧٥٪</span><span>٥٠٪</span><span>٢٥٪</span><span>٠٪</span></div><div className="chart-placeholder"><div className="chart-guides"><i /><i /><i /><i /><i /></div><div className="chart-empty-note"><Activity size={18} /><strong>لا توجد بيانات للرسم</strong><span>سيظهر المخطط عند وصول بيانات الحضور.</span></div></div></div><div className="chart-x-axis"><span>الأسبوع ١</span><span>الأسبوع ٢</span><span>الأسبوع ٣</span><span>الأسبوع ٤</span></div></section>
      <section className="panel weekly-panel"><div className="panel-heading"><div><h2>ملخص أسبوعي</h2><p>مؤشرات الحضور اليومية</p></div><Activity size={17} className="muted-icon" /></div><div className="weekly-empty"><EmptyState title="بانتظار أول سجل" description="ستظهر ملخصات الأسبوع بعد ربط مصدر البيانات." /></div></section>
    </div>
    <section className="panel monthly-panel"><div className="panel-heading"><div><h2>الحضور الشهري</h2><p>مقارنة سجلات الحضور حسب الشهر</p></div><CalendarDays size={17} className="muted-icon" /></div><div className="monthly-empty"><Activity size={18} /><strong>لا توجد بيانات شهرية</strong><span>ستظهر المقارنة بعد تحميل سجلات فعلية.</span></div></section>
    <div className="overview-grid lower-grid">
      <section className="panel"><div className="panel-heading"><div><h2>آخر النشاطات</h2><p>تحديثات الحضور والإدارة</p></div><button className="text-link" onClick={() => window.location.assign('/admin/attendance')}>كل السجلات <ArrowUpRight size={14} /></button></div><EmptyState title="لا توجد نشاطات حديثة" description="سيظهر هنا سجل النشاط عند توفر بيانات فعلية." icon="records" /></section>
      <section className="panel quick-panel"><div className="panel-heading"><div><h2>إجراءات سريعة</h2><p>ابدأ من أكثر المهام استخداماً</p></div></div><div className="quick-links">
        <a href="/admin/employees"><span><Users size={18} /></span><div><strong>إضافة موظف</strong><small>إنشاء ملف موظف جديد</small></div><ArrowUpRight size={15} /></a>
        <a href="/admin/attendance"><span><Clock3 size={18} /></span><div><strong>مراجعة الحضور</strong><small>استعراض أو تعديل السجلات</small></div><ArrowUpRight size={15} /></a>
        <a href="/admin/location"><span><MapPin size={18} /></span><div><strong>إعداد موقع العمل</strong><small>تحديد النطاق الجغرافي</small></div><ArrowUpRight size={15} /></a>
      </div></section>
    </div>
  </>
}

type EmployeeDraft = Omit<Employee, 'id'> & { id: string }
const blankEmployee: EmployeeDraft = { id: '', name: '', email: '', department: '', active: true, device: 'unassigned' }
export function EmployeesPage() {
  const navigate = useNavigate()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState('')
  const [dialog, setDialog] = useState<'add' | 'edit' | 'details' | null>(null)
  const [draft, setDraft] = useState<EmployeeDraft>(blankEmployee)
  const [notice, setNotice] = useState('')
  const filtered = employees.filter(e => `${e.name} ${e.id} ${e.email}`.toLowerCase().includes(query.toLowerCase()) && (!department || e.department === department) && (!status || (status === 'active' ? e.active : !e.active)))
  const departments = [...new Set(employees.map(e => e.department).filter(Boolean))]
  const startAdd = () => { setDraft(blankEmployee); setDialog('add') }
  const save = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.id.trim() || !draft.name.trim()) return
    const record = { ...draft }
    if (dialog === 'edit') setEmployees(list => list.map(e => e.id === record.id ? record : e))
    else setEmployees(list => [...list, record])
    setDialog(null); setNotice('تم تحديث العرض المحلي. لم يتم إرسال البيانات إلى خادم.')
  }
  const editEmployee = (employee: Employee) => { setDraft({ ...employee }); setDialog('edit') }
  return <>
    <PageHeading eyebrow="دليل الفريق" title="إدارة الموظفين" description="أنشئ ملفات الموظفين وأدر الأقسام وحالة الأجهزة." actions={<Button onClick={startAdd}><Plus size={17} />إضافة موظف</Button>} />
    <div className="toolbar panel"><div className="search-box"><Search size={17} /><input aria-label="بحث الموظفين" placeholder="ابحث بالاسم أو الرقم أو البريد" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="toolbar-filters"><select aria-label="تصفية حسب القسم" value={department} onChange={e => setDepartment(e.target.value)}><option value="">كل الأقسام</option>{departments.map(d => <option key={d}>{d}</option>)}</select><select aria-label="تصفية حسب الحالة" value={status} onChange={e => setStatus(e.target.value)}><option value="">كل الحالات</option><option value="active">نشط</option><option value="inactive">غير نشط</option></select></div><span className="result-count">{employees.length ? `${filtered.length} نتيجة` : 'لا توجد سجلات'}</span></div>
    {notice && <InlineNotice onClose={() => setNotice('')}>{notice}</InlineNotice>}
    {filtered.length === 0 ? <div className="panel empty-panel"><EmptyState title={employees.length ? 'لا توجد نتائج مطابقة' : 'لا يوجد موظفون مسجلون بعد'} description={employees.length ? 'جرّب تعديل كلمات البحث أو عوامل التصفية.' : 'أضف أول ملف موظف لبدء إدارة الفريق.'} icon="records" action={!employees.length && <Button variant="secondary" onClick={startAdd}><Plus size={16} />إضافة موظف</Button>} /></div> : <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>الموظف</th><th>الرقم الوظيفي</th><th>القسم</th><th>حالة الجهاز</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{filtered.map(employee => <tr key={employee.id}><td><button className="employee-cell" onClick={() => navigate(`/admin/employees/${encodeURIComponent(employee.id)}`, { state: { employee } })}><span className="table-avatar">{employee.name.slice(0, 1)}</span><span><strong>{employee.name}</strong><small>{employee.email || '—'}</small></span></button></td><td>{employee.id}</td><td>{employee.department || '—'}</td><td><StatusBadge status={employee.device === 'assigned' ? 'approved' : 'pending'}>{employee.device === 'assigned' ? 'مُعيّن' : 'غير مُعيّن'}</StatusBadge></td><td><StatusBadge status={employee.active ? 'approved' : 'rejected'}>{employee.active ? 'نشط' : 'غير نشط'}</StatusBadge></td><td><div className="row-actions"><button className="icon-button" title="عرض التفاصيل" onClick={() => navigate(`/admin/employees/${encodeURIComponent(employee.id)}`, { state: { employee } })}><ArrowUpRight size={16} /></button><button className="icon-button" title="تعديل" onClick={() => editEmployee(employee)}><Pencil size={15} /></button><button className="text-action" onClick={() => setEmployees(list => list.map(e => e.id === employee.id ? { ...e, active: !e.active } : e))}>{employee.active ? 'تعطيل' : 'تفعيل'}</button></div></td></tr>)}</tbody></table></div><div className="table-foot">عرض {filtered.length} من {employees.length} موظف</div></div>}
    {dialog && <Modal title={dialog === 'add' ? 'إضافة موظف' : dialog === 'edit' ? 'تعديل بيانات الموظف' : 'تفاصيل الموظف'} description="الحقول تحفظ في هذه الجلسة فقط إلى حين ربط واجهة الخدمة." onClose={() => setDialog(null)}>
      {dialog === 'details' ? <div className="detail-list"><div><span>الاسم</span><strong>{draft.name}</strong></div><div><span>الرقم الوظيفي</span><strong>{draft.id}</strong></div><div><span>البريد الإلكتروني</span><strong>{draft.email || '—'}</strong></div><div><span>القسم</span><strong>{draft.department || '—'}</strong></div><div><span>الجهاز</span><strong>{draft.device === 'assigned' ? 'مُعيّن' : 'غير مُعيّن'}</strong></div><div><span>حالة الحساب</span><strong>{draft.active ? 'نشط' : 'غير نشط'}</strong></div><Button variant="secondary" onClick={() => setDialog(null)}>إغلاق</Button></div> : <form className="modal-form" onSubmit={save}>
        <FormField label="الاسم الكامل"><input required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="اسم الموظف" /></FormField><FormField label="الرقم الوظيفي"><input required value={draft.id} disabled={dialog === 'edit'} onChange={e => setDraft({ ...draft, id: e.target.value })} placeholder="يُحدده المسؤول" /></FormField><FormField label="البريد الإلكتروني"><input type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="name@company.com" /></FormField><FormField label="القسم"><input value={draft.department} onChange={e => setDraft({ ...draft, department: e.target.value })} placeholder="اسم القسم" /></FormField><FormField label="الجهاز المسجل"><select value={draft.device} onChange={e => setDraft({ ...draft, device: e.target.value as Employee['device'] })}><option value="unassigned">غير مُعيّن</option><option value="assigned">مُعيّن</option></select></FormField><FormField label="حالة الحساب"><select value={draft.active ? 'active' : 'inactive'} onChange={e => setDraft({ ...draft, active: e.target.value === 'active' })}><option value="active">نشط</option><option value="inactive">غير نشط</option></select></FormField><div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setDialog(null)}>إلغاء</Button><Button type="submit">{dialog === 'add' ? 'إضافة الموظف' : 'حفظ التعديلات'}</Button></div>
      </form>}
    </Modal>}
  </>
}

export function EmployeeDetailsPage() {
  const { employeeId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const employee = (location.state as { employee?: Employee } | null)?.employee
  return <>
    <PageHeading eyebrow="ملف الموظف" title={employee?.name ?? 'تفاصيل الموظف'} description={employee ? `الرقم الوظيفي ${employee.id} · ${employee.department || 'القسم غير محدد'}` : `رقم الموظف: ${decodeURIComponent(employeeId)} · حمّل بيانات الملف من الخدمة عند ربطها.`} actions={<Button variant="secondary" onClick={() => navigate('/admin/employees')}><Users size={15} />العودة إلى الموظفين</Button>} />
    {employee ? <div className="profile-layout"><section className="panel profile-card"><div className="profile-hero"><div className="profile-large-avatar">{employee.name.slice(0,1)}</div><div><div className="eyebrow">بيانات الحساب</div><h2>{employee.name}</h2><p>{employee.email || 'لا يوجد بريد إلكتروني مسجل'}</p></div></div><div className="detail-list profile-details"><div><span>الرقم الوظيفي</span><strong>{employee.id}</strong></div><div><span>القسم</span><strong>{employee.department || '—'}</strong></div><div><span>حالة الحساب</span><StatusBadge status={employee.active ? 'approved' : 'rejected'}>{employee.active ? 'نشط' : 'غير نشط'}</StatusBadge></div><div><span>الجهاز المعيّن</span><StatusBadge status={employee.device === 'assigned' ? 'approved' : 'pending'}>{employee.device === 'assigned' ? 'مُعيّن' : 'غير مُعيّن'}</StatusBadge></div></div></section><section className="panel"><div className="panel-heading"><div><h2>ملخص الحضور</h2><p>إحصاءات الموظف للفترة المحددة</p></div><Clock3 size={18} className="muted-icon" /></div><div className="detail-empty"><EmptyState title="لا توجد إحصاءات حضور" description="ستظهر هنا بعد وصول سجلات الحضور." icon="records" /></div></section><section className="panel employee-history-table detail-attendance"><div className="panel-heading"><div><h2>سجل الحضور</h2><p>آخر سجلات الموظف</p></div></div><EmptyState title="لا توجد سجلات حضور" description="لا توجد بيانات مرتبطة بهذا الموظف حتى الآن." icon="records" /></section></div> : <div className="panel empty-panel"><EmptyState title="بيانات الموظف غير متاحة" description="قد تكون الصفحة فُتحت مباشرة أو لم يعد سجل الموظف في حالة الواجهة الحالية." icon="records" action={<Button variant="secondary" onClick={() => navigate('/admin/employees')}>العودة إلى الموظفين</Button>} /></div>}
  </>
}

export function AccessManagementPage() {
  const [moderators, setModerators] = useState<ModeratorAccess[]>([])
  const [draftEmail, setDraftEmail] = useState('')
  const [dialog, setDialog] = useState(false)
  const [notice, setNotice] = useState('')
  // Authentication is intentionally unimplemented; connect this to the verified API session.
  const authenticatedEmail: string | null = null
  const canManage = canGrantModeratorAccess(authenticatedEmail)
  const openInvite = () => {
    if (!canManage) { setNotice('يلزم التحقق من جلسة المالك عبر خدمة المصادقة قبل منح صلاحيات المشرف.'); return }
    setDraftEmail(''); setDialog(true)
  }
  const grantAccess = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canGrantModeratorAccess(authenticatedEmail)) { setNotice('رفضت الواجهة الإجراء: جلسة المالك غير متاحة.'); return }
    const result = await accessService.grantModeratorAccess(draftEmail.trim())
    if (result.error) setNotice(result.error.message)
    else if (result.data) { setModerators(list => [...list, result.data!]); setDialog(false); setNotice('تم تحديث قائمة المشرفين من الخدمة.') }
  }
  const revoke = async (moderator: ModeratorAccess) => {
    if (!canGrantModeratorAccess(authenticatedEmail)) { setNotice('رفضت الواجهة الإجراء: جلسة المالك غير متاحة.'); return }
    const result = await accessService.revokeModeratorAccess(moderator.id)
    if (result.error) setNotice(result.error.message)
    else setModerators(list => list.map(item => item.id === moderator.id ? { ...item, status: 'revoked' } : item))
  }
  return <>
    <PageHeading eyebrow="وصول المشرفين" title="إدارة صلاحيات المشرفين" description="أدر من يمكنه فتح مساحة المشرف. صلاحية منح الوصول محصورة بمالك النظام." actions={<Button onClick={openInvite}><UserPlus size={16} />منح وصول لمشرف</Button>} />
    {notice && <InlineNotice onClose={() => setNotice('')}>{notice}</InlineNotice>}
    <section className="panel owner-card"><div className="owner-icon"><ShieldCheck size={19} /></div><div className="owner-copy"><span>مالك النظام الوحيد</span><strong>{MODERATOR_OWNER_EMAIL}</strong><small>الحساب الوحيد المسموح له بمنح أو سحب صلاحيات المشرفين</small></div><StatusBadge status={canManage ? 'approved' : 'pending'}>{canManage ? 'تم التحقق' : 'يتطلب مصادقة'}</StatusBadge></section>
    <div className="access-layout"><section className="panel access-list"><div className="panel-heading"><div><h2>حسابات المشرفين</h2><p>الوصول الذي يمنحه مالك النظام</p></div><span className="count-pill">{moderators.filter(item => item.status === 'active').length} نشط</span></div>{moderators.length === 0 ? <EmptyState title="لا يوجد مشرفون مُضافون" description="ستظهر الحسابات بعد اعتمادها من المالك عبر خدمة الوصول." icon="records" action={<Button variant="secondary" onClick={openInvite}><UserPlus size={15} />إضافة مشرف</Button>} /> : <div className="moderator-list">{moderators.map(moderator => <div className="moderator-row" key={moderator.id}><span className="moderator-avatar"><Users size={16} /></span><div><strong>{moderator.email}</strong><small>{moderator.grantedAt ?? 'تاريخ المنح غير متاح'}</small></div><StatusBadge status={moderator.status === 'active' ? 'approved' : moderator.status === 'revoked' ? 'rejected' : 'pending'}>{moderator.status === 'active' ? 'نشط' : moderator.status === 'revoked' ? 'مُلغى' : 'قيد المراجعة'}</StatusBadge>{moderator.status === 'active' && <button className="text-action" onClick={() => void revoke(moderator)}>سحب الوصول</button>}</div>)}</div>}</section>
      <section className="panel access-policy"><div className="panel-heading"><div><h2>سياسة الوصول</h2><p>صلاحيات منفصلة للمشرف والموظف</p></div><ShieldCheck size={17} className="muted-icon" /></div><div className="policy-step"><span>١</span><div><strong>المالك يمنح صلاحية المشرف</strong><small>يُسمح بذلك فقط عند إثبات البريد أعلاه عبر المصادقة.</small></div></div><div className="policy-step"><span>٢</span><div><strong>المشرف يدير مساحة النظام</strong><small>إدارة الموظفين والحضور والإجازات والتقارير.</small></div></div><div className="policy-step"><span>٣</span><div><strong>الموظف يرى مساحته فقط</strong><small>لا يمكنه تعديل سجل الحضور أو منح صلاحيات.</small></div></div><div className="form-callout"><CircleAlert size={15} />التحقق في الواجهة ليس حماية. يجب على API التحقق من هوية المالك عند كل منح أو سحب.</div></section></div>
    {dialog && <Modal title="منح وصول لمشرف" description="أضف بريد الحساب الذي سيحصل على دور المشرف." onClose={() => setDialog(false)}><form className="modal-form" onSubmit={grantAccess}><FormField label="البريد الإلكتروني للمشرف"><input type="email" required value={draftEmail} onChange={e => setDraftEmail(e.target.value)} placeholder="moderator@company.com" /></FormField><div className="form-callout"><ShieldCheck size={15} />سيُسجل المنح عبر الخدمة المرتبطة بجلسة المالك.</div><div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setDialog(false)}>إلغاء</Button><Button type="submit">منح الصلاحية</Button></div></form></Modal>}
  </>
}

type AttendanceDraft = { employeeId: string; employeeName: string; date: string; checkIn: string; checkOut: string; status: AttendanceStatus; gps: 'verified' | 'unverified' | 'unavailable' }
const blankAttendance: AttendanceDraft = { employeeId: '', employeeName: '', date: '', checkIn: '', checkOut: '', status: 'present', gps: 'unavailable' }
export function AttendancePage() {
  const [records, setRecords] = useState<Attendance[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [date, setDate] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [view, setView] = useState<'table' | 'calendar' | 'audit'>('table')
  const [month, setMonth] = useState(new Date())
  const [editor, setEditor] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [draft, setDraft] = useState<AttendanceDraft>(blankAttendance)
  const [notice, setNotice] = useState('')
  const filtered = records.filter(r => (!date || r.date === date) && (!status || r.status === status) && `${r.employeeName} ${r.employeeId}`.toLowerCase().includes(query.toLowerCase()))
  const marks = Object.fromEntries(records.map(r => [r.date, r.status]))
  const submitDraft = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const formDate = String(new FormData(event.currentTarget).get('date') ?? ''); if (formDate) setDraft(current => ({ ...current, date: formDate })); setConfirm(true) }
  const saveDraft = () => {
    const existing = records.find(r => r.employeeId === draft.employeeId && r.date === draft.date)
    const record: Attendance = { id: existing?.id ?? crypto.randomUUID(), employeeId: draft.employeeId, employeeName: draft.employeeName, date: draft.date, checkIn: draft.checkIn || undefined, checkOut: draft.checkOut || undefined, status: draft.status, gpsVerified: draft.gps === 'verified' ? true : draft.gps === 'unverified' ? false : null }
    setRecords(list => existing ? list.map(r => r.id === existing.id ? record : r) : [...list, record])
    setAudit(list => [{ id: crypto.randomUUID(), recordLabel: `${record.employeeName} · ${record.date}`, changedAt: new Date().toLocaleString('ar-EG'), summary: existing ? 'تعديل سجل حضور محلي' : 'إضافة سجل حضور محلي' }, ...list])
    setConfirm(false); setEditor(false); setDraft(blankAttendance); setNotice('تم تحديث العرض المحلي فقط. لم يتم إرسال أي تعديل إلى الخادم.')
  }
  const editRow = (record: Attendance) => { setDraft({ employeeId: record.employeeId, employeeName: record.employeeName, date: record.date, checkIn: record.checkIn ?? '', checkOut: record.checkOut ?? '', status: record.status, gps: record.gpsVerified === null ? 'unavailable' : record.gpsVerified ? 'verified' : 'unverified' }); setEditor(true) }
  const exportPending = () => setNotice('سيُتاح تصدير التقرير بعد ربط خدمة التقارير.')
  return <>
    <PageHeading eyebrow="السجلات اليومية" title="إدارة الحضور" description="راجع الحضور اليومي، عدّل السجلات، وتابع سجل التغييرات." actions={<><Button variant="secondary" onClick={exportPending}><Download size={16} />تصدير التقرير</Button><Button onClick={() => { setDraft(blankAttendance); setEditor(true) }}><Plus size={16} />سجل / تعديل</Button></>} />
    <div className="filter-panel panel"><div className="search-box"><Search size={16} /><input aria-label="بحث الموظف" placeholder="اسم الموظف أو رقمه" value={query} onChange={e => setQuery(e.target.value)} /></div><label className="compact-filter"><span>التاريخ</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label className="compact-filter"><span>الحالة</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="">كل الحالات</option>{statusChoices.map(s => <option value={s.id} key={s.id}>{s.label}</option>)}</select></label><div className="view-tabs"><button className={view === 'table' ? 'selected' : ''} onClick={() => setView('table')}>يومي</button><button className={view === 'calendar' ? 'selected' : ''} onClick={() => setView('calendar')}>التقويم</button><button className={view === 'audit' ? 'selected' : ''} onClick={() => setView('audit')}>سجل التعديلات</button></div></div>
    {notice && <InlineNotice onClose={() => setNotice('')}>{notice}</InlineNotice>}
    {view === 'table' && (filtered.length ? <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>الموظف</th><th>التاريخ</th><th>الحضور</th><th>الانصراف</th><th>الحالة</th><th>تحقق GPS</th><th></th></tr></thead><tbody>{filtered.map(r => <tr key={r.id}><td><strong>{r.employeeName}</strong><small className="table-subline">{r.employeeId}</small></td><td>{r.date}</td><td>{r.checkIn ?? '—'}</td><td>{r.checkOut ?? '—'}</td><td><StatusBadge status={r.status} /></td><td><StatusBadge status={r.gpsVerified === true ? 'approved' : r.gpsVerified === false ? 'rejected' : 'pending'}>{r.gpsVerified === true ? 'تم التحقق' : r.gpsVerified === false ? 'لم يتم التحقق' : 'غير متاح'}</StatusBadge></td><td><button className="icon-button" title="تعديل السجل" onClick={() => editRow(r)}><Pencil size={15} /></button></td></tr>)}</tbody></table></div><div className="table-foot">{filtered.length} سجل</div></div> : <div className="panel empty-panel"><EmptyState title="لا توجد سجلات حضور" description="ستظهر سجلات اليوم هنا بعد وصول البيانات أو إضافتها من خلال النموذج." icon="records" action={<Button variant="secondary" onClick={() => { setDraft(blankAttendance); setEditor(true) }}><Plus size={16} />فتح محرر السجل</Button>} /></div>)}
    {view === 'calendar' && <MonthCalendar month={month} onMonthChange={setMonth} marks={marks} />}
    {view === 'audit' && (audit.length ? <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>السجل</th><th>التعديل</th><th>وقت التعديل</th><th>الجهة</th></tr></thead><tbody>{audit.map(a => <tr key={a.id}><td>{a.recordLabel}</td><td>{a.summary}</td><td>{a.changedAt}</td><td>المشرف الحالي</td></tr>)}</tbody></table></div></div> : <div className="panel empty-panel"><EmptyState title="سجل التعديلات فارغ" description="ستُعرض هنا تعديلات المشرفين مع وقت التغيير وملخصه." icon="records" /></div>)}
    {editor && <Modal title="محرر سجل الحضور" description="أدخل بيانات السجل. سيُطلب تأكيد قبل تحديث العرض المحلي." onClose={() => setEditor(false)}>
      <form className="modal-form" onSubmit={submitDraft}><FormField label="اسم الموظف"><input required value={draft.employeeName} onChange={e => setDraft({ ...draft, employeeName: e.target.value })} placeholder="يُملأ من سجل الموظف" /></FormField><FormField label="الرقم الوظيفي"><input required value={draft.employeeId} onChange={e => setDraft({ ...draft, employeeId: e.target.value })} placeholder="رقم الموظف" /></FormField><FormField label="التاريخ"><input required name="date" type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></FormField><FormField label="وقت الحضور"><input type="time" value={draft.checkIn} onChange={e => setDraft({ ...draft, checkIn: e.target.value })} /></FormField><FormField label="وقت الانصراف"><input type="time" value={draft.checkOut} onChange={e => setDraft({ ...draft, checkOut: e.target.value })} /></FormField><FormField label="الحالة"><select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as AttendanceStatus })}>{statusChoices.map(s => <option value={s.id} key={s.id}>{s.label}</option>)}</select></FormField><FormField label="حالة التحقق الجغرافي"><select value={draft.gps} onChange={e => setDraft({ ...draft, gps: e.target.value as AttendanceDraft['gps'] })}><option value="unavailable">غير متاح</option><option value="verified">تم التحقق (واجهة)</option><option value="unverified">لم يتم التحقق</option></select></FormField><div className="form-callout"><ShieldCheck size={16} />مؤشر GPS للعرض فقط، ولا يمثل تحققاً أمنياً فعلياً.</div><div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setEditor(false)}>إلغاء</Button><Button type="submit">متابعة</Button></div></form>
    </Modal>}
    {confirm && <Modal title="تأكيد تعديل السجل" description="هل تريد تطبيق التغيير على بيانات المعاينة الحالية؟" onClose={() => setConfirm(false)}><div className="confirm-summary"><span>الموظف</span><strong>{draft.employeeName} · {draft.employeeId}</strong><span>التاريخ والحالة</span><strong>{draft.date || '—'} · {statusChoices.find(s => s.id === draft.status)?.label}</strong></div><div className="form-callout"><CircleAlert size={16} />سيتم تحديث الواجهة لهذه الجلسة فقط. لا يوجد تحديث قاعدة بيانات.</div><div className="modal-actions"><Button variant="secondary" onClick={() => setConfirm(false)}>العودة للتعديل</Button><Button onClick={saveDraft}>تأكيد الحفظ</Button></div></Modal>}
  </>
}

function MapCanvas({ latitude, longitude, onSelect }: { latitude: number; longitude: number; onSelect: (lat: number, lng: number) => void }) {
  const elementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.CircleMarker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const callbackRef = useRef(onSelect)
  callbackRef.current = onSelect
  useEffect(() => {
    if (!elementRef.current) return
    const map = L.map(elementRef.current, { zoomControl: false }).setView([latitude, longitude], 16)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map)
    L.control.zoom({ position: 'bottomleft' }).addTo(map)
    markerRef.current = L.circleMarker([latitude, longitude], { radius: 6, color: '#090909', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(map)
    circleRef.current = L.circle([latitude, longitude], { radius: 600, color: '#090909', weight: 1.5, fillColor: '#111', fillOpacity: 0.11 }).addTo(map)
    map.on('click', (event: L.LeafletMouseEvent) => callbackRef.current(event.latlng.lat, event.latlng.lng))
    mapRef.current = map
    return () => { map.off(); map.remove(); mapRef.current = null; markerRef.current = null; circleRef.current = null }
  }, [])
  useEffect(() => {
    const center = L.latLng(latitude, longitude)
    markerRef.current?.setLatLng(center)
    circleRef.current?.setLatLng(center)
    circleRef.current?.setRadius(600)
    mapRef.current?.panTo(center)
  }, [latitude, longitude])
  return <div className="leaflet-map" ref={elementRef} aria-label="خريطة اختيار موقع العمل" />
}

export function LocationPage() {
  const [name, setName] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [notice, setNotice] = useState('')
  const lat = Number(latitude), lng = Number(longitude)
  const valid = latitude !== '' && longitude !== '' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  const save = () => { if (!valid || !name.trim()) return; setNotice('تم حفظ الموقع في حالة المعاينة فقط. سيُربط التحديث بالخادم لاحقاً.') }
  return <>
    <PageHeading eyebrow="إعدادات الموقع" title="الموقع والنطاق الجغرافي" description="حدد موقع المنشأة واعرض النطاق المسموح به لتسجيل الحضور." actions={<Button onClick={save}><Check size={16} />حفظ إعداد الموقع</Button>} />
    {notice && <InlineNotice onClose={() => setNotice('')}>{notice}</InlineNotice>}
    <div className="location-layout">
      <section className="panel map-panel"><div className="panel-heading"><div><h2>تحديد الموقع على الخريطة</h2><p>أدخل إحداثيات تقريبية أولاً، ثم اختر المركز بالنقر على الخريطة.</p></div><span className="map-provider-tag"><MapPin size={14} /> OpenStreetMap</span></div>
        <div className="map-wrap">{valid ? <MapCanvas key="configured-map" latitude={lat} longitude={lng} onSelect={(a, b) => { setLatitude(a.toFixed(6)); setLongitude(b.toFixed(6)) }} /> : <div className="map-empty"><div className="map-empty-grid" /><div className="map-empty-copy"><div className="empty-illustration"><MapPin size={21} /></div><strong>ابدأ بتحديد مركز الموقع</strong><span>أدخل خط العرض والطول لتفعيل الخريطة التفاعلية.</span></div></div>}<div className="map-radius-tag"><span className="radius-ring" />دائرة النطاق · ٦٠٠ م</div></div>
        <div className="map-caption"><span>انقر على الخريطة لاختيار مركز مكان العمل.</span><span>الخريطة لعرض الموقع فقط</span></div>
      </section>
      <div className="location-side">
        <section className="panel location-form-panel"><div className="panel-heading"><div><h2>بيانات موقع العمل</h2><p>الموقع المحدد الذي تعتمد عليه تجربة الحضور.</p></div><div className={`geofence-indicator ${valid ? 'configured' : ''}`}><span />{valid ? 'مُعدّ' : 'غير مُعدّ'}</div></div>
          <div className="location-form"><FormField label="اسم الموقع"><input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: المقر الرئيسي" /></FormField><div className="coordinate-grid"><FormField label="خط العرض"><input inputMode="decimal" value={latitude} onChange={e => setLatitude(e.target.value)} placeholder="—" /></FormField><FormField label="خط الطول"><input inputMode="decimal" value={longitude} onChange={e => setLongitude(e.target.value)} placeholder="—" /></FormField></div><FormField label="نصف قطر الحضور" hint="النطاق ثابت على ٦٠٠ متر حسب سياسة النظام."><div className="radius-input"><input value="600" readOnly aria-readonly="true" /><span>متر</span><ShieldCheck size={15} /></div></FormField><div className="area-info"><div><span>المساحة التقريبية</span><strong>١٬١٣٠٬٩٧٣ م²</strong></div><div className="area-symbol"><div /></div></div></div>
        </section>
        <section className="panel geofence-panel"><div className="geofence-title"><div className="geofence-icon"><ShieldCheck size={18} /></div><div><h2>حالة النطاق الجغرافي</h2><p>{valid ? 'تم إدخال مركز الموقع. التحقق الأمني يتطلب الخادم.' : 'أدخل بيانات الموقع لتجهيز معاينة النطاق.'}</p></div></div><div className="geofence-meta"><div><span>المركز</span><strong>{valid ? `${lat.toFixed(6)}، ${lng.toFixed(6)}` : 'غير محدد'}</strong></div><div><span>نصف القطر</span><strong>٦٠٠ م</strong></div></div><div className="form-callout"><CircleAlert size={15} />تحقق GPS من الواجهة لا يوفر حماية فعلية. التحقق النهائي مسؤولية الخادم.</div></section>
      </div>
    </div>
    <section className="panel location-preview"><div className="panel-heading"><div><h2>معاينة زر تسجيل الحضور</h2><p>هذه الحالات تصف استجابة الواجهة فقط؛ لا يتم تسجيل حضور فعلي.</p></div></div><div className="attendance-states"><div className="attendance-state state-enabled"><span className="state-index">١</span><div><strong>داخل النطاق المسموح</strong><small>يصبح الزر مفعلاً بعد التحقق من الخادم.</small></div><button className="checkin-demo enabled" onClick={() => setNotice('معاينة الحالة داخل النطاق فقط؛ لم يتم تسجيل حضور.')}>تسجيل الحضور</button></div><div className="attendance-state state-disabled"><span className="state-index">٢</span><div><strong>خارج النطاق</strong><small>يبقى الزر معطلاً وتظهر رسالة الموقع.</small></div><button className="checkin-demo" disabled>خارج النطاق</button></div><div className="attendance-state state-error"><span className="state-index">٣</span><div><strong>إذن الموقع غير متاح</strong><small>تظهر تعليمات تفعيل إذن الموقع.</small></div><button className="checkin-demo error" disabled><MapPin size={14} />الموقع غير متاح</button></div></div></section>
  </>
}

type VacationDraft = { employeeName: string; employeeId: string; type: string; startDate: string; endDate: string; notes: string }
const blankVacation: VacationDraft = { employeeName: '', employeeId: '', type: '', startDate: '', endDate: '', notes: '' }
const vacationDays = (start: string, end: string) => start && end ? Math.max(0, Math.floor((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000) + 1) : 0
export function VacationsPage() {
  const [items, setItems] = useState<Vacation[]>([])
  const [dialog, setDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState(blankVacation)
  const [filter, setFilter] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState<Vacation | null>(null)
  const filtered = items.filter(i => !filter || i.status === filter)
  const openNew = () => { setEditingId(null); setDraft(blankVacation); setDialog(true) }
  const openEdit = (item: Vacation) => { setEditingId(item.id); setDraft({ employeeName: item.employeeName, employeeId: item.employeeId, type: item.type, startDate: item.startDate, endDate: item.endDate, notes: item.notes ?? '' }); setDialog(true) }
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (draft.endDate < draft.startDate) return; const item: Vacation = { ...draft, id: editingId ?? crypto.randomUUID(), totalDays: vacationDays(draft.startDate, draft.endDate), status: editingId ? items.find(i => i.id === editingId)?.status ?? 'pending' : 'pending' }; setItems(list => editingId ? list.map(i => i.id === editingId ? item : i) : [item, ...list]); setDraft(blankVacation); setDialog(false); setNotice(editingId ? 'تم تعديل الطلب في المعاينة المحلية فقط.' : 'أُضيف طلب الإجازة إلى بيانات المعاينة المحلية فقط.') }
  const decide = (item: Vacation, approved: boolean) => { setItems(list => list.map(v => v.id === item.id ? { ...v, status: approved ? 'approved' : 'rejected' } : v)); setConfirm(null); setNotice(`تم تحديث حالة الطلب محلياً إلى ${approved ? 'معتمد' : 'مرفوض'}.`) }
  return <>
    <PageHeading eyebrow="الغياب المخطط" title="إدارة الإجازات" description="راجع الطلبات، وأدر الموافقات وسجل الإجازات." actions={<Button onClick={openNew}><Plus size={16} />إنشاء طلب إجازة</Button>} />
    <div className="vacation-policy panel"><CalendarDays size={18} /><span>الطلبات المعتمدة لا تُحتسب غياباً. أيام الإجازات تُعرض كما أدخلها المسؤول.</span><span className="policy-separator" /><span>{items.length} طلب في هذه الجلسة</span></div>
    <div className="toolbar panel"><div className="filter-title"><Filter size={16} /><strong>تصفية الطلبات</strong></div><div className="toolbar-filters"><select aria-label="حالة الموافقة" value={filter} onChange={e => setFilter(e.target.value)}><option value="">كل الحالات</option><option value="pending">قيد المراجعة</option><option value="approved">معتمدة</option><option value="rejected">مرفوضة</option></select></div><div className="toolbar-spacer" /></div>
    {notice && <InlineNotice onClose={() => setNotice('')}>{notice}</InlineNotice>}
    {filtered.length === 0 ? <div className="panel empty-panel"><EmptyState title="لا توجد طلبات إجازة" description="طلبات الإجازة ستظهر هنا بعد إدخالها من مسؤول أو وصولها من الموظفين." icon="records" action={<Button variant="secondary" onClick={openNew}><Plus size={16} />إضافة طلب</Button>} /></div> : <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>الموظف</th><th>نوع الإجازة</th><th>من</th><th>إلى</th><th>إجمالي الأيام</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id}><td><strong>{item.employeeName}</strong><small className="table-subline">{item.employeeId}</small></td><td>{item.type}</td><td>{item.startDate}</td><td>{item.endDate}</td><td>{item.totalDays}</td><td><StatusBadge status={item.status} /></td><td><div className="row-actions"><button className="icon-button" title="تعديل الطلب" onClick={() => openEdit(item)}><Pencil size={15} /></button>{item.status === 'pending' && <><button className="text-action" onClick={() => setConfirm(item)}>مراجعة</button><button className="icon-button" title="حذف الطلب من العرض" onClick={() => setItems(list => list.filter(v => v.id !== item.id))}><Trash2 size={15} /></button></>}</div></td></tr>)}</tbody></table></div></div>}
    <section className="panel history-panel"><div className="panel-heading"><div><h2>سجل الإجازات</h2><p>طلبات معتمدة ومرفوضة في نطاق المعاينة</p></div><CalendarRange size={18} className="muted-icon" /></div>{items.some(i => i.status !== 'pending') ? <div className="history-strip">{items.filter(i => i.status !== 'pending').map(i => <div key={i.id}><StatusBadge status={i.status} /><strong>{i.employeeName}</strong><span>{i.type} · {i.startDate} — {i.endDate}</span></div>)}</div> : <EmptyState title="لا يوجد سجل سابق" description="ستظهر القرارات السابقة هنا بعد مراجعة الطلبات." icon="records" />}</section>
    {dialog && <Modal title={editingId ? 'تعديل طلب الإجازة' : 'إنشاء طلب إجازة'} description="أدخل التفاصيل كما وردت من الموظف." onClose={() => setDialog(false)}><form className="modal-form" onSubmit={submit}><FormField label="اسم الموظف"><input required value={draft.employeeName} onChange={e => setDraft({ ...draft, employeeName: e.target.value })} /></FormField><FormField label="الرقم الوظيفي"><input required value={draft.employeeId} onChange={e => setDraft({ ...draft, employeeId: e.target.value })} /></FormField><FormField label="نوع الإجازة"><input required value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })} placeholder="سنوية، مرضية، ..." /></FormField><FormField label="تاريخ البداية"><input required type="date" value={draft.startDate} onChange={e => setDraft({ ...draft, startDate: e.target.value })} /></FormField><FormField label="تاريخ النهاية"><input required type="date" min={draft.startDate} value={draft.endDate} onChange={e => setDraft({ ...draft, endDate: e.target.value })} /></FormField><FormField label="ملاحظات"><textarea rows={2} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></FormField><div className="form-callout"><CalendarDays size={15} />إجمالي الأيام التقويمي: {vacationDays(draft.startDate, draft.endDate) || '—'}</div><div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setDialog(false)}>إلغاء</Button><Button type="submit">{editingId ? 'حفظ التعديلات' : 'إضافة الطلب'}</Button></div></form></Modal>}
    {confirm && <Modal title="مراجعة طلب الإجازة" description={`${confirm.employeeName} · ${confirm.type} · ${confirm.totalDays} يوم`} onClose={() => setConfirm(null)}><p className="confirmation-copy">اختر قرارك. سيُطبق على قائمة المعاينة الحالية فقط.</p><div className="modal-actions"><Button variant="secondary" onClick={() => decide(confirm, false)}>رفض الطلب</Button><Button onClick={() => decide(confirm, true)}><Check size={15} />اعتماد الطلب</Button></div></Modal>}
  </>
}

type HolidayDraft = Omit<OfficialHoliday, 'id'>
const blankHoliday: HolidayDraft = { name: '', date: '', category: 'national', announcementSource: '', confirmed: false, notes: '' }
export function HolidaysPage() {
  const [items, setItems] = useState<OfficialHoliday[]>([])
  const [dialog, setDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<HolidayDraft>(blankHoliday)
  const [month, setMonth] = useState(new Date())
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<OfficialHoliday | null>(null)
  const list = items.filter(i => (!query || i.name.toLowerCase().includes(query.toLowerCase())) && new Date(`${i.date}T00:00:00`).getFullYear() === month.getFullYear())
  const marks: Record<string, CalendarMark> = {}
  items.forEach(item => { marks[item.date] = item.category === 'weekly' ? 'weekly-holiday' : 'official-holiday' })
  const openNew = () => { setEditingId(null); setDraft(blankHoliday); setDialog(true) }
  const openEdit = (item: OfficialHoliday) => { setEditingId(item.id); setDraft({ name: item.name, date: item.date, category: item.category, announcementSource: item.announcementSource, confirmed: item.confirmed, notes: item.notes ?? '' }); setDialog(true) }
  const save = (event: React.FormEvent) => { event.preventDefault(); const item: OfficialHoliday = { ...draft, id: editingId ?? crypto.randomUUID() }; setItems(list => editingId ? list.map(i => i.id === editingId ? item : i) : [...list, item]); setDialog(false); setNotice('تم تحديث قائمة العطلات في هذه الجلسة فقط. لا توجد تواريخ مسبقة.') }
  const toggleConfirmed = (item: OfficialHoliday) => setItems(list => list.map(h => h.id === item.id ? { ...h, confirmed: !h.confirmed } : h))
  return <>
    <PageHeading eyebrow="مصر · تواريخ حسب المصادر" title="العطلات الرسمية" description="أدر العطلات المُعلنة والمناسبات، مع مصدر الإعلان وحالة التأكيد." actions={<Button onClick={openNew}><Plus size={16} />إضافة عطلة</Button>} />
    <div className="holiday-policy panel"><ShieldCheck size={18} /><p>لا تتضمن هذه الواجهة تواريخ افتراضية. أضف العطلات بعد ورودها من مصدر رسمي أو من خدمة مستقبلية.</p><span className="policy-tag">بيانات رسمية فقط</span></div>
    {notice && <InlineNotice onClose={() => setNotice('')}>{notice}</InlineNotice>}
    <div className="holiday-layout"><MonthCalendar month={month} onMonthChange={setMonth} marks={marks} /><section className="panel holiday-list"><div className="panel-heading"><div><h2>قائمة الشهر</h2><p>{new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(month)}</p></div><span className="count-pill">{list.length}</span></div><div className="search-box holiday-search"><Search size={15} /><input placeholder="ابحث عن عطلة" value={query} onChange={e => setQuery(e.target.value)} /></div>{list.length === 0 ? <EmptyState title="لا توجد عطلات مُضافة" description="لن تظهر تواريخ حتى تدخلها الإدارة أو الخدمة الرسمية." icon="records" /> : <div className="holiday-items">{list.map(item => <article key={item.id} className="holiday-item"><div className="holiday-date"><strong>{new Intl.DateTimeFormat('ar-EG', { day: 'numeric' }).format(new Date(`${item.date}T00:00:00`))}</strong><span>{new Intl.DateTimeFormat('ar-EG', { month: 'short' }).format(new Date(`${item.date}T00:00:00`))}</span></div><div className="holiday-copy"><strong>{item.name}</strong><span>{holidayLabels[item.category]} · {item.announcementSource || 'المصدر غير محدد'}</span><StatusBadge status={item.confirmed ? 'confirmed' : 'unconfirmed'} /></div><div className="holiday-actions"><button className="icon-button" title={item.confirmed ? 'إلغاء التأكيد' : 'تأكيد رسمي'} onClick={() => toggleConfirmed(item)}>{item.confirmed ? <Check size={15} /> : <ShieldCheck size={15} />}</button><button className="icon-button" title="تعديل" onClick={() => openEdit(item)}><Pencil size={15} /></button><button className="icon-button" title="حذف" onClick={() => setDeleteTarget(item)}><Trash2 size={15} /></button></div></article>)}</div>}</section></div>
    <section className="panel holiday-rules"><div className="panel-heading"><div><h2>قواعد احتساب الغياب</h2><p>تُطبق هذه الاستثناءات عند احتساب أيام العمل المؤهلة.</p></div><CalendarDays size={17} className="muted-icon" /></div><div className="rule-grid"><div><span className="rule-symbol">١</span><strong>العطلات الرسمية</strong><small>لا تُحتسب كغياب</small></div><div><span className="rule-symbol">٢</span><strong>العطلات الأسبوعية</strong><small>لا تُحتسب كغياب</small></div><div><span className="rule-symbol">٣</span><strong>الإجازة المعتمدة</strong><small>لا تُحتسب كغياب</small></div><div><span className="rule-symbol">٤</span><strong>أيام العمل المؤهلة</strong><small>فقط تدخل في النسبة</small></div></div></section>
    {dialog && <Modal title={editingId ? 'تعديل العطلة' : 'إضافة عطلة'} description="أدخل التفاصيل كما وردت في الإعلان الرسمي أو قرار الإدارة." onClose={() => setDialog(false)}><form className="modal-form" onSubmit={save}><FormField label="اسم العطلة"><input required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></FormField><FormField label="التاريخ"><input type="date" required value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></FormField><FormField label="فئة العطلة"><select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value as OfficialHoliday['category'] })}>{Object.entries(holidayLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></FormField><FormField label="مصدر الإعلان الرسمي"><input value={draft.announcementSource} onChange={e => setDraft({ ...draft, announcementSource: e.target.value })} placeholder="رابط أو اسم الجهة المُعلنة" /></FormField><label className="check-row"><input type="checkbox" checked={draft.confirmed} onChange={e => setDraft({ ...draft, confirmed: e.target.checked })} /><span>تم التأكيد رسمياً</span></label><FormField label="ملاحظات"><textarea rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></FormField><div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setDialog(false)}>إلغاء</Button><Button type="submit">{editingId ? 'حفظ التعديل' : 'إضافة العطلة'}</Button></div></form></Modal>}
    {deleteTarget && <Modal title="حذف العطلة؟" description={deleteTarget.name} onClose={() => setDeleteTarget(null)}><p className="confirmation-copy">سيُحذف هذا العنصر من قائمة المعاينة المحلية.</p><div className="modal-actions"><Button variant="secondary" onClick={() => setDeleteTarget(null)}>إلغاء</Button><Button variant="danger" onClick={() => { setItems(list => list.filter(h => h.id !== deleteTarget.id)); setDeleteTarget(null) }}><Trash2 size={15} />حذف</Button></div></Modal>}
  </>
}

function downloadAttendanceCsv(records: Attendance[], month: string) {
  const headers = ['تاريخ الحضور', 'اسم الموظف', 'الرقم الوظيفي', 'الحالة', 'وقت الحضور', 'وقت الانصراف']
  const rows = records.map(record => [record.date, record.employeeName, record.employeeId, statusChoices.find(item => item.id === record.status)?.label ?? record.status, record.checkIn ?? '', record.checkOut ?? ''])
  const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`
  const content = `\uFEFF${[headers, ...rows].map(row => row.map(escapeCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = `attendance-${month}.csv`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ReportsPage() {
  const [reportType, setReportType] = useState('monthly')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [employee, setEmployee] = useState('')
  const [notice, setNotice] = useState('')
  const [monthlyMonth, setMonthlyMonth] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` })
  const [monthlyRows, setMonthlyRows] = useState<Attendance[]>([])
  const [monthlyArchive, setMonthlyArchive] = useState<MonthlyReportArchiveItem[]>([])
  const [monthlyLoaded, setMonthlyLoaded] = useState(false)
  const [monthlyLoading, setMonthlyLoading] = useState(false)
  // Replace with the verified role from the future authentication service.
  const authenticatedRole: import('../types').SystemRole | null = null
  const canDownloadMonthly = canDownloadModeratorReports(authenticatedRole)
  const reportNames: Record<string, string> = { monthly: 'تقرير الحضور الشهري', summaries: 'ملخصات الموظفين', absences: 'تقرير الغياب', vacations: 'تقرير الإجازات', late: 'تقرير التأخيرات' }
  const exportReport = (format: string) => setNotice(`تصدير ${format} جاهز للربط. لا توجد بيانات لتصديرها حالياً.`)
  useEffect(() => {
    let active = true
    if (canDownloadMonthly) monthlyReportService.listReports().then(result => { if (active && !result.error) setMonthlyArchive(result.data ?? []) })
    return () => { active = false }
  }, [canDownloadMonthly])
  const loadMonthlyReport = async () => {
    if (!canDownloadMonthly) { setNotice('تسجيل الدخول بحساب مشرف موثّق مطلوب لعرض التقرير الشهري.'); return }
    const [year, month] = monthlyMonth.split('-').map(Number)
    if (!year || !month) return
    setMonthlyLoading(true); setMonthlyLoaded(false); setMonthlyRows([]); setNotice('')
    const result = await monthlyReportService.getReport(year, month)
    setMonthlyLoading(false)
    if (result.error) { setNotice(result.error.message); return }
    setMonthlyRows(result.data?.attendance ?? []); setMonthlyLoaded(true)
    if (!result.data?.attendance.length) setNotice('لا توجد سجلات حضور لهذا الشهر.')
  }
  const openArchivedReport = async (item: MonthlyReportArchiveItem) => {
    if (!canDownloadMonthly) { setNotice('تسجيل الدخول بحساب مشرف موثّق مطلوب لعرض التقرير الشهري.'); return }
    setMonthlyMonth(`${item.year}-${String(item.month).padStart(2, '0')}`)
    setMonthlyLoading(true); setMonthlyLoaded(false); setNotice('')
    const result = await monthlyReportService.getReport(item.year, item.month)
    setMonthlyLoading(false)
    if (result.error) { setNotice(result.error.message); return }
    setMonthlyRows(result.data?.attendance ?? []); setMonthlyLoaded(true)
  }
  return <>
    <PageHeading eyebrow="مركز التقارير" title="التقارير والتحليلات" description="أنشئ تقارير الحضور والإجازات حسب الفترة والموظف." actions={<><Button variant="secondary" onClick={() => exportReport('PDF')}><FileText size={16} />تصدير PDF</Button><Button variant="secondary" onClick={() => exportReport('Excel')}><FileSpreadsheet size={16} />تصدير Excel</Button></>} />
    {notice && <InlineNotice onClose={() => setNotice('')}>{notice}</InlineNotice>}
    <section className="panel monthly-report-panel monthly-printable"><div className="panel-heading"><div><div className="eyebrow">مساحة المشرف · تقرير دوري</div><h2>تقرير الحضور الشهري</h2><p>يُتاح للمشرفين المخولين بعد إغلاق الشهر.</p></div><span className="schedule-badge"><CalendarDays size={14} />توليد شهري · بانتظار ربط الخدمة</span></div><div className="monthly-report-controls"><FormField label="الشهر"><input type="month" value={monthlyMonth} onChange={e => { setMonthlyMonth(e.target.value); setMonthlyLoaded(false); setMonthlyRows([]) }} /></FormField><div className="monthly-recipient"><ShieldCheck size={17} /><div><strong>المستلمون</strong><span>حسابات المشرفين المخولة فقط</span></div></div><div className="monthly-report-actions"><Button variant="secondary" disabled={monthlyLoading} onClick={() => void loadMonthlyReport()}>{monthlyLoading ? 'جارٍ التحميل…' : 'تحميل بيانات الشهر'}</Button><Button variant="secondary" disabled={!canDownloadMonthly || !monthlyLoaded || monthlyRows.length === 0} onClick={() => downloadAttendanceCsv(monthlyRows, monthlyMonth)}><FileSpreadsheet size={15} />تنزيل CSV لExcel</Button><Button variant="secondary" disabled={!canDownloadMonthly || !monthlyLoaded || monthlyRows.length === 0} onClick={() => window.print()}><FileText size={15} />حفظ PDF</Button></div></div>{monthlyLoaded && monthlyRows.length > 0 ? <div className="table-panel monthly-report-table"><div className="table-scroll"><table><thead><tr><th>الموظف</th><th>التاريخ</th><th>الحضور</th><th>الانصراف</th><th>الحالة</th></tr></thead><tbody>{monthlyRows.map(row => <tr key={row.id}><td><strong>{row.employeeName}</strong><small className="table-subline">{row.employeeId}</small></td><td>{row.date}</td><td>{row.checkIn ?? '—'}</td><td>{row.checkOut ?? '—'}</td><td><StatusBadge status={row.status} /></td></tr>)}</tbody></table></div></div> : <EmptyState title={monthlyLoaded ? 'لا توجد سجلات لهذا الشهر' : 'لا يوجد تقرير شهري جاهز'} description="بعد ربط خدمة التقارير ستظهر السجلات هنا، مع تنزيل CSV متوافق مع Excel أو حفظ نسخة PDF." icon="records" />}<div className="monthly-automation-note"><CircleAlert size={15} /><span>التوليد التلقائي كل شهر والتوزيع الآمن يتطلبان خدمة خلفية؛ لا تعمل المهام المجدولة عند إغلاق المتصفح.</span></div></section>
    <section className="panel report-filter"><div className="panel-heading"><div><h2>إعداد التقرير</h2><p>حدد نطاق البيانات التي تريد عرضها.</p></div><Filter size={17} className="muted-icon" /></div><div className="report-fields"><FormField label="نوع التقرير"><select value={reportType} onChange={e => setReportType(e.target.value)}><option value="monthly">تقرير الحضور الشهري</option><option value="summaries">ملخصات الموظفين</option><option value="absences">تقرير الغياب</option><option value="vacations">تقرير الإجازات</option><option value="late">تقرير التأخيرات</option></select></FormField><FormField label="من تاريخ"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></FormField><FormField label="إلى تاريخ"><input type="date" value={to} onChange={e => setTo(e.target.value)} /></FormField><FormField label="الرقم الوظيفي (اختياري)"><input value={employee} onChange={e => setEmployee(e.target.value)} placeholder="كل الموظفين" /></FormField><Button onClick={() => setNotice('لا توجد بيانات مطابقة حالياً. ستظهر النتائج عند ربط مصدر البيانات.')}><Search size={15} />عرض النتائج</Button></div></section>
    <div className="report-summary-grid"><MetricCard label="أيام الحضور" icon={Check} /><MetricCard label="أيام الغياب" icon={Activity} /><MetricCard label="الإجازات" icon={CalendarDays} /><MetricCard label="نسبة الحضور" icon={ArrowUpRight} /></div>
    <div className="panel report-result"><div className="panel-heading"><div><h2>{reportNames[reportType]}</h2><p>{from || 'بداية الفترة'} — {to || 'نهاية الفترة'}{employee ? ` · الموظف ${employee}` : ' · جميع الموظفين'}</p></div><button className="icon-button" title="تنزيل التقرير" onClick={() => exportReport('الملف')}><ArrowDownToLine size={17} /></button></div><EmptyState title="لا توجد بيانات للتقرير" description="سيظهر التقرير بعد توصيل مصدر بيانات حقيقي وتحديد الفترة." icon="records" /></div>
    <div className="report-note"><ShieldCheck size={15} /><span>ملفات PDF وExcel جاهزة للربط. لا يتم إنشاء أرقام أو سجلات تجريبية.</span><span className="report-note-status">مصدر البيانات: غير متصل</span></div>
    <section className="panel monthly-archive"><div className="panel-heading"><div><h2>أرشيف التقارير الشهرية</h2><p>تقارير الحضور التي أُتيحت للمشرفين بعد إغلاق كل شهر.</p></div><CalendarRange size={17} className="muted-icon" /></div>{monthlyArchive.length ? <div className="monthly-archive-list">{monthlyArchive.map(item => <div key={item.id}><span className="archive-month">{new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(item.year, item.month - 1, 1))}</span><span className="archive-date">{new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(item.generatedAt))}</span><Button variant="secondary" size="small" onClick={() => void openArchivedReport(item)}>فتح التقرير</Button></div>)}</div> : <EmptyState title="لا توجد تقارير شهرية منشورة" description="سيظهر كل تقرير هنا بعد تفعيله وتوليده من الخدمة الخلفية." icon="records" />}</section>
  </>
}
