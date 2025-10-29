import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  email: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ✅ Centralized backend URL for both local & deployment
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // --- Check for existing session when app loads ---
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`${API_BASE}/dashboard-data`, {
          credentials: 'include', // ✅ Send existing cookie if present
        });

        if (response.ok) {
          // Session cookie valid — restore stored user info
          const storedUser = localStorage.getItem('pms_user');
          if (storedUser) {
            setUser(JSON.parse(storedUser));
          }
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSession();
  }, []);

  // --- Login Function ---
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // ✅ allows Flask to set session cookie
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const userData = { email };
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

  // --- Logout Function ---
  const logout = async (): Promise<void> => {
    try {
      await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        credentials: 'include', // ✅ ensures Flask clears cookie
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

// --- Custom hook for easy access in components ---
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
