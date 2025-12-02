import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload as UploadIcon,
  History,
  LogOut,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Sidebar = () => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await fetch('http://127.0.0.1:5000/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      logout();
    }
  };

  // 🔹 Define role-based navigation
  const userNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/upload', label: 'Upload', icon: UploadIcon },
    { path: '/history', label: 'History', icon: History },
  ];

  const adminNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/service-requests', label: 'Service Requests', icon: ClipboardList },
  ];

  // 🔹 Choose which nav items to show based on user role
  const navItems = user?.role === 'admin' ? adminNavItems : userNavItems;

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen fixed left-0 top-0 z-10">
      {/* Header */}
      <div className="p-6 border-b border-gray-100">
        <h1 className="text-xl mt-3 font-bold text-gray-800">Portfolio Managment</h1>
        {user && (
          <p className="text-sm text-gray-500 mt-1">
            {user.role === 'admin' ? 'Administrator' : 'User'}
          </p>
        )}
      </div>

      {/* Navigation */}
      <nav className="px-3 mt-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            location.pathname === item.path ||
            location.pathname.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 mb-1 rounded-lg transition-all ${
                isActive
                  ? 'bg-blue-50 text-blue-600 font-semibold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Logout Button */}
      <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 w-full text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all"
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};
