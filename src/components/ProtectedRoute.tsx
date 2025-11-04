import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('admin' | 'user')[]; // ✅ Optional role-based restriction
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // 🚫 Not logged in → redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 🚫 Role not allowed → redirect to dashboard or login
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    console.warn(`⚠️ Access denied for role: ${user.role}`);
    return <Navigate to="/dashboard" replace />;
  }

  // ✅ Access granted
  return <>{children}</>;
};
