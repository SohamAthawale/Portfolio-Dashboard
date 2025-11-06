import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Wallet, PieChart as PieIcon } from 'lucide-react';
import { HoldingsTable, Holding } from '../components/HoldingsTable'; // ✅ Correct path

interface MemberPortfolioData {
  label: string;
  member_id: number | null;
  summary: { total: number; equity: number; mf: number };
  holdings: Holding[];
}

interface PortfolioSnapshotProps {
  portfolioId: number;
  members: MemberPortfolioData[];
  onClose: () => void;
}

const COLORS = ['#2563eb', '#16a34a', '#9333ea', '#f59e0b'];

export const PortfolioSnapshot = ({ portfolioId, members, onClose }: PortfolioSnapshotProps) => {
  const [selectedMember, setSelectedMember] = useState<'all' | number | null>('all');

  // 🧠 Filter holdings by member
  const filteredMembers = useMemo(() => {
    if (selectedMember === 'all') return members;
    return members.filter((m) => m.member_id === selectedMember);
  }, [selectedMember, members]);

  // 🧩 Combine summaries for chart + totals
  const combinedSummary = filteredMembers.reduce(
    (acc, m) => ({
      total: acc.total + m.summary.total,
      equity: acc.equity + m.summary.equity,
      mf: acc.mf + m.summary.mf,
    }),
    { total: 0, equity: 0, mf: 0 }
  );

  const chartData = [
    { name: 'Equity', value: combinedSummary.equity },
    { name: 'Mutual Funds', value: combinedSummary.mf },
  ];

  const summaryCards = [
    { title: 'Total Value', value: combinedSummary.total, icon: TrendingUp, color: 'bg-blue-500' },
    { title: 'Equity', value: combinedSummary.equity, icon: Wallet, color: 'bg-green-500' },
    { title: 'Mutual Funds', value: combinedSummary.mf, icon: PieIcon, color: 'bg-purple-500' },
  ];

  // 🧩 Flatten holdings from filtered members
  const allHoldings = filteredMembers.flatMap((m) =>
    m.holdings.map((h) => ({
      ...h,
      company: `${h.company} (${m.label})`,
    }))
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-6xl w-full h-[90vh] overflow-y-auto relative"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>

        <h2 className="text-2xl font-bold mb-2 text-gray-800">
          Portfolio #{portfolioId} Snapshot
        </h2>
        <p className="text-gray-500 mb-6">
          Historical portfolio composition with member-wise filtering
        </p>

        {/* 🧩 Member Filter */}
        <div className="flex flex-wrap gap-2 mb-6 border-b pb-3">
          <button
            onClick={() => setSelectedMember('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedMember === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Members
          </button>
          {members.map((m) => (
            <button
              key={m.member_id ?? m.label}
              onClick={() => setSelectedMember(m.member_id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedMember === m.member_id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* 🟦 Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {summaryCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <div
                key={i}
                className="bg-white shadow-md rounded-xl p-4 border border-gray-100 flex flex-col items-start"
              >
                <div className={`p-3 rounded-lg ${card.color} mb-3`}>
                  <Icon className="text-white" size={22} />
                </div>
                <h3 className="text-gray-600 text-sm">{card.title}</h3>
                <p className="text-2xl font-bold text-gray-800">
                  ₹{card.value.toLocaleString('en-IN')}
                </p>
              </div>
            );
          })}
        </div>

        {/* 🟩 Chart + Holdings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-1 bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Portfolio Composition
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  label
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => `₹${v.toLocaleString('en-IN')}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="lg:col-span-2">
            <HoldingsTable holdings={allHoldings} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
