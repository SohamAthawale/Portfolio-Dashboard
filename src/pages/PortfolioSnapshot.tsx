// src/components/PortfolioSnapshot.tsx
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

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import Logo from '../components/logo';

interface MemberPortfolioData {
  label: string;
  member_id: number | null;
  summary: Record<string, number>;
  holdings: Holding[];
  asset_allocation?: AllocationItem[];
  top_amc?: TopItem[];
  top_category?: TopItem[];
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
  // optional server-provided members (preloaded)
  members: MemberPortfolioData[];
  onClose: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

export const PortfolioSnapshot = ({ portfolioId, members: initialMembers = [], onClose }: PortfolioSnapshotProps) => {
  // --- local state ---
  // selectedIndex: 0 => All Members (if present), 1..n => members
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [apiMembers, setApiMembers] = useState<MemberPortfolioData[]>([]);
  const [topAmc, setTopAmc] = useState<TopItem[]>([]);
  const [topCategory, setTopCategory] = useState<TopItem[]>([]);
  const [assetAllocation, setAssetAllocation] = useState<AllocationItem[]>([]);

  // Chart alignment constants (same as Dashboard)
  const CHART_LEFT_Y_WIDTH = 180;
  const CHART_RIGHT_MARGIN = 90;
  const CHART_BOTTOM_MARGIN = 40;

  const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#0ea5e9', '#84cc16', '#a855f7'];

  // ------------------ PDF DOWNLOAD (mirrors Dashboard behavior) ------------------
  const downloadPdf = async () => {
    const element = document.getElementById("portfolio-snapshot-content");
    if (!element) return;

    const canvas = await html2canvas(element, {
      scale: 1.2,
      useCORS: true,
      scrollY: -window.scrollY,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.85);
    const pdf = new jsPDF("p", "mm", "a4");

    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
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

    pdf.save(`portfolio_${portfolioId}_snapshot.pdf`);
  };
  // ------------------------------------------------------------------------------

  // Fetch members from backend (preferred). Fall back to initialMembers prop.
  useEffect(() => {
    let cancelled = false;
    const fetchMembers = async () => {
      try {
        const res = await fetch(`${API_BASE}/portfolio/${portfolioId}/members`, {
          credentials: 'include',
        });
        const data = await res.json();
        if (!cancelled && res.ok && Array.isArray(data.members)) {
          // backend returns members with All Members first
          setApiMembers(data.members as MemberPortfolioData[]);
          // start with All Members by default (0)
          setSelectedIndex(0);
        } else {
          // no-op: keep initialMembers if any
          if (!cancelled && initialMembers && initialMembers.length) {
            setApiMembers([]);
            setSelectedIndex(0);
          }
        }
      } catch (err) {
        console.error('Failed to load snapshot analytics:', err);
      }
    };
    fetchMembers();
    return () => {
      cancelled = true;
    };
  }, [portfolioId, initialMembers]);

  // Decide which members array to use: prefer API members, otherwise fallback to prop
  const membersSource = apiMembers && apiMembers.length ? apiMembers : initialMembers;

  // Ensure selectedIndex is bounded to membersSource length
  useEffect(() => {
    if (!membersSource || membersSource.length === 0) {
      setTopAmc([]);
      setTopCategory([]);
      setAssetAllocation([]);
      return;
    }
    if (selectedIndex < 0 || selectedIndex >= membersSource.length) {
      setSelectedIndex(0);
      return;
    }

    // update charts using the selected member's own analytics (backend returns these per member)
    const selected = membersSource[selectedIndex];

    setTopAmc(selected.top_amc ? selected.top_amc : []);
    setTopCategory(selected.top_category ? selected.top_category : []);
    setAssetAllocation(selected.asset_allocation ? selected.asset_allocation : []);
  }, [membersSource, selectedIndex]);

  // combinedSummary: just the selected member's summary (backend provides summary.total)
  const selectedMemberData = membersSource && membersSource.length ? membersSource[selectedIndex] : undefined;
  const combinedSummary = selectedMemberData?.summary ?? {};

  const formatRupee = (n: number) =>
    `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // holdings to show: selected member's holdings (label appended for All Members scenario)
  const allHoldings = useMemo(() => {
    if (!selectedMemberData) return [];

    return (selectedMemberData.holdings || []).map((h) => ({
      ...h,
      company: `${h.company}${selectedMemberData ? ` (${selectedMemberData.label})` : ''}`,
    }));
  }, [selectedMemberData]);

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
          <Logo className="w-40 h-auto mb-6" />

          <h2 className="text-2xl font-bold mb-2 text-gray-800">
            Portfolio #{portfolioId} Snapshot
          </h2>
          <p className="text-gray-500 mb-6">
            Historical portfolio breakdown with NAV, units, and analytics
          </p>

          {/* MEMBER FILTER */}
          <div className="flex flex-wrap gap-2 mb-6 border-b pb-3">
            {membersSource && membersSource.length > 0 ? (
              <>
                {membersSource.map((m, idx) => (
                  <button
                    key={m.member_id ?? m.label}
                    onClick={() => setSelectedIndex(idx)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedIndex === idx
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </>
            ) : (
              // fallback when no members available from props/api
              <button className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700">
                No members
              </button>
            )}
          </div>

          {/* ----------------- CHARTS & LAYOUT (matches Dashboard) ----------------- */}
          <div className="space-y-6">

            {/* Model Asset Allocation (vertical bar) */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Model Asset Allocation</h3>
              <div className="w-full" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={assetAllocation}
                    margin={{ top: 20, right: CHART_RIGHT_MARGIN, left: CHART_LEFT_Y_WIDTH, bottom: CHART_BOTTOM_MARGIN }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
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
                      {assetAllocation.map((_, idx) => (
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
                <div style={{ width: '70%', height: '100%', minWidth: 340 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={assetAllocation}
                        dataKey="percentage"
                        outerRadius={115}
                        innerRadius={55}
                        paddingAngle={2}
                        nameKey="category"
                        labelLine={true}
                        label={({ payload, percent }: any) => {
                          const pct = typeof percent === 'number' ? (percent * 100).toFixed(1) : '0.0';
                          return `${payload?.category ?? ''}: ${pct}%`;
                        }}
                      >
                        {assetAllocation.map((_, i) => (
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
                        {formatRupee((combinedSummary && (combinedSummary.total || 0)) as number)}
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

            {/* Bottom two columns: Top AMC and Top Category */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top 10 AMC */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Top 10 AMC</h3>
                <div className="w-full" style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={topAmc}
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
                        {topAmc.map((_, i) => (
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

              {/* Top 10 Categories */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Top 10 Categories</h3>
                <div className="w-full" style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={topCategory}
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
                        {topCategory.map((_, i) => (
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

            {/* Holdings Table */}
            <div className="pt-4 border-t border-gray-200">
              <HoldingsTable holdings={allHoldings} />
            </div>

          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PortfolioSnapshot;
