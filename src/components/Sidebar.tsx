import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload as UploadIcon,
  History,
  LogOut,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '/pmsreports';

interface SidebarProps {
  isMobile?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobile = false }) => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const [latestPortfolioId, setLatestPortfolioId] = useState<number | null>(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);

  /* ======================================================
     Fetch latest portfolio from DB
  ====================================================== */
  useEffect(() => {
    const fetchLatestPortfolio = async () => {
      try {
        const res = await fetch(`${API_BASE}/portfolio/latest`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setLatestPortfolioId(data.portfolio_id);
        }
      } catch (err) {
        console.error('❌ Failed to fetch latest portfolio:', err);
      } finally {
        setLoadingPortfolio(false);
      }
    };

    fetchLatestPortfolio();
  }, []);

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

  const userNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/upload', label: 'Upload', icon: UploadIcon },
    { path: '/history', label: 'History', icon: History },
  ];

  const adminNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      path: '/admin/service-requests',
      label: 'Service Requests',
      icon: ClipboardList,
    },
    {
      path: '/admin/pending-registrations',
      label: 'Pending Registrations',
      icon: ClipboardList,
    },
  ];

  const navItems = user?.role === 'admin' ? adminNavItems : userNavItems;

  /* ======================================================
     MOBILE NAV
  ====================================================== */
  if (isMobile) {
    return (
      <div className="flex justify-around items-center py-2 bg-white border-t shadow-md">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center text-xs ${
                isActive ? 'text-blue-600' : 'text-gray-600'
              }`}
            >
              <Icon size={22} />
              <span className="text-[10px]">{item.label}</span>
            </Link>
          );
        })}

        {/* Portfolio Audit */}
        {!loadingPortfolio && latestPortfolioId && (
          <Link
            to={`/portfolio-audit/${latestPortfolioId}`}
            className="flex flex-col items-center text-xs text-gray-600"
          >
            <ClipboardList size={22} />
            <span className="text-[10px]">Audit</span>
          </Link>
        )}

        <button
          onClick={handleLogout}
          className="flex flex-col items-center text-xs text-gray-600"
        >
          <LogOut size={22} />
          <span className="text-[10px]">Logout</span>
        </button>
      </div>
    );
  }

  /* ======================================================
     DESKTOP SIDEBAR
  ====================================================== */
  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen fixed left-0 top-0 z-10">
      <div className="p-6 border-b border-gray-100">
        <h1 className="text-xl mt-3 font-bold text-gray-800">
          Portfolio Management
        </h1>
        {user && (
          <p className="text-sm text-gray-500 mt-1">
            {user.role === 'admin' ? 'Administrator' : 'User'}
          </p>
        )}
      </div>

      <nav className="px-3 mt-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
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

        {/* Portfolio Audit */}
        <div className="mt-4">
          {loadingPortfolio ? (
            <div className="px-4 py-3 text-gray-400">
              Loading audit…
            </div>
          ) : latestPortfolioId ? (
            <Link
              to={`/portfolio-audit/${latestPortfolioId}`}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                location.pathname.startsWith('/portfolio-audit')
                  ? 'bg-blue-50 text-blue-600 font-semibold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <ClipboardList size={20} />
              <span>Portfolio Audit</span>
            </Link>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 text-gray-400 cursor-not-allowed">
              <ClipboardList size={20} />
              <span>Portfolio Audit</span>
            </div>
          )}
        </div>
      </nav>

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
