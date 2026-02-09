import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, Mail, Smartphone, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/logo';

const API_BASE = import.meta.env.VITE_API_URL || '/pmsreports';

const SQL_INJECTION_REGEX =
  /('|--|;|\/\*|\*\/|\bUNION\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bOR\b\s+1=1|\b1=1\b)/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const PHONE_REGEX = /^\d{10}$/;

const PASSWORD_RULES = {
  minLen: (s: string) => s.length >= 8,
  lower: (s: string) => /[a-z]/.test(s),
  upper: (s: string) => /[A-Z]/.test(s),
  number: (s: string) => /[0-9]/.test(s),
  special: (s: string) => /[!@#$%^&*]/.test(s),
};

export const Login = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [otpStep, setOtpStep] = useState(false);

  const [email, setEmail] = useState('');
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [phoneAvailable, setPhoneAvailable] = useState<boolean | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [passwordChecks, setPasswordChecks] = useState({
    minLen: false,
    lower: false,
    upper: false,
    number: false,
    special: false,
  });
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { finishOtpLogin } = useAuth();
  const navigate = useNavigate();

  const emailAbortRef = useRef<AbortController | null>(null);
  const phoneAbortRef = useRef<AbortController | null>(null);

  const isSqlInjection = (value: string) => SQL_INJECTION_REGEX.test(value);

  useEffect(() => {
    if (!isRegister) return;

    setEmailAvailable(null);
    setEmailError(null);

    if (!email) return;
    if (isSqlInjection(email)) {
      setEmailError('Contains blocked characters');
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      setEmailError('Invalid email format');
      return;
    }

    const timer = setTimeout(async () => {
      if (emailAbortRef.current) emailAbortRef.current.abort();
      const ac = new AbortController();
      emailAbortRef.current = ac;

      try {
        const res = await fetch(`${API_BASE}/check-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ac.signal,
          body: JSON.stringify({ email }),
        });
        const data = await res.json();

        if (!res.ok) {
          setEmailError(data.error || 'Error checking email');
          setEmailAvailable(false);
          return;
        }
        setEmailAvailable(!data.exists);
      } catch (err: any) {
        if (err.name !== 'AbortError') setEmailError('Network error');
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [email, isRegister]);

  useEffect(() => {
    if (!isRegister) return;
    setPhoneAvailable(null);
    setPhoneError(null);

    if (!phone) return;
    if (!/^\d*$/.test(phone)) {
      setPhoneError('Digits only');
      return;
    }
    if (!PHONE_REGEX.test(phone)) {
      setPhoneError('Phone must be 10 digits');
      return;
    }

    const timer = setTimeout(async () => {
      if (phoneAbortRef.current) phoneAbortRef.current.abort();
      const ac = new AbortController();
      phoneAbortRef.current = ac;

      try {
        const res = await fetch(`${API_BASE}/check-phone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ac.signal,
          body: JSON.stringify({ phone }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPhoneError(data.error || 'Error checking phone');
          setPhoneAvailable(false);
          return;
        }
        setPhoneAvailable(!data.exists);
      } catch {
        setPhoneError('Network error');
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [phone, isRegister]);

  useEffect(() => {
    setPasswordChecks({
      minLen: PASSWORD_RULES.minLen(password),
      lower: PASSWORD_RULES.lower(password),
      upper: PASSWORD_RULES.upper(password),
      number: PASSWORD_RULES.number(password),
      special: PASSWORD_RULES.special(password),
    });
  }, [password]);

  const resetAuthView = (toRegister: boolean) => {
    setIsRegister(toRegister);
    setOtpStep(false);
    setMessage('');
    setEmail('');
    setPhone('');
    setPassword('');
    setOtp('');
    setEmailAvailable(null);
    setPhoneAvailable(null);
    setEmailError(null);
    setPhoneError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (
      isSqlInjection(email) ||
      isSqlInjection(phone) ||
      isSqlInjection(password) ||
      isSqlInjection(otp)
    ) {
      setMessage('Invalid characters detected.');
      return;
    }

    if (otpStep) {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, otp }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessage(data.error || 'Incorrect OTP');
        } else {
          finishOtpLogin(data.user);
          navigate('/dashboard');
        }
      } catch {
        setMessage('Network error');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (isRegister) {
      if (!EMAIL_REGEX.test(email)) {
        setMessage('Enter a valid email');
        return;
      }
      if (!PHONE_REGEX.test(phone)) {
        setMessage('Enter a valid 10-digit phone number');
        return;
      }
      if (!Object.values(passwordChecks).every(Boolean)) {
        setMessage('Password does not meet security rules');
        return;
      }
      if (emailAvailable === false) {
        setMessage('Email already exists');
        return;
      }
      if (phoneAvailable === false) {
        setMessage('Phone already exists');
        return;
      }

      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, phone, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessage(data.error || 'Signup failed');
        } else {
          setMessage('Account created successfully. Please sign in.');
          setIsRegister(false);
          setPassword('');
        }
      } catch {
        setMessage('Network error');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Login failed');
      } else if (data.otp_required) {
        setOtpStep(true);
        setMessage('OTP sent to your email');
      }
    } catch {
      setMessage('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const statusText = (available: boolean | null, err: string | null) => {
    if (err) return <span className="text-rose-600">{err}</span>;
    if (available === null) return <span className="text-slate-400">-</span>;
    return available ? (
      <span className="text-emerald-600">Available</span>
    ) : (
      <span className="text-rose-600">Taken</span>
    );
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_0.9fr] bg-[radial-gradient(circle_at_top_left,_#cffafe,_#eff6ff_40%,_#f8fafc)]">
      <div className="hidden lg:flex flex-col justify-between p-10">
        <Logo />
        <div className="max-w-xl space-y-6">
          <h1 className="text-5xl font-extrabold leading-tight text-slate-900">
            Smarter portfolio tracking for families, advisors and admins.
          </h1>
          <p className="text-lg text-slate-600">
            FolioPulse centralizes statements, allocations, request handling and portfolio analytics in one workspace.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm text-cyan-800 w-fit">
          <ShieldCheck size={16} />
          Session-secured + OTP verified
        </div>
      </div>

      <div className="flex items-center justify-center p-4 sm:p-8">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="w-full max-w-md app-panel p-7 sm:p-8 space-y-6"
        >
          <div className="lg:hidden flex justify-center">
            <Logo compact />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {otpStep ? 'Verify OTP' : isRegister ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {otpStep
                ? 'Enter the 6-digit OTP sent to your email.'
                : isRegister
                ? 'Start tracking portfolios with secure account access.'
                : 'Sign in with email and password to continue.'}
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {!otpStep && (
              <>
                <div>
                  <label className="flex justify-between text-sm font-semibold text-slate-700 mb-1.5">
                    <span>Email</span>
                    {isRegister && statusText(emailAvailable, emailError)}
                  </label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      className="app-input pl-9"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value.trim());
                        setEmailAvailable(null);
                        setEmailError(null);
                      }}
                      required
                    />
                  </div>
                </div>

                {isRegister && (
                  <div>
                    <label className="flex justify-between text-sm font-semibold text-slate-700 mb-1.5">
                      <span>Phone</span>
                      {statusText(phoneAvailable, phoneError)}
                    </label>
                    <div className="relative">
                      <Smartphone size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        className="app-input pl-9"
                        maxLength={10}
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value.trim());
                          setPhoneAvailable(null);
                          setPhoneError(null);
                        }}
                        required
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="password"
                      className="app-input pl-9"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>

                  {isRegister && (
                    <div className="mt-3 grid grid-cols-2 gap-1 text-xs text-slate-500">
                      {[
                        ['minLen', '8+ chars'],
                        ['lower', 'lowercase'],
                        ['upper', 'uppercase'],
                        ['number', 'number'],
                        ['special', 'special'],
                      ].map(([key, label]) => (
                        <div
                          key={key}
                          className={
                            passwordChecks[key as keyof typeof passwordChecks]
                              ? 'text-emerald-600'
                              : 'text-slate-500'
                          }
                        >
                          {passwordChecks[key as keyof typeof passwordChecks] ? '✓' : '•'} {label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {otpStep && (
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">One-Time Password</label>
                <input
                  className="app-input text-center text-xl tracking-[0.45em]"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
              </div>
            )}

            {message && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {message}
              </div>
            )}

            <button disabled={isLoading} className="btn-primary w-full">
              {isLoading
                ? 'Please wait...'
                : otpStep
                ? 'Verify OTP'
                : isRegister
                ? 'Create Account'
                : 'Continue'}
            </button>
          </form>

          {!otpStep && (
            <button
              type="button"
              className="text-sm text-cyan-700 hover:text-cyan-800 font-semibold"
              onClick={() => resetAuthView(!isRegister)}
            >
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
};
