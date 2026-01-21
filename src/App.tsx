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
import { AdminServiceRequests} from './pages/AdminServiceRequests';
import { ProfilePage } from './pages/ProfilePage'; // ✅ NEW IMPORT
import { AdminProfilePage } from "./pages/AdminProfilePage";
import { AdminPortfolioEditor } from "./pages/AdminPortfolioEditor";
import { AdminUserDetail } from "./pages/AdminUserDetails";
import AdminPendingRegistrations from "./pages/AdminPendingRegistrations";

/* -------------------------------------------------
   ✅ ROLE-BASED DASHBOARD WRAPPER
   ------------------------------------------------- */
const RoleBasedDashboard: React.FC = () => {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  // 🔹 Show dashboard based on role
  return user.role === 'admin' ? <AdminDashboard /> : <Dashboard /> ;
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
          {/* ---------- USER SERVICE REQUEST PAGE ---------- */}
          <Route
            path="/service-requests"
            element={
              <ProtectedRoute allowedRoles={['user']}>
                <ServiceRequests />
              </ProtectedRoute>
            }
          />

          {/* ---------- ADMIN ROUTES ---------- */}
          <Route
            path="/admin/service-requests"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminServiceRequests />
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
            path="/pmsreports/profile"
            element={
              <ProtectedRoute allowedRoles={['admin', 'user']}>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/edit-portfolio/:userId/:requestId"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminPortfolioEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/user/:userId"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminUserDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pending-registrations"
            element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminPendingRegistrations />
            </ProtectedRoute>}
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
