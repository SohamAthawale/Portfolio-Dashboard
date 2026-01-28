import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { motion } from "framer-motion";
import Logo from "../components/logo";

const API_BASE = import.meta.env.VITE_API_URL || '/pmsreports';


/* -------------------------
   REGEX VALIDATION
------------------------- */
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
  /* UI MODE */
  const [isRegister, setIsRegister] = useState(false);
  const [otpStep, setOtpStep] = useState(false);

  /* FORM FIELDS */
  const [email, setEmail] = useState("");
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailPending, setEmailPending] = useState(false); // ⭐ NEW

  const [phone, setPhone] = useState("");
  const [phoneAvailable, setPhoneAvailable] = useState<boolean | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [passwordChecks, setPasswordChecks] = useState({
    minLen: false,
    lower: false,
    upper: false,
    number: false,
    special: false,
  });

  const [otp, setOtp] = useState("");

  /* STATUS */
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  /* HELPERS */
  const navigate = useNavigate();
  const { finishOtpLogin } = useAuth();

  const emailAbortRef = useRef<AbortController | null>(null);
  const phoneAbortRef = useRef<AbortController | null>(null);

  const isSqlInjection = (value: string) => SQL_INJECTION_REGEX.test(value);

  /* --------------------------------------------------------
     LIVE EMAIL CHECK  (Signup mode only)
  -------------------------------------------------------- */
  useEffect(() => {
    if (!isRegister) return;

    setEmailAvailable(null);
    setEmailError(null);
    setEmailPending(false);

    if (!email) return;

    if (isSqlInjection(email)) {
      setEmailError("Contains blocked characters");
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      setEmailError("Invalid email format");
      return;
    }

    const timer = setTimeout(async () => {
      if (emailAbortRef.current) emailAbortRef.current.abort();

      const ac = new AbortController();
      emailAbortRef.current = ac;

      try {
        const res = await fetch(`${API_BASE}/check-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal,
          body: JSON.stringify({ email }),
        });

        const data = await res.json();

        if (!res.ok) {
          setEmailError(data.error || "Error checking email");
          setEmailAvailable(false);
          setEmailPending(false);
        } else {
          if (data.pending === true) {
            setEmailPending(true);
            setEmailAvailable(false);
          } else {
            setEmailPending(false);
            setEmailAvailable(!data.exists);
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setEmailError("Network error");
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [email, isRegister]);

  /* --------------------------------------------------------
     LIVE PHONE CHECK  (Signup mode only)
  -------------------------------------------------------- */
  useEffect(() => {
    if (!isRegister) return;

    setPhoneAvailable(null);
    setPhoneError(null);

    if (!phone) return;

    if (!/^\d*$/.test(phone)) {
      setPhoneError("Digits only");
      return;
    }

    if (!PHONE_REGEX.test(phone)) {
      setPhoneError("Phone must be 10 digits");
      return;
    }

    const timer = setTimeout(async () => {
      if (phoneAbortRef.current) phoneAbortRef.current.abort();

      const ac = new AbortController();
      phoneAbortRef.current = ac;

      try {
        const res = await fetch(`${API_BASE}/check-phone`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal,
          body: JSON.stringify({ phone }),
        });

        const data = await res.json();

        if (!res.ok) {
          setPhoneError(data.error || "Error checking phone");
          setPhoneAvailable(false);
        } else {
          setPhoneAvailable(!data.exists);
        }
      } catch {
        setPhoneError("Network error");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [phone, isRegister]);

  /* --------------------------------------------------------
     PASSWORD LIVE STRENGTH
  -------------------------------------------------------- */
  useEffect(() => {
    setPasswordChecks({
      minLen: PASSWORD_RULES.minLen(password),
      lower: PASSWORD_RULES.lower(password),
      upper: PASSWORD_RULES.upper(password),
      number: PASSWORD_RULES.number(password),
      special: PASSWORD_RULES.special(password),
    });
  }, [password]);

  /* --------------------------------------------------------
     SUBMIT HANDLER
  -------------------------------------------------------- */
  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setMessage("");

    if (
      isSqlInjection(email) ||
      isSqlInjection(phone) ||
      isSqlInjection(password) ||
      isSqlInjection(otp)
    ) {
      setMessage("❌ Invalid characters detected");
      return;
    }

    /* -------------------- OTP STEP -------------------- */
    if (otpStep) {
      setIsLoading(true);

      try {
        const res = await fetch(`${API_BASE}/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, otp }),
        });

        const data = await res.json();

        if (!res.ok) {
          setMessage("❌ " + (data.error || "Incorrect OTP"));
        } else {
          finishOtpLogin(data.user);
          navigate("/upload");
        }
      } catch {
        setMessage("⚠️ Network error");
      }

      setIsLoading(false);
      return;
    }

    /* -------------------- SIGNUP -------------------- */
    if (isRegister) {
      if (!EMAIL_REGEX.test(email)) {
        setMessage("❌ Enter a valid email");
        return;
      }

      if (!PHONE_REGEX.test(phone)) {
        setMessage("❌ Enter a valid 10-digit phone number");
        return;
      }

      if (!Object.values(passwordChecks).every(Boolean)) {
        setMessage("❌ Password too weak");
        return;
      }

      if (emailPending) {
        setMessage("⏳ This email is pending admin approval.");
        return;
      }

      if (emailAvailable === false) {
        setMessage("❌ Email already exists");
        return;
      }

      if (phoneAvailable === false) {
        setMessage("❌ Phone already exists");
        return;
      }

      setIsLoading(true);

      try {
        const res = await fetch(`${API_BASE}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, phone, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          setMessage("❌ " + (data.error || "Signup failed"));
        } else {
          setMessage("🎉 Registration submitted. Waiting for admin approval.");
          setIsRegister(false);
          setEmail("");
          setPhone("");
          setPassword("");
        }
      } catch {
        setMessage("⚠️ Network error");
      }

      setIsLoading(false);
      return;
    }

    /* -------------------- LOGIN -------------------- */
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage("❌ " + (data.error || "Login failed"));
      } else if (data.otp_required) {
        setOtpStep(true);
        setMessage("📧 OTP sent to your email");
      }
    } catch {
      setMessage("⚠️ Network error");
    }

    setIsLoading(false);
  };

  /* -------------------------
     STATUS LABEL TEXT
  ------------------------- */
  const statusText = (
    available: boolean | null,
    err: string | null,
    pending?: boolean
  ) => {
    if (err) return <span className="text-red-600">{err}</span>;
    if (pending) return <span className="text-orange-500">Pending Approval</span>;
    if (available === null) return <span className="text-gray-500">—</span>;

    return available ? (
      <span className="text-green-600">Available</span>
    ) : (
      <span className="text-red-600">Taken</span>
    );
  };

  /* -------------------------
     RENDER UI
  ------------------------- */
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-100">
      <motion.div
        className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg space-y-6"
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex justify-center">
          <Logo className="w-40 h-auto" />
        </div>

        <h1 className="text-2xl font-bold text-center">
          {otpStep ? "Verify OTP" : isRegister ? "Create Account" : "Log In"}
        </h1>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* ---------- EMAIL ---------- */}
          {!otpStep && (
            <>
              <div>
                <label className="flex justify-between mb-1 font-medium">
                  <span>Email</span>

                  {/* Only show validation in SIGNUP */}
                  {isRegister &&
                    statusText(emailAvailable, emailError, emailPending)}
                </label>

                <input
                  className="w-full border p-3 rounded"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value.trim());
                    if (isRegister) {
                      setEmailAvailable(null);
                      setEmailError(null);
                      setEmailPending(false);
                    }
                  }}
                  required
                />
              </div>

              {/* ---------- PHONE ---------- */}
              {isRegister && (
                <div>
                  <label className="flex justify-between mb-1 font-medium">
                    <span>Phone</span>
                    {statusText(phoneAvailable, phoneError)}
                  </label>

                  <input
                    className="w-full border p-3 rounded"
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
              )}

              {/* ---------- PASSWORD ---------- */}
              <div>
                <label className="block mb-1 font-medium">Password</label>
                <input
                  type="password"
                  className="w-full border p-3 rounded"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />

                {isRegister && (
                  <div className="mt-2 space-y-1 text-sm">
                    {[
                      ["minLen", "≥ 8 characters"],
                      ["lower", "Lowercase letter"],
                      ["upper", "Uppercase letter"],
                      ["number", "Number"],
                      ["special", "Special (!@#$%^&*)"],
                    ].map(([key, label]) => (
                      <div
                        key={key}
                        className={
                          passwordChecks[key as keyof typeof passwordChecks]
                            ? "text-green-600"
                            : "text-gray-500"
                        }
                      >
                        {passwordChecks[key as keyof typeof passwordChecks]
                          ? "✓"
                          : "○"}{" "}
                        {label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ---------- OTP FIELD ---------- */}
          {otpStep && (
            <div>
              <label className="mb-1 font-medium">Enter OTP</label>
              <input
                className="w-full border text-center p-3 rounded text-xl tracking-widest"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </div>
          )}

          {/* ---------- MESSAGE ---------- */}
          {message && (
            <div className="p-2 text-center bg-gray-100 rounded text-sm">
              {message}
            </div>
          )}

          {/* ---------- SUBMIT BUTTON ---------- */}
          <button
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading
              ? "Please wait..."
              : otpStep
              ? "Verify OTP"
              : isRegister
              ? "Sign Up"
              : "Sign In"}
          </button>
        </form>

        {/* SWITCH LOGIN / SIGNUP */}
        {!otpStep && (
          <p
            className="text-blue-600 text-center cursor-pointer"
            onClick={() => {
              setIsRegister(!isRegister);
              // reset fields
              setMessage("");
              setEmail("");
              setPhone("");
              setPassword("");
              // reset validation
              setEmailAvailable(null);
              setPhoneAvailable(null);
              setEmailError(null);
              setPhoneError(null);
              setEmailPending(false);
            }}
          >
            {isRegister
              ? "Already have an account? Log in"
              : "Don't have an account? Sign up"}
          </p>
        )}
      </motion.div>
    </div>
  );
};
