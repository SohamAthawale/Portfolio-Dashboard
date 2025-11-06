import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { ChartCard } from '../components/ChartCard';
import { HoldingsTable, Holding } from '../components/HoldingsTable';
import {
  TrendingUp,
  Wallet,
  PieChart,
  Briefcase,
  ChevronDown,
  Users,
} from 'lucide-react';
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

interface FamilyMember {
  id?: number;
  member_id?: number;
  name: string;
  email?: string;
}

export const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(['user']); // default user
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  // 🔹 Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!dropdownRef.current || !target) return;
      if (!dropdownRef.current.contains(target)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 🔹 Fetch family members
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await fetch(`${API_BASE}/family/members`, {
          credentials: 'include',
        });
        if (res.ok) {
          const members = await res.json();
          setFamilyMembers(members || []);
        }
      } catch (err) {
        console.warn('⚠️ Could not fetch family members', err);
      }
    };
    fetchMembers();
  }, []);

  // 🔹 Fetch dashboard data
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const includeUser = selectedIds.includes('user');
        const memberIds = selectedIds.filter((id) => id !== 'user').join(',');

        const params = new URLSearchParams();
        params.append('include_user', includeUser ? 'true' : 'false');
        if (memberIds) params.append('members', memberIds);

        const url = `${API_BASE}/dashboard-data?${params.toString()}`;
        console.log('📡 Fetching:', url);

        const response = await fetch(url, { credentials: 'include' });
        if (response.status === 401) {
          navigate('/login');
          return;
        }

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to fetch dashboard data.');
        }

        const result = await response.json();

        const holdings: Holding[] = (result.holdings || []).map((h: any) => ({
          company: h.company || h.fund_name || 'Unknown',
          isin: h.isin || h.isin_no || 'N/A',
          quantity: 0,
          value: parseFloat(h.value || h.closing_balance || 0),
          category:
            h.category ||
            (h.company?.toLowerCase().includes('fund') ? 'Mutual Fund' : 'Equity'),
        }));

        const equity_value = holdings
          .filter((h) => h.category === 'Equity')
          .reduce((sum, h) => sum + h.value, 0);

        const mf_value = holdings
          .filter((h) => h.category === 'Mutual Fund')
          .reduce((sum, h) => sum + h.value, 0);

        setData({
          total_value: result.total_value || equity_value + mf_value,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  // 🔹 Toggle dropdown selection
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      return Array.from(new Set(next)).sort();
    });
  };

  // 🔹 Handle loading / error / empty states
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
        <div className="text-center text-red-600 mt-12 font-medium">{error}</div>
      </Layout>
    );

  // 🧠 When no data selected at all
  const includeUser = selectedIds.includes('user');
  const hasMembers = selectedIds.some((id) => id !== 'user');

  if (!includeUser && !hasMembers) {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center h-[70vh] space-y-6">
        {/* 🔽 Always show dropdown */}
        <div className="relative inline-block text-left" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white hover:bg-gray-50 focus:outline-none"
          >
            <Users size={16} />
            <span>Viewing 0 Portfolios</span>
            <ChevronDown size={16} />
          </button>

          {dropdownOpen && (
            <div className="absolute mt-2 w-64 bg-white border rounded-md shadow-lg z-50">
              <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                {/* User */}
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes('user')}
                    onChange={() => toggleSelection('user')}
                  />
                  My Holdings
                </label>

                <div className="border-t my-2"></div>

                {/* Family Members */}
                {familyMembers.length === 0 && (
                  <p className="text-gray-500 text-sm">No family members added.</p>
                )}
                {[...familyMembers]
                  .sort((a, b) =>
                    (a.id ?? a.member_id ?? 0) - (b.id ?? b.member_id ?? 0)
                  )
                  .map((m) => {
                    const memberId = m.id ?? m.member_id;
                    if (!memberId) return null;
                    return (
                      <label
                        key={memberId}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(memberId.toString())}
                          onChange={() => toggleSelection(memberId.toString())}
                        />
                        {m.name}
                      </label>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Message */}
        <p className="text-gray-600 text-center text-sm mt-4">
          No portfolios selected. Use the dropdown to view holdings.
        </p>
      </div>
    </Layout>
  );
}


  if (!data)
    return (
      <Layout>
        <div className="text-center text-gray-600 mt-12">
          No data available. Try uploading an ECAS statement.
        </div>
      </Layout>
    );

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
  ].filter((i) => i.value > 0);

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
  };

  const selectedText =
    selectedIds.length === 0
      ? 'Viewing 0 Portfolios'
      : selectedIds.length === 1 && selectedIds.includes('user')
      ? 'My Holdings'
      : `Viewing ${selectedIds.length} Portfolios`;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
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

        {/* Dropdown Filter */}
        <div className="relative inline-block text-left" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white hover:bg-gray-50 focus:outline-none"
          >
            <Users size={16} />
            <span>{selectedText}</span>
            <ChevronDown size={16} />
          </button>

          {dropdownOpen && (
            <div className="absolute mt-2 w-64 bg-white border rounded-md shadow-lg z-50">
              <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                {/* User */}
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes('user')}
                    onChange={() => toggleSelection('user')}
                  />
                  My Holdings
                </label>

                <div className="border-t my-2"></div>

                {/* Family Members */}
                {familyMembers.length === 0 && (
                  <p className="text-gray-500 text-sm">No family members added.</p>
                )}
                {[...familyMembers]
                  .sort((a, b) =>
                    (a.id ?? a.member_id ?? 0) - (b.id ?? b.member_id ?? 0)
                  )
                  .map((m) => {
                    const memberId = m.id ?? m.member_id;
                    if (!memberId) return null;
                    return (
                      <label
                        key={memberId}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(memberId.toString())}
                          onChange={() => toggleSelection(memberId.toString())}
                        />
                        {m.name}
                      </label>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {summaryCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.1 }}
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
