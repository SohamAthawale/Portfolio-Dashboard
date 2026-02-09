import { useAuth } from '../context/AuthContext';
import { User, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Navbar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleProfileClick = () => {
    navigate(user?.role === 'admin' ? '/admin' : '/pmsreports/profile');
  };

  return (
    <header className="h-16 fixed top-0 right-0 left-0 lg:left-72 z-20">
      <div className="h-full px-4 sm:px-6 flex items-center justify-between border-b border-white/50 bg-white/70 backdrop-blur-xl shadow-sm">
        <div className="hidden md:flex items-center gap-2 rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
          <Sparkles size={14} />
          Smart Portfolio Workspace
        </div>

        <div className="flex items-center gap-3 ml-auto">
          {user?.role && (
            <span className="hidden sm:inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              {user.role}
            </span>
          )}
          <button
            onClick={handleProfileClick}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:border-cyan-300 hover:bg-cyan-50 rounded-xl transition shadow-sm"
          >
            <User size={18} className="text-slate-600" />
            <span className="text-sm font-medium text-slate-700 truncate max-w-[180px]">
              {user?.email}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
