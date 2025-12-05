import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import Logo from "../components/logo";

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

// SQL injection prevention regex
const SQL_REGEX = /(\b(SELECT|INSERT|DELETE|UPDATE|DROP|UNION|ALTER|--|;|\/\*|\*\/)\b|['"])/i;

export const Login = () => {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const [isRegister, setIsRegister] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const navigate = useNavigate();
  const { login } = useAuth();

  // ---------------- VALIDATION STATES ----------------

  const emailValid =
    /^\S+@\S+\.\S+$/.test(email) && !SQL_REGEX.test(email);

  const phoneValid =
    isRegister &&
    /^[0-9]{10}$/.test(phone) &&
    !SQL_REGEX.test(phone);

  const passwordRules = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    noSQL: !SQL_REGEX.test(password),
  };

  const passwordValid =
    passwordRules.length &&
    passwordRules.upper &&
    passwordRules.lower &&
    passwordRules.number &&
    passwordRules.special &&
    passwordRules.noSQL;

  const canSubmit = isRegister
    ? emailValid && phoneValid && passwordValid
    : emailValid && password.length > 0;

  // ---------------- FORM SUBMIT ----------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setIsLoading(true);

    try {
      if (isRegister) {
        const res = await fetch(`${API_BASE}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, phone, password }),
          credentials: 'include',
        });

        const data = await res.json();

        if (res.ok) {
          setMessage("✅ Registration successful! Pending admin approval.");
          setIsRegister(false);
          setEmail('');
          setPhone('');
          setPassword('');
        } else {
          setMessage(`❌ ${data.error || "Unknown error"}`);
        }

        return;
      }

      // ---------------- LOGIN ----------------
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok) {
        await login(email, password);
        navigate('/upload');
      } else {
        setMessage(`❌ ${data.error || "Unknown error"}`);
      }

    } catch (err) {
      setMessage("⚠️ Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------- RULE COMPONENT ----------------
  const Rule = ({ ok, text }: any) => (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle className="text-green-600" size={16} />
      ) : (
        <XCircle className="text-red-500" size={16} />
      )}
      <span className={ok ? "text-green-600" : "text-red-600"}>{text}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center justify-center mb-8">
            <Logo className="w-48 h-auto" />
          </div>

          <h1 className="text-3xl font-bold text-center text-gray-800 mb-2">
            {isRegister ? 'Create Account' : 'Welcome Back'}
          </h1>

          <form onSubmit={handleSubmit}>

            {/* ---------------- EMAIL ---------------- */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={`w-full pl-3 pr-4 py-3 border rounded-lg transition-all 
                  ${emailValid ? "border-green-500" : "border-red-400"}
                `}
                placeholder="you@example.com"
              />
            </div>

            {/* ---------------- PHONE ---------------- */}
            {isRegister && (
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className={`w-full pl-3 pr-4 py-3 border rounded-lg transition-all
                    ${phoneValid ? "border-green-500" : "border-red-400"}
                  `}
                  placeholder="9999999999"
                />
              </div>
            )}

            {/* ---------------- PASSWORD (Always visible) ---------------- */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={`w-full pl-3 pr-4 py-3 border rounded-lg transition-all
                  ${
                    isRegister
                      ? passwordValid
                        ? "border-green-500"
                        : "border-red-400"
                      : password.length > 0
                      ? "border-green-500"
                      : "border-gray-300"
                  }
                `}
                placeholder="••••••••"
              />

              {/* Password checklist — ONLY during register */}
              {isRegister && (
                <div className="mt-3 space-y-1">
                  <Rule ok={passwordRules.length} text="At least 8 characters" />
                  <Rule ok={passwordRules.upper} text="1 uppercase letter" />
                  <Rule ok={passwordRules.lower} text="1 lowercase letter" />
                  <Rule ok={passwordRules.number} text="1 number" />
                  <Rule ok={passwordRules.special} text="1 special character" />
                </div>
              )}
            </div>

            {/* ---------------- MESSAGE ---------------- */}
            {message && (
              <div
                className={`mb-4 p-3 rounded-lg text-sm ${
                  message.startsWith('✅')
                    ? 'bg-green-50 border border-green-200 text-green-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}
              >
                {message}
              </div>
            )}

            {/* ---------------- SUBMIT BUTTON ---------------- */}
            <button
              type="submit"
              disabled={!canSubmit || isLoading}
              className={`w-full text-white py-3 rounded-lg font-medium transition-all
                ${canSubmit
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-gray-400 cursor-not-allowed"}
              `}
            >
              {isLoading
                ? isRegister
                  ? 'Creating Account...'
                  : 'Signing In...'
                : isRegister
                ? 'Sign Up'
                : 'Sign In'}
            </button>
          </form>

          {/* TOGGLE LOGIN/REGISTER */}
          <p
            className="text-center text-blue-600 text-sm mt-6 cursor-pointer hover:underline"
            onClick={() => {
              setIsRegister(!isRegister);
              setMessage('');
            }}
          >
            {isRegister
              ? 'Already have an account? Log in'
              : "Don’t have an account? Sign up"}
          </p>
        </div>

        <p className="text-center text-gray-600 text-sm mt-6">
          Portfolio Management System v1.0
        </p>
      </motion.div>
    </div>
  );
};
