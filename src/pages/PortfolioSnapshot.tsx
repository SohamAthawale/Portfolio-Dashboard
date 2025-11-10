import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
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
} from 'recharts';
import { TrendingUp, Wallet, PieChart as PieIcon } from 'lucide-react';
import { HoldingsTable, Holding } from '../components/HoldingsTable';

interface MemberPortfolioData {
  label: string;
  member_id: number | null;
  summary: { total: number; equity: number; mf: number };
  holdings: Holding[];
}

interface TopItem {
  amc?: string;
  category?: string;
  value: number;
}

interface AllocationItem {
  category: string;
  value: number;
  percentage: number;
}

interface PortfolioSnapshotProps {
  portfolioId: number;
  members: MemberPortfolioData[];
  onClose: () => void;
}

const COLORS = [
  '#2563eb', '#16a34a', '#9333ea', '#f59e0b',
  '#ef4444', '#06b6d4', '#84cc16', '#a855f7',
  '#f97316', '#0ea5e9',
];

export const PortfolioSnapshot = ({ portfolioId, members, onClose }: PortfolioSnapshotProps) => {
  const [selectedMember, setSelectedMember] = useState<'all' | number | null>('all');
  const [topAmc, setTopAmc] = useState<TopItem[]>([]);
  const [topCategory, setTopCategory] = useState<TopItem[]>([]);
  const [assetAllocation, setAssetAllocation] = useState<AllocationItem[]>([]);
  const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

  // fetch analytics (top_amc, top_category, asset_allocation)
  useEffect(() => {
    const fetchExtraData = async () => {
      try {
        const res = await fetch(`${API_BASE}/portfolio/${portfolioId}/members`, {
          credentials: 'include',
        });
        const data = await res.json();
        if (res.ok) {
          setTopAmc(data.top_amc || []);
          setTopCategory(data.top_category || []);
          setAssetAllocation(data.asset_allocation || []);
        } else {
          console.error('API error:', data.error || 'unknown');
        }
      } catch (err) {
        console.error('Failed to load snapshot analytics:', err);
      }
    };
    fetchExtraData();
  }, [portfolioId]);

  // filter members
  const filteredMembers = useMemo(() => {
    if (selectedMember === 'all') return members;
    return members.filter((m) => m.member_id === selectedMember);
  }, [selectedMember, members]);

  // combine summaries
  const combinedSummary = filteredMembers.reduce(
    (acc, m) => ({
      total: acc.total + m.summary.total,
      equity: acc.equity + m.summary.equity,
      mf: acc.mf + m.summary.mf,
    }),
    { total: 0, equity: 0, mf: 0 }
  );

  const summaryCards = [
    { title: 'Total Value', value: combinedSummary.total, icon: TrendingUp, color: 'bg-blue-500' },
    { title: 'Equity', value: combinedSummary.equity, icon: Wallet, color: 'bg-green-500' },
    { title: 'Mutual Funds', value: combinedSummary.mf, icon: PieIcon, color: 'bg-purple-500' },
  ];

  // flatten holdings
  const allHoldings = filteredMembers.flatMap((m) =>
    m.holdings.map((h) => ({
      ...h,
      company: `${h.company} (${m.label})`,
    }))
  );

  // --- Custom label renderer for outside labels ---
  const renderDonutLabel = (entry: any, index: number) => {
    // entry contains: cx, cy, midAngle, outerRadius, payload (our data), percent
    // Some props are passed differently by recharts depending on version, so be defensive
    const cx = entry.cx ?? 0;
    const cy = entry.cy ?? 0;
    const midAngle = entry.midAngle ?? 0;
    const outerRadius = entry.outerRadius ?? 0;
    const payload = entry.payload ?? entry;
    const percent = (payload.percentage ?? (entry.percent ? entry.percent * 100 : 0));
    const name = payload.category ?? payload.name ?? '';

    const RAD = Math.PI / 180;
    // position labels slightly outside the outerRadius
    const labelRadius = outerRadius + 28;
    const x = cx + labelRadius * Math.cos(-midAngle * RAD);
    const y = cy + labelRadius * Math.sin(-midAngle * RAD);

    // Align text left or right depending on side
    const textAnchor = x > cx ? 'start' : 'end';
    const fill = COLORS[index % COLORS.length];

    return (
      <g key={`label-${index}`}>
        {/* optional connector line (short) */}
        <path
          d={`M ${cx + outerRadius * Math.cos(-midAngle * RAD)} ${cy + outerRadius * Math.sin(-midAngle * RAD)} L ${x} ${y}`}
          stroke={fill}
          strokeWidth={1}
          fill="none"
          opacity={0.8}
        />
        <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="middle" fontSize={14} fill={fill} fontWeight={600}>
          {name}: {Number(percent).toFixed(1)}%
        </text>
      </g>
    );
  };

  // formatted center total
  const formatRupee = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-7xl w-full h-[92vh] overflow-y-auto relative"
      >
        {/* close */}
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-xl">✕</button>

        <h2 className="text-2xl font-bold mb-2 text-gray-800">Portfolio #{portfolioId} Snapshot</h2>
        <p className="text-gray-500 mb-6">Historical portfolio breakdown with NAV, units, and analytics</p>

        {/* member filter */}
        <div className="flex flex-wrap gap-2 mb-6 border-b pb-3">
          <button
            onClick={() => setSelectedMember('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedMember === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            All Members
          </button>
          {members.map((m) => (
            <button
              key={m.member_id ?? m.label}
              onClick={() => setSelectedMember(m.member_id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedMember === m.member_id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {summaryCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <div key={i} className="bg-white shadow-md rounded-xl p-4 border border-gray-100 flex flex-col items-start">
                <div className={`p-3 rounded-lg ${card.color} mb-3`}><Icon className="text-white" size={22} /></div>
                <h3 className="text-gray-600 text-sm">{card.title}</h3>
                <p className="text-2xl font-bold text-gray-800">{formatRupee(card.value)}</p>
              </div>
            );
          })}
        </div>

        {/* charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Model Asset Allocation (donut with outside labels + center total) */}
          <div className="bg-white rounded-xl shadow p-6 flex flex-col items-center">
            <h3 className="text-lg font-semibold text-gray-800 mb-6 self-start">Model Asset Allocation</h3>

            <div className="w-full flex items-center justify-center">
              <div style={{ width: '60%', minWidth: 320, height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={assetAllocation as any}
                      dataKey="value"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={90}
                      outerRadius={120}
                      startAngle={90}
                      endAngle={-270}
                      paddingAngle={2}
                      labelLine={false}
                      label={(props: any) => renderDonutLabel(props, props.index)}
                    >
                      {(assetAllocation || []).map((_, i) => (
                        <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>

                    {/* Center total value */}
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                      <tspan className="text-gray-700" fontSize={20} fontWeight={700}>
                        {formatRupee(combinedSummary.total)}
                      </tspan>
                    </text>

                    <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`} />
                    {/* legend hidden because we're drawing labels outside */}
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top 10 AMCs */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 10 AMCs</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topAmc}>
                <XAxis dataKey="amc" tick={{ fontSize: 11 }}/>
                <YAxis  />
                <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`} />
                <Bar dataKey="value">
                  {topAmc.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top 10 Categories */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 10 Categories</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topCategory}>
                <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`} />
                <Bar dataKey="value">
                  {topCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* holdings table */}
        <HoldingsTable holdings={allHoldings} />
      </motion.div>
    </motion.div>
  );
};
