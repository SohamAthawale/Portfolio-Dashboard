import React, { createContext, useContext, useState, useEffect } from 'react';

/* -----------------------------------------------
   ✅ USER TYPE (includes role)
   ----------------------------------------------- */
interface User {
  user_id: number;
  email: string;
  phone?: string;
  role: 'admin' | 'user';
}

/* -----------------------------------------------
   ✅ AUTH CONTEXT TYPE
   ----------------------------------------------- */
interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

/* -----------------------------------------------
   ✅ CONTEXT + API BASE URL
   ----------------------------------------------- */
const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

/* -----------------------------------------------
   ✅ PROVIDER COMPONENT
   ----------------------------------------------- */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /* -------------------------------------------------
     🔹 Restore user session on page load
     ------------------------------------------------- */
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`${API_BASE}/check-session`, {
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();

          if (data.logged_in && data.user_id && data.email) {
            // ✅ Optionally fetch role info if stored locally
            const storedUser = localStorage.getItem('pms_user');
            if (storedUser) {
              const parsed = JSON.parse(storedUser);
              setUser(parsed);
            } else {
              // fallback — no local cache
              setUser({
                user_id: data.user_id,
                email: data.email,
                role: 'user', // default — role will be set after next login
              });
            }
          } else {
            // Session invalid or expired
            setUser(null);
            localStorage.removeItem('pms_user');
          }
        } else {
          setUser(null);
          localStorage.removeItem('pms_user');
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

  /* -------------------------------------------------
     🔹 Login Function
     ------------------------------------------------- */
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // ✅ allows Flask to set secure session cookie
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();

        const userData: User = {
          user_id: data.user.user_id,
          email: data.user.email,
          phone: data.user.phone,
          role: data.user.role, // ✅ role returned from backend
        };

        setUser(userData);
        localStorage.setItem('pms_user', JSON.stringify(userData));
        return true;
      } else {
        console.error('❌ Login failed with status', response.status);
        return false;
      }
    } catch (err) {
      console.error('⚠️ Network or server error during login:', err);
      return false;
    }
  };

  /* -------------------------------------------------
     🔹 Logout Function
     ------------------------------------------------- */
  const logout = async (): Promise<void> => {
    try {
      await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('⚠️ Logout failed:', err);
    } finally {
      setUser(null);
      localStorage.removeItem('pms_user');
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

/* -----------------------------------------------
   ✅ Custom Hook
   ----------------------------------------------- */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
