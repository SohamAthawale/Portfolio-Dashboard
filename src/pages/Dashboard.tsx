// Part 1 — imports, constants, interfaces, state & effects
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { HoldingsTable, Holding } from "../components/HoldingsTable";
import {
  TrendingUp,
  Wallet,
  PieChart as PieChartIcon,
  Briefcase,
  ChevronDown,
  Users,
  Download,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";

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
} from "recharts";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import Logo from "../components/logo";
import LoadingState from "../components/LoadingState";

const API_BASE = import.meta.env.VITE_API_URL || '/pmsreports';

/* ---------- TEMP CHART VALUES (you can tweak later) ---------- */
const DEFAULT_CHART_LEFT_Y_WIDTH = 40;
const DEFAULT_CHART_RIGHT_MARGIN = 70;
const DEFAULT_CHART_BOTTOM_MARGIN = 20;

const COLORS = [
  "#2563eb",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#0ea5e9",
  "#14b8a6",
  "#a855f7",
];

/* ---------- TYPES ---------- */
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

/* ---------- Component start ---------- */
export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // data & ui state
  const [data, setData] = useState<DashboardData | null>(null);
  const [familyMembers, setFamilyMembers] = useState<{ id?: number; member_id?: number; name: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(["user"]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // mobile detection (used to keep JSX/props TS-safe)
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 375; // treat <=375 as smallest phones (iPhone SE / 344 fits inside)
  });

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth <= 375);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // click outside dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // fetch family members (unchanged)
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await fetch(`${API_BASE}/family/members`, { credentials: "include" });
        if (res.ok) {
          const json = await res.json();
          setFamilyMembers(Array.isArray(json) ? json : []);
        }
      } catch (err) {
        console.warn("Could not fetch family members", err);
      }
    };
    fetchMembers();
  }, []);

  // fetch dashboard data when selectedIds changes
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const includeUser = selectedIds.includes("user");
        const memberIds = selectedIds.filter((id) => id !== "user").join(",");

        const params = new URLSearchParams();
        params.append("include_user", includeUser ? "true" : "false");
        if (memberIds) params.append("members", memberIds);

        const res = await fetch(`${API_BASE}/dashboard-data?${params.toString()}`, {
          credentials: "include",
        });

        if (res.status === 401) return navigate("/login");
        if (!res.ok) throw new Error("Failed to fetch dashboard data");

        const json = await res.json();
        // ensure we set null if backend returns falsy or malformed payload
        setData(json && typeof json === "object" ? json : null);
      } catch (err: any) {
        setError(err?.message ?? "Unknown error");
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedIds, navigate]);
// Part 2 — helpers, formatters, and minor UI helpers

  // SAFE summary: ensure numeric defaults always present
  const safeSummary: DashboardSummary = {
    invested_value_mf: Number(data?.summary?.invested_value_mf ?? 0),
    current_value_mf: Number(data?.summary?.current_value_mf ?? 0),
    profit_mf: Number(data?.summary?.profit_mf ?? 0),
    profit_percent_mf: Number(data?.summary?.profit_percent_mf ?? 0),
    equity_value: Number(data?.summary?.equity_value ?? 0),
    total_portfolio_value: Number(data?.summary?.total_portfolio_value ?? 0),
  };

  // SAFE arrays — avoid using data! and guard if values are not arrays
  const safeAssetAlloc = Array.isArray(data?.asset_allocation) ? data!.asset_allocation : [];
  const safeTopAMC = Array.isArray(data?.top_amc) ? data!.top_amc : [];
  const safeTopCategory = Array.isArray(data?.top_category) ? data!.top_category : [];
  const safeHoldings = Array.isArray(data?.holdings) ? data!.holdings : [];
  const mfHoldings = safeHoldings.filter(h =>
  typeof h.isin === "string" && h.isin.startsWith("INF")
);

// Helper: always resolve AMC
const getAMC = (amc?: string, company?: string) => {
  if (amc && amc.trim()) return amc;

  if (!company) return "OTHERS";

  const upper = company.toUpperCase();
  const known = [
    "UTI", "JM", "BANDHAN", "HDFC", "ICICI", "SBI",
    "AXIS", "KOTAK", "NIPPON", "DSP", "TATA", "IDFC",
    "MIRAE", "MOTILAL", "PARAG", "EDELWEISS"
  ];

  for (const k of known) {
    if (upper.includes(k)) return k;
  }

  return "OTHERS";
};

// Total invested per AMC
const totalInvestedPerAMC = mfHoldings.reduce(
  (acc: Record<string, number>, h) => {
    const amc = getAMC(undefined, h.company);
    acc[amc] = (acc[amc] ?? 0) + Number(h.invested_amount ?? 0);
    return acc;
  },
  {}
);

type MFCategoryRow = {
  amc: string;
  category: string;
  invested: number;
  current: number;
  holding_pct: number;
  return_pct: number;
};

const mfCategoryTableData: MFCategoryRow[] = Object.values(
  mfHoldings.reduce((acc: any, h) => {
    const amc = getAMC(undefined, h.company);
    const subCat = h.sub_category || h.category || "Others";
    const key = `${amc}__${subCat}`;

    if (!acc[key]) {
      acc[key] = {
        amc,
        category: subCat,
        invested: 0,
        current: 0,
      };
    }

    acc[key].invested += Number(h.invested_amount ?? 0);
    acc[key].current += Number(h.value ?? 0);

    return acc;
  }, {})
).map((row: any) => {
  const totalAMC = totalInvestedPerAMC[row.amc] ?? 0;

  return {
    ...row,
    holding_pct:
      totalAMC > 0
        ? Number(((row.invested / totalAMC) * 100).toFixed(2))
        : 0,
    return_pct:
      row.invested > 0
        ? Number((((row.current - row.invested) / row.invested) * 100).toFixed(2))
        : 0,
  };
});

// Optional but recommended
mfCategoryTableData.sort((a, b) =>
  a.amc === b.amc
    ? a.category.localeCompare(b.category)
    : a.amc.localeCompare(b.amc)
);


  
  // PDF export (unchanged behavior)
  const downloadPDF = async () => {
    const element = document.getElementById("dashboard-pdf");
    if (!element) return;

    const canvas = await html2canvas(element, {
      scale: 1.2,
      useCORS: true,
      scrollY: -window.scrollY,
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

  const toggleSelection = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const summaryCards = [
    {
      title: "Invested Value (MF)",
      value: safeSummary.invested_value_mf,
      icon: Wallet,
      color: "green",
    },
    {
      title: "Current Value (Total)",
      value: safeSummary.total_portfolio_value,
      subValues: [
        { label: "MF", value: safeSummary.current_value_mf },
        { label: "Shares", value: safeSummary.equity_value },
      ],
      icon: TrendingUp,
      color: "blue",
    },
    {
      title: "Profit (MF)",
      value: safeSummary.profit_mf,
      icon: Briefcase,
      color: safeSummary.profit_mf >= 0 ? "green" : "red",
    },
    {
      title: "Return % (MF)",
      value: safeSummary.profit_percent_mf,
      icon: PieChartIcon,
      color: "purple",
    },
  ];

  const selectedText =
    selectedIds.length === 1 && selectedIds.includes("user")
      ? "My Holdings"
      : `Viewing ${selectedIds.length} Portfolios`;
// Part 3 — return JSX (layout, charts, and table)
  if (isLoading)
    return (
      <Layout>
        <LoadingState cards={3} lines={4} />
      </Layout>
    );

  if (error)
    return (
      <Layout>
        <div className="text-center text-red-600 mt-12 font-medium">{error}</div>
      </Layout>
    );

  // NOTE: We no longer early-return when !data — we always render the dashboard frame.
  // This ensures the UI is visible but shows "No data available" where charts/tables expect data.

  // chart sizing derived from isMobile
  const chartLeftWidth = isMobile ? 40 : DEFAULT_CHART_LEFT_Y_WIDTH;
  const chartRightMargin = isMobile ? 55 : DEFAULT_CHART_RIGHT_MARGIN;
  const chartBottomMargin = isMobile ? 8 : DEFAULT_CHART_BOTTOM_MARGIN;
  const barSize = isMobile ? 12 : 18;
  const chartHeightModel = isMobile ? 260 : 288;
  const chartHeightSmall = isMobile ? 220 : 288;

  return (
    <Layout>
      <div
        id="dashboard-pdf"
        className="w-full max-w-[380px] mx-auto p-2 sm:max-w-full sm:p-6 app-panel space-y-6 sm:space-y-8 text-slate-800"
      >
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <Logo className="w-24 sm:w-52" compact={isMobile} />
            <div className="text-lg sm:text-xl font-semibold">Live Portfolio Report</div>
          </div>

          <div className="text-sm text-right">
            <div>
              <span className="font-medium">Account:</span> {user?.email ?? '-'}
            </div>
            <div className="text-xs text-slate-500">{new Date().toLocaleDateString('en-GB')}</div>
          </div>
        </div>

        <hr className="border-slate-200" />

        {/* BUTTON ROW */}
        <div className="flex flex-col sm:flex-row justify-between gap-3 px-1 sm:px-0">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={downloadPDF}
              className="btn-secondary"
            >
              <Download size={14} /> Download PDF
            </button>

            <button
              onClick={() => navigate("/service-requests")}
              className="btn-primary"
            >
              Raise Service Request
            </button>
          </div>

          {/* DROPDOWN — FULL WIDTH ON MOBILE */}
          <div className="relative w-full sm:w-auto" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="w-full sm:w-auto inline-flex items-center justify-between gap-2 px-3 py-2 border border-slate-200 text-sm rounded-xl bg-white shadow-sm"
            >
              <Users size={14} />
              <span>{selectedText}</span>
              <ChevronDown size={14} />
            </button>

            {dropdownOpen && (
              <div className="absolute w-full sm:w-64 mt-2 bg-white border border-slate-200 rounded-xl shadow-sm z-50 max-h-64 overflow-y-auto">
                <div className="p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selectedIds.includes("user")} onChange={() => toggleSelection("user")} />
                    My Holdings
                  </label>
                <div className="border-t border-slate-200 my-2" />

                  {familyMembers.map((m) => {
                    const id = m.id ?? m.member_id;
                    return (
                      <label key={id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={selectedIds.includes(String(id))} onChange={() => toggleSelection(String(id))} />
                        {m.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SUMMARY CARDS — MOBILE = 1 COLUMN */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {summaryCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <div className="app-panel-soft p-3 sm:p-4 flex items-center gap-3 sm:gap-4 min-h-[92px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 border border-cyan-100 bg-cyan-50 flex items-center justify-center rounded-xl">
                    <Icon size={18} className="text-cyan-700" />
                  </div>

                  <div>
                    <div className="text-[10px] sm:text-xs text-slate-500">{card.title}</div>
                    <div className="text-base sm:text-xl font-semibold">
                      {card.title.includes("%") ? `${card.value.toFixed(2)}%` : `₹${Number(card.value).toLocaleString("en-IN")}`}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* MODEL ASSET ALLOCATION */}
        <div className="px-1 sm:px-0">
          <h3 className="text-sm font-semibold mb-3">Model Asset Allocation</h3>

          {safeAssetAlloc.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No data available</div>
          ) : (
            <div className="w-full" style={{ height: chartHeightModel, minWidth: isMobile ? 300 : 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={safeAssetAlloc}
                  margin={{
                    top: isMobile ? 8 : 20,
                    right: isMobile ? 55 : chartRightMargin,
                    left: isMobile ? 10 : chartLeftWidth,
                    bottom: chartBottomMargin,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis type="number" tick={{ fontSize: isMobile ? 10 : 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
                  <YAxis dataKey="category" type="category" width={chartLeftWidth} tick={{ fontSize: isMobile ? 10 : 12 }} interval={0} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Bar dataKey="percentage" barSize={barSize}>
                    {safeAssetAlloc.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}

                    <LabelList
                      dataKey="percentage"
                      position="right"
                      dx={isMobile ? 4 : 6}
                      formatter={(value: unknown) => {
                        const num = typeof value === "number" ? value : Number(value ?? 0);
                        return `${num.toFixed(1)}%`;
                      }}
                      fontSize={isMobile ? 10 : 12}
                    />

                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* PIE CHART */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Asset/Product Allocation</h3>

          {safeAssetAlloc.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No data available</div>
          ) : (
            <div className="w-full flex justify-center" style={{ height: isMobile ? 260 : 340 }}>
              <div className="w-[90%] sm:w-[60%] min-w-[200px] sm:min-w-[240px]">
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
          )}
        </div>

        {/* AMC + CATEGORY CHARTS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-1 sm:px-0">
          {/* TOP AMC */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Top 10 AMC (MF)</h3>

            {safeTopAMC.length === 0 ? (
              <div className="text-center text-gray-500 py-8">No data available</div>
            ) : (
              <div className="w-full" style={{ height: chartHeightSmall, minWidth: isMobile ? 300 : 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={safeTopAMC}
                    margin={{
                      top: isMobile ? 8 : 20,
                      right: isMobile ? 55 : chartRightMargin,
                      left: isMobile ? 10 : chartLeftWidth,
                      bottom: chartBottomMargin,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: isMobile ? 10 : 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `₹${Number(val).toLocaleString("en-IN")}`}
                    />
                    <YAxis dataKey="amc" type="category" width={chartLeftWidth} tick={{ fontSize: isMobile ? 10 : 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" barSize={barSize}>
                      {safeTopAMC.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}

                      <LabelList
                        dataKey="value"
                        position="right"
                        offset={8}
                        formatter={(value: unknown) => {
                          const num = typeof value === "number" ? value : Number(value ?? 0);
                          return `₹${num.toLocaleString("en-IN")}`;
                        }}
                        fontSize={isMobile ? 9 : 12}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* TOP CATEGORY */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Top 10 Categories (MF)</h3>

            {safeTopCategory.length === 0 ? (
              <div className="text-center text-gray-500 py-8">No data available</div>
            ) : (
              <div className="w-full" style={{ height: chartHeightSmall, minWidth: isMobile ? 300 : 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={safeTopCategory}
                    margin={{
                      top: isMobile ? 8 : 20,
                      right: isMobile ? 55 : chartRightMargin,
                      left: isMobile ? 10 : chartLeftWidth,
                      bottom: chartBottomMargin,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis type="number" tick={{ fontSize: isMobile ? 10 : 12 }} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${Number(val).toLocaleString("en-IN")}`} />
                    <YAxis dataKey="category" type="category" width={chartLeftWidth} tick={{ fontSize: isMobile ? 10 : 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" barSize={barSize}>
                      {safeTopCategory.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}

                      <LabelList
                        dataKey="value"
                        position="right"
                        offset={8}
                        formatter={(value: unknown) => {
                          const num = typeof value === "number" ? value : Number(value ?? 0);
                          return `₹${num.toLocaleString("en-IN")}`;
                        }}
                        fontSize={isMobile ? 9 : 12}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
        {/* MF CATEGORY SUMMARY TABLE */}
<div className="pt-4 border-t border-slate-200 overflow-x-auto">
  <h3 className="text-sm font-semibold mb-3">
    Mutual Fund Category-wise Breakdown
  </h3>

  {mfCategoryTableData.length === 0 ? (
    <div className="text-center text-gray-500 py-6">
      No MF category data available
    </div>
  ) : (
    <table className="min-w-full border border-slate-200 text-sm">
      <thead className="bg-slate-50">
        <tr>
          <th className="border px-3 py-2 text-left">Mutual Fund</th>
          <th className="border px-3 py-2 text-left">Category</th>
          <th className="border px-3 py-2 text-right">Invested (₹)</th>
          <th className="border px-3 py-2 text-right">Current (₹)</th>
          <th className="border px-3 py-2 text-right">% Holdings</th>
          <th className="border px-3 py-2 text-right">Return %</th>
        </tr>
      </thead>

      <tbody>
        {mfCategoryTableData.map((row, i) => (
          <tr key={i} className="hover:bg-slate-50">
            <td className="border px-3 py-2 font-medium">
              {row.amc}
            </td>
            <td className="border px-3 py-2">
              {row.category}
            </td>
            <td className="border px-3 py-2 text-right">
              ₹{row.invested.toLocaleString("en-IN")}
            </td>
            <td className="border px-3 py-2 text-right">
              ₹{row.current.toLocaleString("en-IN")}
            </td>
            <td className="border px-3 py-2 text-right">
              {row.holding_pct}%
            </td>
            <td
              className={`border px-3 py-2 text-right font-medium ${
                row.return_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {row.return_pct}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )}
</div>

        {/* HOLDINGS TABLE */}
        <div className="pt-4 border-t border-slate-200 overflow-x-auto">
          {safeHoldings.length === 0 ? (
            <div className="text-center text-gray-500 py-6">No holdings available</div>
          ) : (
            <HoldingsTable holdings={safeHoldings} />
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
