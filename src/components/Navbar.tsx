import { useAuth } from '../context/AuthContext';
import { User } from 'lucide-react';

export const Navbar = () => {
  const { user } = useAuth();

  return (
    <header className="bg-white border-b border-gray-200 h-16 fixed top-0 right-0 left-64 z-10">
      <div className="h-full px-6 flex items-center justify-end">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
            <User size={18} className="text-gray-600" />
            <span className="text-sm font-medium text-gray-700">{user?.email}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
