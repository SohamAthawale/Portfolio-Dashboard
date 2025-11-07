import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { HoldingsTable, Holding } from '../components/HoldingsTable';
import {
  TrendingUp,
  Wallet,
  PieChart as PieChartIcon,
  Briefcase,
  ChevronDown,
  Users,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
} from 'recharts';
import { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

interface DashboardSummary {
  total_invested: number;
  current_value: number;
  profit: number;
  profit_percent: number;
}

interface DashboardData {
  summary: DashboardSummary;
  asset_allocation: { category: string; value: number; percentage: number }[];
  top_amc: { amc: string; value: number }[];
  top_category: { category: string; value: number }[];
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
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(['user']);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#0ea5e9'];

  // --- Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!dropdownRef.current || !target) return;
      if (!dropdownRef.current.contains(target)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Fetch family members
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await fetch(`${API_BASE}/family/members`, { credentials: 'include' });
        if (res.ok) setFamilyMembers(await res.json());
      } catch (err) {
        console.warn('⚠️ Could not fetch family members', err);
      }
    };
    fetchMembers();
  }, []);

  // --- Fetch dashboard data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const includeUser = selectedIds.includes('user');
        const memberIds = selectedIds.filter((id) => id !== 'user').join(',');

        const params = new URLSearchParams();
        params.append('include_user', includeUser ? 'true' : 'false');
        if (memberIds) params.append('members', memberIds);

        const res = await fetch(`${API_BASE}/dashboard-data?${params.toString()}`, {
          credentials: 'include',
        });
        if (res.status === 401) return navigate('/login');
        if (!res.ok) throw new Error('Failed to fetch dashboard data');

        const result = await res.json();
        setData(result);
      } catch (err: any) {
        console.error(err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [selectedIds]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

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

  if (!data)
    return (
      <Layout>
        <div className="text-center text-gray-600 mt-12">
          No data available. Try uploading an ECAS statement.
        </div>
      </Layout>
    );

  const { summary, asset_allocation, top_amc, top_category, holdings } = data;

  const summaryCards = [
    { title: 'Invested Value', value: summary.total_invested, icon: Wallet, color: 'green' },
    { title: 'Current Value', value: summary.current_value, icon: TrendingUp, color: 'blue' },
    { title: 'Profit / Loss', value: summary.profit, icon: Briefcase, color: summary.profit >= 0 ? 'green' : 'red' },
    { title: 'Return %', value: summary.profit_percent, icon: PieChartIcon, color: 'purple' },
  ];

  const selectedText =
    selectedIds.length === 1 && selectedIds.includes('user')
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

          <div className="relative inline-block text-left" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white hover:bg-gray-50"
            >
              <Users size={16} />
              <span>{selectedText}</span>
              <ChevronDown size={16} />
            </button>
            {dropdownOpen && (
              <div className="absolute mt-2 w-64 bg-white border rounded-md shadow-lg z-50">
                <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes('user')}
                      onChange={() => toggleSelection('user')}
                    />
                    My Holdings
                  </label>
                  <div className="border-t my-2"></div>
                  {familyMembers.map((m) => {
                    const id = m.id ?? m.member_id;
                    return (
                      <label key={id} className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(String(id))}
                          onChange={() => toggleSelection(String(id))}
                        />
                        {m.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {summaryCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                <div className="bg-white rounded-xl shadow p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-3 rounded-lg bg-gray-100">
                      <Icon className={`text-${card.color}-500`} size={24} />
                    </div>
                  </div>
                  <h3 className="text-sm font-medium text-gray-600 mb-1">{card.title}</h3>
                  <p className="text-2xl font-bold text-gray-800">
                    {card.title === 'Return %'
                      ? `${card.value.toFixed(2)}%`
                      : `₹${card.value.toLocaleString('en-IN')}`}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-8">
          {/* Donut Chart */}
          <div className="bg-white rounded-xl shadow p-6 flex flex-col items-center justify-center">
            <h3 className="text-lg font-semibold text-gray-700 mb-4 self-start">
              Model Asset Allocation
            </h3>
            <div className="w-full h-[28rem]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={asset_allocation}
                    dataKey="percentage"
                    nameKey="category"
                    outerRadius={130}
                    innerRadius={80}
                    labelLine={false}
                    label={(props) => {
                      const name = props.name ?? '';
                      const percent =
                        typeof props.percent === 'number' ? (props.percent * 100).toFixed(1) : '0';
                      return `${name}: ${percent}%`;
                    }}
                  >

                    {asset_allocation.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>

                  {/* Center total value */}
                  <text
                    x="50%"
                    y="50%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-lg font-semibold fill-gray-700"
                  >
                    ₹{summary.current_value.toLocaleString('en-IN')}
                  </text>

                  <Tooltip
                    formatter={(_value: ValueType, _name: NameType, props) => {
                      const category = props?.payload?.category ?? '';
                      const rupees =
                        props?.payload?.value &&
                        `₹${props.payload.value.toLocaleString('en-IN')}`;
                      return [rupees, category];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right Column: Bar Charts */}
          <div className="flex flex-col gap-8">
            {/* Top 10 AMC */}
            <div className="bg-white rounded-xl shadow p-6 flex-1">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Top 10 AMC</h3>
              <div className="w-full h-[20rem]">
                <ResponsiveContainer width="100%">
                  <BarChart
                    layout="vertical"
                    data={top_amc}
                    margin={{ top: 10, right: 40, left: 120, bottom: 10 }}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis
                      dataKey="amc"
                      type="category"
                      width={150}
                      tickLine={false}
                      axisLine={false}
                      tick={({ x, y, payload }) => (
                        <text
                          x={x - 10}
                          y={y + 4}
                          textAnchor="end"
                          fill="#374151"
                          fontSize={12}
                        >
                          {payload?.value || ''}
                        </text>
                      )}
                    />
                    <Tooltip
                      formatter={(value: ValueType) => {
                        const v = typeof value === 'number' ? value : Number(value);
                        return `₹${v.toLocaleString('en-IN')}`;
                      }}
                    />
                    <Bar dataKey="value" fill="#2563eb" barSize={28} radius={[4, 4, 4, 4]}>
                      <LabelList
                        dataKey="value"
                        position="right"
                        formatter={(label: React.ReactNode) => {
                          const v = typeof label === 'number' ? label : Number(label ?? 0);
                          return `₹${v.toLocaleString('en-IN')}`;
                        }}
                        fontSize={11}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top 10 Categories */}
            <div className="bg-white rounded-xl shadow p-6 flex-1">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">
                Top 10 Categories (MF)
              </h3>
              <div className="w-full h-[20rem]">
                <ResponsiveContainer width="100%">
                  <BarChart
                    layout="vertical"
                    data={top_category}
                    margin={{ top: 10, right: 40, left: 120, bottom: 10 }}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis
                      dataKey="category"
                      type="category"
                      width={150}
                      tickLine={false}
                      axisLine={false}
                      tick={({ x, y, payload }) => (
                        <text
                          x={x - 10}
                          y={y + 4}
                          textAnchor="end"
                          fill="#374151"
                          fontSize={12}
                        >
                          {payload?.value || ''}
                        </text>
                      )}
                    />
                    <Tooltip
                      formatter={(value: ValueType) => {
                        const v = typeof value === 'number' ? value : Number(value);
                        return `₹${v.toLocaleString('en-IN')}`;
                      }}
                    />
                    <Bar dataKey="value" fill="#6b7280" barSize={28} radius={[4, 4, 4, 4]}>
                      <LabelList
                        dataKey="value"
                        position="right"
                        formatter={(label: React.ReactNode) => {
                          const v = typeof label === 'number' ? label : Number(label ?? 0);
                          return `₹${v.toLocaleString('en-IN')}`;
                        }}
                        fontSize={11}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Holdings Table */}
        <div className="bg-white rounded-xl shadow p-6">
          <HoldingsTable holdings={holdings} />
        </div>
      </div>
    </Layout>
  );
};
