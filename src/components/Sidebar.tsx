import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload as UploadIcon,
  History,
  LogOut,
  ClipboardList,
  MessageSquareMore,
  ArrowRightLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from './logo';

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
      await fetch(`${API_BASE}/logout`, {
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
    { path: '/comparison', label: 'Compare', icon: ArrowRightLeft },
    { path: '/service-requests', label: 'Requests', icon: MessageSquareMore },
  ];

  const adminNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      path: '/admin/service-requests',
      label: 'Requests',
      icon: ClipboardList,
    },
  ];

  const navItems = user?.role === 'admin' ? adminNavItems : userNavItems;

  /* ======================================================
     MOBILE NAV
  ====================================================== */
  if (isMobile) {
    return (
      <div className="flex justify-around items-center py-2 bg-white/90 border-t border-slate-200 backdrop-blur-md shadow-lg">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center text-xs ${
                isActive ? 'text-cyan-700' : 'text-slate-600'
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
            className="flex flex-col items-center text-xs text-slate-600"
          >
            <ClipboardList size={22} />
            <span className="text-[10px]">Audit</span>
          </Link>
        )}

        <button
          onClick={handleLogout}
          className="flex flex-col items-center text-xs text-slate-600"
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
    <aside className="w-72 bg-white/70 backdrop-blur-xl border-r border-white/60 min-h-screen fixed left-0 top-0 z-20 shadow-xl">
      <div className="p-6 border-b border-slate-200/70 space-y-4">
        <Logo className="w-full" />
        {user && (
          <div className="inline-flex items-center rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-800 border border-cyan-100">
            {user.role === 'admin' ? 'Admin Console' : 'Member Workspace'}
          </div>
        )}
      </div>

      <nav className="px-4 mt-5 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* Portfolio Audit */}
        <div className="mt-5 rounded-xl border border-slate-200/70 bg-white/70 p-2">
          {loadingPortfolio ? (
            <div className="px-4 py-3 text-slate-400">
              Loading audit…
            </div>
          ) : latestPortfolioId ? (
            <Link
              to={`/portfolio-audit/${latestPortfolioId}`}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                location.pathname.startsWith('/portfolio-audit')
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ClipboardList size={20} />
              <span>Audit Workspace</span>
            </Link>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 text-slate-400 cursor-not-allowed">
              <ClipboardList size={20} />
              <span>Audit Workspace</span>
            </div>
          )}
        </div>
      </nav>

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200/70">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 w-full text-slate-600 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all border border-slate-200 bg-white"
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};
