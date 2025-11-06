import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Upload } from './pages/Upload';
import { Dashboard } from './pages/Dashboard';
import { History } from './pages/History';
import { AdminDashboard } from './pages/AdminDashboard';
import { ServiceRequests } from './pages/ServiceRequests';
import { ProfilePage } from './pages/ProfilePage'; // ✅ NEW IMPORT

/* -------------------------------------------------
   ✅ ROLE-BASED DASHBOARD WRAPPER
   ------------------------------------------------- */
const RoleBasedDashboard: React.FC = () => {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  // 🔹 Show dashboard based on role
  return user.role === 'admin' ? <AdminDashboard /> : <Dashboard />;
};

/* -------------------------------------------------
   ✅ MAIN APP ROUTES
   ------------------------------------------------- */
function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* ---------- PUBLIC ROUTES ---------- */}
          <Route path="/login" element={<Login />} />

          {/* ---------- USER ROUTES ---------- */}
          <Route
            path="/upload"
            element={
              <ProtectedRoute allowedRoles={['user']}>
                <Upload />
              </ProtectedRoute>
            }
          />

          <Route
            path="/history"
            element={
              <ProtectedRoute allowedRoles={['user']}>
                <History />
              </ProtectedRoute>
            }
          />

          <Route
            path="/portfolio/:portfolio_id"
            element={
              <ProtectedRoute allowedRoles={['user']}>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          {/* ---------- ADMIN ROUTES ---------- */}
          <Route
            path="/service-requests"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ServiceRequests />
              </ProtectedRoute>
            }
          />

          {/* ---------- COMMON DASHBOARD ---------- */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['admin', 'user']}>
                <RoleBasedDashboard />
              </ProtectedRoute>
            }
          />

          {/* ---------- ✅ NEW PROFILE PAGE ---------- */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute allowedRoles={['admin', 'user']}>
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          {/* ---------- FALLBACK ---------- */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
