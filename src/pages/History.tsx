import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, TrendingUp, Eye, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PortfolioSnapshot } from '../pages/PortfolioSnapshot'; // ✅ dashboard modal

interface HistoryItem {
  portfolio_id: number;
  upload_date: string;
  total_value: number;
  member_count?: number;
  members?: string[];
}

interface MemberPortfolioData {
  label: string;
  member_id: number | null;
  summary: { total: number; equity: number; mf: number };
  holdings: { company: string; isin: string; value: number; category: string }[];
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

export const History = () => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberPortfolios, setMemberPortfolios] = useState<MemberPortfolioData[]>([]);
  const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const navigate = useNavigate();

  // 🔹 Fetch history list
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`${API_BASE}/history-data`, { credentials: 'include' });
        if (res.status === 401) return navigate('/login');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch history');
        setHistory(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('❌ History fetch error:', err);
        setError('Unable to load portfolio history. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, [navigate]);

  // 🔹 Delete portfolio
  const handleDelete = async (portfolioId: number) => {
    if (!window.confirm(`Delete portfolio #${portfolioId}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/delete-portfolio/${portfolioId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const result = await res.json();
      if (!res.ok) return alert(result.error || 'Failed to delete portfolio.');
      alert('✅ Portfolio deleted successfully');
      setHistory((prev) => prev.filter((p) => p.portfolio_id !== portfolioId));
    } catch (err) {
      console.error('❌ Delete failed:', err);
      alert('Network error. Please try again.');
    }
  };

  // 🔹 View portfolio snapshot
  const handleViewSnapshot = async (portfolioId: number) => {
    try {
      const res = await fetch(`${API_BASE}/portfolio/${portfolioId}/members`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load snapshot');
      setMemberPortfolios(data.members || []);
      setSelectedPortfolioId(portfolioId);
      setIsSnapshotOpen(true);
    } catch (err) {
      console.error('❌ Snapshot load error:', err);
      alert('Failed to load snapshot. Please try again.');
    }
  };

  // ---------- UI ----------
  if (isLoading)
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );

  if (error)
    return (
      <Layout>
        <div className="text-center text-red-600 mt-16 font-medium">{error}</div>
      </Layout>
    );

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Portfolio History</h1>
          <p className="text-gray-600">View, analyze, or delete previous PMS uploads</p>
        </div>

        {history.length === 0 ? (
          <div className="text-center text-gray-500 mt-16">
            No uploads found. Try uploading an ECAS statement.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {history.map((item, i) => (
              <motion.div
                key={item.portfolio_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="bg-white rounded-2xl shadow-lg p-6 flex flex-col justify-between hover:shadow-xl transition-all"
              >
                <div>
                  <div className="flex items-center gap-2 text-gray-500 mb-2">
                    <Calendar className="text-blue-500" size={18} />
                    <span className="text-sm font-medium">Upload Date</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-800 mb-4">
                    {new Date(item.upload_date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>

                  <div className="flex items-center gap-2 text-gray-500 mb-2">
                    <TrendingUp className="text-green-500" size={18} />
                    <span className="text-sm font-medium">Total Value</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mb-4">
                    ₹{item.total_value.toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>

                  {item.members?.length ? (
                    <p className="text-sm text-gray-600">
                      👨‍👩‍👧 {item.member_count} Member
                      {item.member_count! > 1 ? 's' : ''}: {item.members.join(', ')}
                    </p>
                  ) : null}
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => handleViewSnapshot(item.portfolio_id)}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white font-medium py-2 rounded-lg hover:bg-blue-700 active:scale-95 transition-all"
                  >
                    <Eye size={18} /> View
                  </button>

                  <button
                    onClick={() => handleDelete(item.portfolio_id)}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white font-medium py-2 rounded-lg hover:bg-red-700 active:scale-95 transition-all"
                  >
                    <Trash2 size={18} /> Delete
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* 🟦 Snapshot Dashboard Modal */}
      <AnimatePresence>
        {isSnapshotOpen && selectedPortfolioId && memberPortfolios.length > 0 && (
          <PortfolioSnapshot
            portfolioId={selectedPortfolioId}
            members={memberPortfolios}
            onClose={() => setIsSnapshotOpen(false)}
          />
        )}
      </AnimatePresence>
    </Layout>
  );
};
