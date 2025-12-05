import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, Phone } from 'lucide-react';
import { motion } from 'framer-motion';
import Logo from "../components/logo";

// ✅ Use centralized backend URL for consistency
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setIsLoading(true);

    try {
      if (isRegister) {
        // --- Registration ---
        const response = await fetch(`${API_BASE}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, phone, password }),
          credentials: 'include', // ✅ send cookies
        });

        const data = await response.json();

        if (response.ok) {
          setMessage('✅ Registration successful! You can now sign in after a admin approves you.');
          setIsRegister(false);
          setEmail('');
          setPhone('');
          setPassword('');
        } else {
          setMessage(data.error || '❌ Registration failed.');
        }
      } else {
        // --- Login ---
        const success = await login(email, password); // ✅ calls Flask + sets cookie
        if (success) {
          navigate('/upload');
        } else {
          setMessage('❌ Invalid credentials. Please try again.');
        }
      }
    } catch (err) {
      console.error('⚠️ Network error:', err);
      setMessage('⚠️ Network error. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

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
          <p className="text-center text-gray-600 mb-8">
            {isRegister
              ? 'Sign up to get started with your portfolio'
              : 'Sign in to access your portfolio'}
          </p>

          <form onSubmit={handleSubmit}>
            {/* Email Field */}
            <div className="mb-5">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Phone Field (Register only) */}
            {isRegister && (
              <div className="mb-5">
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="tel"
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required={isRegister}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="9999999999"
                  />
                </div>
              </div>
            )}

            {/* Password Field */}
            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* Message Display */}
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

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* Toggle Mode */}
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
