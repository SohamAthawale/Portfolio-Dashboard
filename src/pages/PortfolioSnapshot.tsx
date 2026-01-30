// src/components/PortfolioSnapshot.tsx
import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
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


import { HoldingsTable, Holding } from "../components/HoldingsTable";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import Logo from "../components/logo";

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

type AllocationItem = {
  category: string;
  value: number;
  percentage: number;
};

interface PortfolioSnapshotProps {
  portfolioId: number;
  members: MemberPortfolioData[];
  onClose: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL || '/pmsreports';


// ⭐ Fixed margins & width values
const CHART_RIGHT_MARGIN = 80;
const CHART_Y_AXIS_WIDTH = 70; // controls label width

const COLORS = [
  "#2563eb",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#0ea5e9",
  "#84cc16",
  "#a855f7",
];

export const PortfolioSnapshot = ({
  portfolioId,
  members: initialMembers = [],
  onClose,
}: PortfolioSnapshotProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [apiMembers, setApiMembers] = useState<MemberPortfolioData[]>([]);
  const [topAmc, setTopAmc] = useState<TopItem[]>([]);
  const [topCategory, setTopCategory] = useState<TopItem[]>([]);
  const [assetAllocation, setAssetAllocation] = useState<AllocationItem[]>([]);

  // -------------------- PDF Download --------------------
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

    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);

    let heightLeft = imgHeight - pageHeight;
    let position = -pageHeight;

    while (heightLeft > 0) {
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      position -= pageHeight;
    }

    pdf.save(`portfolio_${portfolioId}_snapshot.pdf`);
  };

  // -------------------- Fetch Members --------------------
  useEffect(() => {
    let cancelled = false;

    const fetchMembers = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/portfolio/${portfolioId}/members`,
          {
            credentials: "include",
          }
        );

        const data = await res.json();

        if (!cancelled && res.ok && Array.isArray(data.members)) {
          setApiMembers(data.members);
          setSelectedIndex(0);
        } else if (!cancelled && initialMembers.length) {
          setApiMembers([]);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error("Failed to load snapshot analytics:", err);
      }
    };

    fetchMembers();
    return () => {
      cancelled = true;
    };
  }, [portfolioId, initialMembers]);

  const membersSource = apiMembers.length ? apiMembers : initialMembers;

  useEffect(() => {
    if (!membersSource.length) {
      setAssetAllocation([]);
      setTopAmc([]);
      setTopCategory([]);
      return;
    }

    const selected = membersSource[selectedIndex];
    setTopAmc(selected.top_amc || []);
    setTopCategory(selected.top_category || []);
    setAssetAllocation(selected.asset_allocation || []);
  }, [membersSource, selectedIndex]);

  const selectedMember =
    membersSource.length > 0 ? membersSource[selectedIndex] : undefined;

  const combinedSummary = selectedMember?.summary || {};

  const formatRupee = (n: number) =>
    `₹${(n || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const allHoldings = useMemo(
    () =>
      selectedMember?.holdings.map((h) => ({
        ...h,
        company: `${h.company} (${selectedMember.label})`,
      })) || [],
    [selectedMember]
  );

  // ------------------------------------------------------
  //                          UI
  // ------------------------------------------------------

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-2"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[340px] sm:max-w-7xl h-[92vh] overflow-y-auto relative p-3 sm:p-6"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-xl text-gray-700 hover:text-black"
        >
          ✕
        </button>

        {/* Download PDF Button */}
        <button
          onClick={downloadPdf}
       className="absolute top-10 right-2 text-[10px] bg-gray-100 px-2 py-1 rounded-md text-gray-600 hover:text-black"

        >
          Download PDF
        </button>

        <div id="portfolio-snapshot-content" className="p-1 sm:p-2">
          <Logo className="w-32 sm:w-40 h-auto mb-4 mx-auto" />

          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 text-center sm:text-left">
            Portfolio #{portfolioId} Snapshot
          </h2>

          <p className="text-gray-500 text-sm sm:text-base mb-6 text-center sm:text-left">
            Historical portfolio breakdown with NAV, units, and analytics
          </p>

          {/* MEMBER FILTER */}
          <div className="flex flex-wrap gap-2 mb-6 border-b pb-3">
            {membersSource.map((m, idx) => (
              <button
                key={m.member_id ?? m.label}
                onClick={() => setSelectedIndex(idx)}
                className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium ${
                  selectedIndex === idx
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* -------------------- CHARTS -------------------- */}
          <div className="space-y-8">
            {/* MODEL ASSET ALLOCATION */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Model Asset Allocation</h3>

              <div className="w-full h-56 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={assetAllocation}
                    margin={{
                      left: 10,
                      right: CHART_RIGHT_MARGIN,
                    }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />

                    <XAxis
                      type="number"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `${v}%`}
                    />

                    <YAxis
                      dataKey="category"
                      type="category"
                      width={CHART_Y_AXIS_WIDTH}
                      tick={{ fontSize: 11 }}
                      interval={0}
                    />

                    <Tooltip />

                    <Bar dataKey="percentage" barSize={14}>
                      {assetAllocation.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}

                      <LabelList
                        dataKey="percentage"
                        position="right"
                        offset={12}
                        fontSize={12}
                        formatter={(label: React.ReactNode) =>
                          `${Number(label)}%`
                        }
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* PIE CHART */}
            <div>
              <h3 className="text-sm font-semibold mb-2 text-center sm:text-left">
                Asset/Product Allocation (All Products)
              </h3>

              <div className="w-full flex justify-center h-64 sm:h-80">
                <div className="w-[90%] sm:w-[70%] min-w-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={assetAllocation}
                        dataKey="percentage"
                        outerRadius={90}
                        innerRadius={45}
                        paddingAngle={2}
                        nameKey="category"
                      labelLine={true}
                      // Option A: category + percentage
                      label={({ payload, percent }: any) => {
                        const pct = typeof percent === 'number' ? (percent * 100).toFixed(1) : '0.0';
                        return `${payload?.category ?? ''}: ${pct}%`;
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
                        className="text-xs sm:text-sm font-semibold"
                        fill="#111"
                      >
                        {formatRupee(combinedSummary?.total || 0)}
                      </text>

                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* -------------------- BOTTOM GRID -------------------- */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* TOP AMC */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Top 10 AMC</h3>

                <div className="w-full h-56 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={topAmc}
                      margin={{
                        left: 10,
                        right: CHART_RIGHT_MARGIN,

                      }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />

                      <XAxis type="number" tick={{ fontSize: 10 }} />

                      <YAxis
                        dataKey="amc"
                        type="category"
                        width={CHART_Y_AXIS_WIDTH}
                        tick={{ fontSize: 11 }}
                        interval={0}
                      />

                      <Tooltip />

                      <Bar dataKey="value" barSize={14}>
                        {topAmc.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}

                        <LabelList
                          dataKey="value"
                          position="right"
                          offset={12}
                          fontSize={12}
                          formatter={(label: React.ReactNode) =>
                            `₹${Number(label).toLocaleString("en-IN")}`
                          }
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* TOP CATEGORY */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Top 10 Categories</h3>

                <div className="w-full h-60 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={topCategory}
                      margin={{
                        left: 10,
                        right: CHART_RIGHT_MARGIN,
                        
                      }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />

                      <XAxis type="number" tick={{ fontSize: 10 }} />

                      <YAxis
                        dataKey="category"
                        type="category"
                        width={CHART_Y_AXIS_WIDTH}
                        tick={{ fontSize: 11 }}
                        interval={1}
                      />

                      <Tooltip />

                      <Bar dataKey="value" barSize={14}>
                        {topCategory.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}

                        <LabelList
                          dataKey="value"
                          position="right"
                          offset={12}
                          fontSize={12}
                          formatter={(label: React.ReactNode) =>
                            `₹${Number(label).toLocaleString("en-IN")}`
                          }
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* HOLDINGS TABLE */}
            <div className="pt-4 border-t border-gray-200 overflow-x-auto">
              <HoldingsTable holdings={allHoldings} />
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PortfolioSnapshot;
