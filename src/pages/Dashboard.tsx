import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { ChartCard } from '../components/ChartCard';
import { HoldingsTable, Holding } from '../components/HoldingsTable';
import { TrendingUp, Wallet, PieChart, Briefcase, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

interface DashboardData {
  total_value: number;
  equity_value: number;
  mf_value: number;
  bonds_value: number;
  holdings: Holding[];
}

export const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { portfolio_id } = useParams(); // ✅ detect portfolio route

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // ✅ Decide endpoint dynamically
        const endpoint = portfolio_id
          ? `${API_BASE}/portfolio/${portfolio_id}`
          : `${API_BASE}/dashboard-data`;

        const response = await fetch(endpoint, {
          method: 'GET',
          credentials: 'include',
        });

        if (response.status === 401) {
          console.warn('⚠️ Session expired — redirecting to login');
          navigate('/login');
          return;
        }

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to fetch dashboard data.');
        }

        const result = await response.json();

        // Normalize holdings data
        const holdings: Holding[] = (result.holdings || []).map((h: any) => ({
          company: h.company || h.fund_name || 'Unknown',
          isin: h.isin || h.isin_no || 'N/A',
          quantity: 0,
          value: parseFloat(h.value || h.closing_balance || 0),
          category:
            h.category ||
            (h.company?.toLowerCase().includes('fund')
              ? 'Mutual Fund'
              : 'Equity'),
        }));

        const equity_value = holdings
          .filter((h) => h.category === 'Equity')
          .reduce((sum, h) => sum + h.value, 0);

        const mf_value = holdings
          .filter((h) => h.category === 'Mutual Fund')
          .reduce((sum, h) => sum + h.value, 0);

        const total_value =
          result.total_value || equity_value + mf_value + (result.bonds_value || 0);

        setData({
          total_value,
          equity_value,
          mf_value,
          bonds_value: result.bonds_value || 0,
          holdings,
        });
      } catch (err: any) {
        console.error('⚠️ Dashboard fetch error:', err);
        setError(err.message || 'Network error. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [navigate, portfolio_id]);

  // --- UI States ---
  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="text-center text-red-600 mt-12 font-medium">{error}</div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="text-center text-gray-600 mt-12">
          No data available. Try uploading an ECAS statement.
        </div>
      </Layout>
    );
  }

  // --- Summary Cards ---
  const summaryCards = [
    { title: 'Total Portfolio Value', value: data.total_value, icon: TrendingUp, color: 'blue' },
    { title: 'Equity Value', value: data.equity_value, icon: Wallet, color: 'green' },
    { title: 'Mutual Funds', value: data.mf_value, icon: PieChart, color: 'purple' },
    { title: 'Bonds Value', value: data.bonds_value, icon: Briefcase, color: 'orange' },
  ];

  const chartData = [
    { name: 'Equity', value: data.equity_value },
    { name: 'Mutual Funds', value: data.mf_value },
    { name: 'Bonds', value: data.bonds_value },
  ].filter((item) => item.value > 0);

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">
              {portfolio_id ? `Portfolio #${portfolio_id}` : 'Dashboard'}
            </h1>
            {user?.email && (
              <p className="text-sm text-gray-500 mt-1">
                Logged in as <span className="font-medium">{user.email}</span>
              </p>
            )}
          </div>
          <div className="text-sm text-gray-600">
            Last updated: {new Date().toLocaleDateString()}
          </div>
        </div>

        {/* Back Button for old portfolios */}
        {portfolio_id && (
          <button
            onClick={() => navigate('/history')}
            className="flex items-center gap-2 text-blue-600 hover:underline mt-2"
          >
            <ArrowLeft size={18} /> Back to History
          </button>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {summaryCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="bg-white rounded-xl shadow-md p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-lg ${colorMap[card.color]}`}>
                    <Icon className="text-white" size={24} />
                  </div>
                </div>
                <h3 className="text-sm font-medium text-gray-600 mb-1">{card.title}</h3>
                <p className="text-2xl font-bold text-gray-800">
                  ₹{card.value.toLocaleString('en-IN')}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Chart + Table */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-1"
          >
            <ChartCard data={chartData} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-2"
          >
            <HoldingsTable holdings={data.holdings} />
          </motion.div>
        </div>
      </div>
    </Layout>
  );
};
