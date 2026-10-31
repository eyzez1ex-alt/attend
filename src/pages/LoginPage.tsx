import { useState } from 'react'
import { Eye, EyeOff, Fingerprint, Moon, ShieldCheck, Sparkles, Sun } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { authService } from '../services/api'
import { Button } from '../components/UI'

export default function LoginPage({ theme, onThemeChange }: { theme: 'light' | 'dark'; onThemeChange: (theme: 'light' | 'dark') => void }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('')
    if (!email.trim() || !accessCode.trim() || !password) { setError('يرجى إدخال البريد الإلكتروني ورمز الدخول وكلمة المرور.'); return }
    setLoading(true)
    const result = await authService.login({ email, accessCode, password, remember })
    setLoading(false)
    if (result.data) navigate(result.data.role === 'employee' ? '/employee' : '/admin', { replace: true })
    else setError(result.error?.message ?? 'لم يتم تسجيل الدخول.')
  }
  const resetPassword = async () => {
    setError(''); setMessage('')
    if (!email.trim()) { setMessage('أدخل بريدك الإلكتروني أولاً لإرسال رابط الاستعادة.'); return }
    setLoading(true)
    const result = await authService.sendPasswordReset(email)
    setLoading(false)
    if (result.error) setError(result.error.message)
    else setMessage('إذا كان البريد مسجلاً، فسيصلك رابط إعادة تعيين كلمة المرور.')
  }
  return <main className={`auth-page ${theme}`} dir="rtl">
    <div className="auth-top"><Link to="/login" className="auth-brand"><span className="brand-mark"><Fingerprint size={18} /></span><span>RU here?</span></Link><div className="auth-top-tools"><button className="icon-button" aria-label={theme === 'light' ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح'} onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</button><div className="auth-locale">العربية <span>·</span> مصر</div></div></div>
    <div className="auth-layout"><section className="auth-form-side"><div className="auth-form-wrap"><div className="auth-kicker"><span /><span>نظام إدارة الحضور</span></div><h1>مرحباً بعودتك</h1><p className="auth-intro">سجّل الدخول للوصول إلى مساحة العمل الخاصة بك.</p>
      <form className="login-form" onSubmit={submit} noValidate>
        <label className="auth-field"><span>البريد الإلكتروني</span><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" aria-invalid={Boolean(error)} /></label>
        <label className="auth-field"><span>رقم الموظف أو رمز الدخول</span><input value={accessCode} onChange={e => setAccessCode(e.target.value)} placeholder="أدخل رقم الموظف أو الرمز" /></label>
        <label className="auth-field"><span>كلمة المرور</span><div className="password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••" /><button type="button" aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        <div className="login-options"><label className="check-row"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /><span>تذكرني</span></label><button type="button" className="text-link" onClick={() => void resetPassword()} disabled={loading}>نسيت كلمة المرور؟</button></div>
        {error && <div className="auth-error" role="alert"><ShieldCheck size={16} /><span>{error}</span></div>}{message && <div className="auth-message"><ShieldCheck size={16} /><span>{message}</span></div>}
        <Button type="submit" className="login-submit" disabled={loading}>{loading ? <><span className="loading-spinner" />جارٍ التحقق</> : <>تسجيل الدخول <span className="submit-arrow">←</span></>}</Button>
      </form>
    </div></section><aside className="auth-art-side"><div className="auth-art-grid" /><div className="auth-art-content"><div className="art-monogram"><Fingerprint size={40} strokeWidth={1.2} /></div><div className="art-overline"><Sparkles size={14} />حضور واضح. إدارة أذكى.</div><h2>كل يوم عمل،<br />في مكانه الصحيح.</h2><p>منصة موحدة لمتابعة الحضور وإدارة الإجازات، مصممة لتمنح فريقك صورة واضحة.</p><div className="art-stat-line"><span /><span /><span /></div></div></aside></div>
    <footer className="auth-footer"><span>© {new Date().getFullYear()} RU here?</span><span>سياسة الخصوصية · شروط الاستخدام</span></footer>
  </main>
}
