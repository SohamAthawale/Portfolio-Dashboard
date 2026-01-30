import React, { createContext, useContext, useState, useEffect } from 'react';

/* -----------------------------------------------
   USER TYPE
----------------------------------------------- */
interface User {
  user_id: number;
  email: string;
  phone?: string;
  role: 'admin' | 'user';
}

/* -----------------------------------------------
   CONTEXT TYPE
----------------------------------------------- */
interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  finishOtpLogin: (user: User) => void;   // ⭐ ADDED
  logout: () => Promise<void>;
  isLoading: boolean;
}

/* -----------------------------------------------
   CREATE CONTEXT
----------------------------------------------- */
const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8010/pmsreports';

/* -----------------------------------------------
   PROVIDER
----------------------------------------------- */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /* -----------------------------------------------
     RESTORE SESSION ON PAGE LOAD
  ----------------------------------------------- */
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`${API_BASE}/check-session`, {
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();

          if (data.logged_in) {
            // Backend session exists → restore user from backend or cache
            const restoredUser: User = {
              user_id: data.user_id,
              email: data.email,
              phone: data.phone,
              role: data.role,
            };

            setUser(restoredUser);
            localStorage.setItem('pms_user', JSON.stringify(restoredUser));
          } else {
            setUser(null);
            localStorage.removeItem('pms_user');
          }
        }
      } catch (err) {
        console.error('⚠️ Error restoring session:', err);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSession();
  }, []);

  /* -----------------------------------------------
     NORMAL LOGIN (PASSWORD-ONLY)
  ----------------------------------------------- */
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) return false;

      const data = await response.json();

      if (data.otp_required) {
        // OTP login path → AuthContext should NOT set user yet
        return true;
      }

      // Only used for non-OTP login (rare)
      if (data.user) {
        const userData: User = data.user;
        setUser(userData);
        localStorage.setItem('pms_user', JSON.stringify(userData));
      }

      return true;

    } catch (err) {
      console.error('⚠️ Login error:', err);
      return false;
    }
  };

  /* -----------------------------------------------
     ⭐ FINISH OTP LOGIN (CALLED AFTER /verify-otp)
  ----------------------------------------------- */
  const finishOtpLogin = (userData: User) => {
    setUser(userData);
    localStorage.setItem('pms_user', JSON.stringify(userData));
  };

  /* -----------------------------------------------
     LOGOUT
  ----------------------------------------------- */
  const logout = async (): Promise<void> => {
    try {
      await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('⚠️ Logout failed:', err);
    }

    setUser(null);
    localStorage.removeItem('pms_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, finishOtpLogin, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

/* -----------------------------------------------
   HOOK
----------------------------------------------- */
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
