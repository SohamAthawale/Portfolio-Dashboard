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
  CartesianGrid,
  LabelList,
} from 'recharts';
import { HoldingsTable, Holding } from '../components/HoldingsTable';
import { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';

// PDF libs
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface MemberPortfolioData {
  label: string;
  member_id: number | null;
  summary: Record<string, number>;
  holdings: Holding[];
}

interface TopItem {
  amc?: string;
  category?: string;
  value: number;
}

type AllocationItem = Record<string, string | number> & {
  category: string;
  value: number;
  percentage: number;
};

interface PortfolioSnapshotProps {
  portfolioId: number;
  members: MemberPortfolioData[];
  onClose: () => void;
}

const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#0ea5e9', '#84cc16', '#a855f7'];

export const PortfolioSnapshot = ({ portfolioId, members, onClose }: PortfolioSnapshotProps) => {
  const [selectedMember, setSelectedMember] = useState<'all' | number | null>('all');
  const [topAmc, setTopAmc] = useState<TopItem[]>([]);
  const [topCategory, setTopCategory] = useState<TopItem[]>([]);
  const [assetAllocation, setAssetAllocation] = useState<AllocationItem[]>([]);
  const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

  // ------------------ PDF DOWNLOAD FUNCTION (Optimized) ------------------
  const downloadPdf = async () => {
    const element = document.getElementById("portfolio-snapshot-content");
    if (!element) return;

    const canvas = await html2canvas(element, {
      scale: 1.2,          // reduced scale for smaller file
      useCORS: true,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.8); // JPEG + compression
    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = pdfHeight;
    let position = 0;

    pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, pdfHeight);
    heightLeft -= pdf.internal.pageSize.getHeight();

    while (heightLeft > 0) {
      position -= pdf.internal.pageSize.getHeight();
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();
    }

    pdf.save(`portfolio_${portfolioId}_snapshot.pdf`);
  };
  // -----------------------------------------------------------------------

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

  const filteredMembers = useMemo(() => {
    if (selectedMember === 'all') return members;
    return members.filter((m) => m.member_id === selectedMember);
  }, [selectedMember, members]);

  const combinedSummary = filteredMembers.reduce((acc, m) => {
    for (const [key, val] of Object.entries(m.summary)) {
      acc[key] = (acc[key] || 0) + (val as number);
    }
    return acc;
  }, {} as Record<string, number>);

  const formatRupee = (n: number) =>
    `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const allHoldings = filteredMembers.flatMap((m) =>
    m.holdings.map((h) => ({
      ...h,
      company: `${h.company} (${m.label})`,
    }))
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-7xl w-full h-[92vh] overflow-y-auto relative"
      >

        {/* CLOSE BUTTON */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-xl"
        >
          ✕
        </button>

        {/* DOWNLOAD BUTTON */}
        <button
          onClick={downloadPdf}
          className="absolute top-4 right-20 text-gray-600 hover:text-gray-800 text-sm bg-gray-100 px-3 py-1 rounded-lg"
        >
          Download PDF
        </button>

        {/* WRAPPED CONTENT FOR PDF CAPTURE */}
        <div id="portfolio-snapshot-content" className="p-2">

          <h2 className="text-2xl font-bold mb-2 text-gray-800">
            Portfolio #{portfolioId} Snapshot
          </h2>
          <p className="text-gray-500 mb-6">
            Historical portfolio breakdown with NAV, units, and analytics
          </p>

          {/* MEMBER FILTER */}
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

          {/* ----------------- CHARTS SECTION ----------------- */}
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-8 mb-10">

            {/* PIE CHART */}
            <div className="bg-white rounded-xl shadow p-6 flex flex-col items-center justify-center">
              <h3 className="text-lg font-semibold text-gray-700 mb-4 self-start">
                Model Asset Allocation
              </h3>
              <div className="w-full h-[28rem]">
                <ResponsiveContainer>
                  <PieChart margin={{ top: 40, right: 60, left: 60, bottom: 40 }}>
                    <Pie
                      data={assetAllocation}
                      dataKey="percentage"
                      nameKey="category"
                      innerRadius={100}
                      outerRadius={140}
                      labelLine={false}
                      label={(props) => {
                        const name = props.name ?? '';
                        const percent =
                          typeof props.percent === 'number'
                            ? (props.percent * 100).toFixed(1)
                            : '0';
                        return `${name}: ${percent}%`;
                      }}
                    >
                      {assetAllocation.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>

                    <text
                      x="50%"
                      y="50%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="text-lg font-semibold fill-gray-700"
                    >
                      {formatRupee(combinedSummary.total || 0)}
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

            {/* BAR CHARTS */}
            <div className="flex flex-col gap-8">

              {/* TOP 10 AMCs */}
              <div className="bg-white rounded-xl shadow p-6 flex-1">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">Top 10 AMCs</h3>
                <div className="w-full h-[20rem]">
                  <ResponsiveContainer width="100%">
                    <BarChart
                      layout="vertical"
                      data={topAmc}
                      margin={{ top: 10, right: 40, left: 120, bottom: 10 }}
                      barCategoryGap="20%"
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="amc" type="category" width={150} tickLine={false} axisLine={false} interval={0} />

                      <Tooltip formatter={(value: ValueType) => `₹${Number(value).toLocaleString('en-IN')}`} />
                      <Bar dataKey="value" fill="#2563eb" barSize={28} radius={[4, 4, 4, 4]}>
                        <LabelList
                          dataKey="value"
                          position="right"
                          formatter={(label: React.ReactNode) =>
                            `₹${Number(label ?? 0).toLocaleString('en-IN')}`
                          }
                          fontSize={11}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* TOP 10 CATEGORIES */}
              <div className="bg-white rounded-xl shadow p-6 flex-1">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">
                  Top 10 Categories
                </h3>
                <div className="w-full h-[20rem]">
                  <ResponsiveContainer width="100%">
                    <BarChart
                      layout="vertical"
                      data={topCategory}
                      margin={{ top: 10, right: 40, left: 120, bottom: 10 }}
                      barCategoryGap="20%"
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="category" type="category" width={160} tickLine={false} axisLine={false} interval={0} />

                      <Tooltip formatter={(value: ValueType) => `₹${Number(value).toLocaleString('en-IN')}`} />
                      <Bar dataKey="value" fill="#6b7280" barSize={28} radius={[4, 4, 4, 4]}>
                        <LabelList
                          dataKey="value"
                          position="right"
                          formatter={(label: React.ReactNode) =>
                            `₹${Number(label ?? 0).toLocaleString('en-IN')}`
                          }
                          fontSize={11}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </div>

          {/* HOLDINGS TABLE */}
          <div className="bg-white rounded-xl shadow p-6">
            <HoldingsTable holdings={allHoldings} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
