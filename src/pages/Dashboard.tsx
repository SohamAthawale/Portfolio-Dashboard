// src/pages/Dashboard.tsx
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
  Download
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

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import Logo from '../components/logo';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

interface DashboardSummary {
  invested_value_mf: number;
  current_value_mf: number;
  profit_mf: number;
  profit_percent_mf: number;
  equity_value: number;
  total_portfolio_value: number;
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

const ICON_COLOR_MAP: Record<string, string> = {
  green: '#10b981',
  blue: '#2563eb',
  purple: '#8b5cf6',
  red: '#ef4444',
};

export const Dashboard = () => {
  // ---------- logic (unchanged) ----------
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

  // PDF export
  const downloadPDF = async () => {
    const element = document.getElementById("dashboard-pdf");
    if (!element) return;

    const canvas = await html2canvas(element, {
      scale: 1.2,
      useCORS: true,
      scrollY: -window.scrollY
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.85);
    const pdf = new jsPDF("p", "mm", "a4");

    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save("Dashboard.pdf");
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!dropdownRef.current || !target) return;
      if (!dropdownRef.current.contains(target)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // ---------- loading / error states (unchanged) ----------
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

  // ---------- safe data (unchanged) ----------
  const { summary, asset_allocation, top_amc, top_category, holdings } = data;

  const safeSummary: DashboardSummary = {
    invested_value_mf: summary?.invested_value_mf ?? 0,
    current_value_mf: summary?.current_value_mf ?? 0,
    profit_mf: summary?.profit_mf ?? 0,
    profit_percent_mf: summary?.profit_percent_mf ?? 0,
    equity_value: summary?.equity_value ?? 0,
    total_portfolio_value: summary?.total_portfolio_value ?? 0,
  };

  const safeAssetAlloc = Array.isArray(asset_allocation) ? asset_allocation : [];
  const safeTopAMC = Array.isArray(top_amc) ? top_amc : [];
  const safeTopCategory = Array.isArray(top_category) ? top_category : [];
  const safeHoldings = Array.isArray(holdings) ? holdings : [];

  const summaryCards = [
    {
      title: 'Invested Value (MF)',
      value: safeSummary.invested_value_mf,
      icon: Wallet,
      color: 'green',
    },
    {
      title: 'Current Value (Total)',
      value: safeSummary.total_portfolio_value,
      subValues: [
        { label: 'MF', value: safeSummary.current_value_mf },
        { label: 'Shares', value: safeSummary.equity_value },
      ],
      icon: TrendingUp,
      color: 'blue',
    },
    {
      title: 'Profit (MF)',
      value: safeSummary.profit_mf,
      icon: Briefcase,
      color: safeSummary.profit_mf >= 0 ? 'green' : 'red',
    },
    {
      title: 'Return % (MF)',
      value: safeSummary.profit_percent_mf,
      icon: PieChartIcon,
      color: 'purple',
    },
  ];

  const selectedText =
    selectedIds.length === 1 && selectedIds.includes('user')
      ? 'My Holdings'
      : `Viewing ${selectedIds.length} Portfolios`;

  // ---------- UI: final requested layout (B - medium sizes) ----------
  // NOTES on alignment:
  // - Use consistent left Y-axis width across vertical BarCharts for perfect alignment.
  // - Increase right margin (tooltip space) and bottom margin (x-axis tick area).
  const CHART_LEFT_Y_WIDTH = 180; // consistent width for YAxis to align charts
  const CHART_RIGHT_MARGIN = 90;
  const CHART_BOTTOM_MARGIN = 40;

  return (
    <Layout>
      <div id="dashboard-pdf" className="p-6 bg-white space-y-8 text-gray-800">

        {/* Header (HDFC-style minimal) */}
        <div className="flex items-start justify-between">
          
          {/* LEFT SIDE: Logo + Titles */}
          <div className="flex items-center gap-4">
            <Logo className="w-40 h-auto" />

            <div>
              <div className="text-xl font-semibold">Summary Report</div>
            </div>
          </div>

          {/* RIGHT SIDE: Customer + Date */}
          <div className="text-right text-sm">
            <div className="mb-1">
              <span className="font-medium">Customer Name:</span> {user?.email ?? '-'}
            </div>
            <div className="text-xs text-gray-500">
              {new Date().toLocaleDateString('en-GB')}
            </div>
          </div>
        </div>

        <hr className="border-t border-gray-300" />

        {/* Buttons + user selection row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={downloadPDF}
              className="inline-flex items-center gap-2 px-3 py-2 border border-gray-400 text-sm rounded-sm bg-white hover:bg-gray-50"
            >
              <Download size={14} /> Download PDF
            </button>

            <button
              onClick={() => navigate('/service-requests')}
              className="inline-flex items-center gap-2 px-3 py-2 border border-gray-400 text-sm rounded-sm bg-white hover:bg-gray-50"
            >
              Raise Service Request
            </button>
          </div>

          <div className="relative inline-block text-left" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 px-3 py-2 border border-gray-400 text-sm rounded-sm bg-white hover:bg-gray-50"
            >
              <Users size={14} />
              <span>{selectedText}</span>
              <ChevronDown size={14} />
            </button>

            {dropdownOpen && (
              <div className="absolute mt-2 w-64 bg-white border border-gray-300 rounded-sm z-50 shadow-sm">
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
                      <label
                        key={id}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
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

        {/* Summary Row (thin bordered boxes) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryCards.map((card, i) => {
            const Icon = card.icon;
            const iconColor = ICON_COLOR_MAP[card.color] ?? ICON_COLOR_MAP.blue;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <div className="border border-gray-300 p-4 flex items-center gap-4 min-h-[84px]">
                  <div className="flex items-center justify-center w-12 h-12 border border-gray-300">
                    <Icon size={22} style={{ color: iconColor }} />
                  </div>

                  <div className="flex-1">
                    <div className="text-xs text-gray-600">{card.title}</div>
                    <div className="text-xl font-semibold text-gray-900">
                      {card.title.includes('%')
                        ? `${card.value.toFixed(2)}%`
                        : `₹${card.value.toLocaleString('en-IN')}`}
                    </div>

                    {card.subValues && card.subValues.length > 0 && (
                      <div className="mt-1 text-xs text-gray-500">
                        {card.subValues.map((sub, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span>{sub.label}</span>
                            <span>₹{sub.value.toLocaleString('en-IN')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* TOP SECTION (FULL WIDTH) */}
        <div className="space-y-6">
          {/* Model Asset Allocation */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Model Asset Allocation</h3>
            <div className="w-full" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={safeAssetAlloc}
                  margin={{ top: 20, right: CHART_RIGHT_MARGIN, left: CHART_LEFT_Y_WIDTH, bottom: CHART_BOTTOM_MARGIN }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    // show ticks with percent label
                    tickFormatter={(val) => `${Number(val).toFixed(0)}%`}
                  />
                  <YAxis
                    dataKey="category"
                    type="category"
                    width={CHART_LEFT_Y_WIDTH}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: ValueType) => `${Number(value).toFixed(2)}%`}
                    wrapperStyle={{ zIndex: 10000, pointerEvents: 'none' }}
                    contentStyle={{ borderRadius: 6 }}
                  />
                  <Bar dataKey="percentage" barSize={18}>
                    {safeAssetAlloc.map((_, idx) => (
                      <Cell key={`asset-${idx}`} fill={COLORS[idx % COLORS.length]} />
                    ))}
                    <LabelList
                      dataKey="percentage"
                      position="right"
                      formatter={(label) => `${Number(label ?? 0).toFixed(2)}%`}
                      fontSize={12}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Asset/Product Allocation - PIE (centered) */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Asset/Product Allocation (All Products)</h3>
            <div className="w-full flex justify-center" style={{ height: 340 }}>
              {/* Increased width to give pie room */}
              <div style={{ width: '70%', height: '100%', minWidth: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={safeAssetAlloc}
                      dataKey="percentage"
                      outerRadius={115}
                      innerRadius={55}
                      paddingAngle={2}
                      nameKey="category"
                      labelLine={true}
                      // Option A: category + percentage
                      label={({ payload, percent }: any) => {
                        const pct = typeof percent === 'number' ? (percent * 100).toFixed(1) : '0.0';
                        return `${payload?.category ?? ''}: ${pct}%`;
                      }}
                    >
                      {safeAssetAlloc.map((_, i) => (
                        <Cell key={`pie-${i}`} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>

                    {/* center total */}
                    <text
                      x="50%"
                      y="52%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="text-sm font-semibold"
                      fill="#1f2937"
                    >
                      ₹{safeSummary.total_portfolio_value.toLocaleString('en-IN')}
                    </text>

                    <Tooltip
                      formatter={(_value: ValueType, _name: NameType, props: any) => {
                        const payload = props?.payload ?? {};
                        const pct = typeof payload?.percentage === 'number' ? `${payload.percentage.toFixed(2)}%` : '';
                        const val = typeof payload?.value === 'number' ? `₹${payload.value.toLocaleString('en-IN')}` : '';
                        return [`${pct}${val ? ` • ${val}` : ''}`, payload?.category ?? ''];
                      }}
                      wrapperStyle={{ zIndex: 10000, pointerEvents: 'none' }}
                      contentStyle={{ borderRadius: 6 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION (two columns side-by-side) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Top 10 AMC (MF) - height: 300px */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Top 10 AMC (MF)</h3>
            <div className="w-full" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={safeTopAMC}
                  margin={{ top: 20, right: CHART_RIGHT_MARGIN, left: CHART_LEFT_Y_WIDTH, bottom: CHART_BOTTOM_MARGIN }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    height={40}
                    tickFormatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`}
                  />
                  <YAxis
                    dataKey="amc"
                    type="category"
                    width={CHART_LEFT_Y_WIDTH}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: ValueType) => `₹${Number(value).toLocaleString('en-IN')}`}
                    wrapperStyle={{ zIndex: 10000, pointerEvents: 'none' }}
                    contentStyle={{ borderRadius: 6 }}
                  />
                  <Bar dataKey="value" barSize={18}>
                    {safeTopAMC.map((_, i) => (
                      <Cell key={`amc-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={(label) => `₹${Number(label ?? 0).toLocaleString('en-IN')}`}
                      fontSize={12}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right: Top 10 Categories (MF) - height: 300px */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Top 10 Categories (MF)</h3>
            <div className="w-full" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={safeTopCategory}
                  margin={{ top: 20, right: CHART_RIGHT_MARGIN, left: CHART_LEFT_Y_WIDTH, bottom: CHART_BOTTOM_MARGIN }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    height={40}
                    tickFormatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`}
                  />
                  <YAxis
                    dataKey="category"
                    type="category"
                    width={CHART_LEFT_Y_WIDTH}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: ValueType) => `₹${Number(value).toLocaleString('en-IN')}`}
                    wrapperStyle={{ zIndex: 10000, pointerEvents: 'none' }}
                    contentStyle={{ borderRadius: 6 }}
                  />
                  <Bar dataKey="value" barSize={18}>
                    {safeTopCategory.map((_, i) => (
                      <Cell key={`cat-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={(label) => `₹${Number(label ?? 0).toLocaleString('en-IN')}`}
                      fontSize={12}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Holdings Table (bottom) */}
        <div className="pt-4 border-t border-gray-200">
          <HoldingsTable holdings={safeHoldings} />
        </div>

      </div>
    </Layout>
  );
};

export default Dashboard;
