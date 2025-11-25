// src/pages/AdminUserDetail.tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

type UserInfo = {
  user_id: number;
  email: string;
  phone: string | null;
  created_at: string | null;
};

type FamilyMember = {
  member_id: number;
  name: string | null;
};

type HoldingRow = {
  portfolio_id: number;
  fund_name?: string;
  isin_no?: string;
  type?: string;
  category?: string;
  invested_amount?: number;
  valuation?: number | null;
  units?: number;
  created_at?: string;
};

type AssetAllocItem = {
  category: string;
  value: number;
  percentage: number;
};

const COLORS = ["#4F46E5", "#F43F5E", "#F59E0B", "#10B981", "#3B82F6", "#7C3AED", "#06B6D4"];
const DEFAULT_MARGIN = { top: 20, right: 20, bottom: 20, left: 20 };

const formatCurrency = (v?: number) =>
  "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const AdminUserDetail: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const numericUserId = Number(userId);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [monthly, setMonthly] = useState<{ month: string; count: number }[]>([]);
  const [assetAllocation, setAssetAllocation] = useState<AssetAllocItem[]>([]);
  const [totals, setTotals] = useState({ invested: 0, valuation: 0 });

  useEffect(() => {
    if (Number.isNaN(numericUserId)) {
      // invalid id; send back to admin dashboard
      navigate("/admin");
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericUserId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/user/${numericUserId}`, {
        credentials: "include",
      });

      if (!res.ok) {
        // show console error and redirect to login if unauthorized
        if (res.status === 401 || res.status === 403) {
          navigate("/login");
          return;
        }
        const msg = await res.text().catch(() => "");
        console.error("admin/user fetch failed:", res.status, msg);
        navigate("/admin");
        return;
      }

      const data = await res.json();

      setUserInfo(data.user ?? null);
      setFamily(Array.isArray(data.family_members) ? data.family_members : []);
      setHoldings(Array.isArray(data.holdings) ? data.holdings : []);
      setMonthly((data.stats && data.stats.monthly_uploads) || []);
      setAssetAllocation(Array.isArray(data.asset_allocation) ? data.asset_allocation : []);
      setTotals({
        invested: (data.stats && data.stats.total_invested) || 0,
        valuation: (data.stats && data.stats.total_valuation) || 0,
      });
    } catch (err) {
      console.error("AdminUserDetail load error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading)
    return (
      <Layout>
        <div className="p-8">Loading user details...</div>
      </Layout>
    );

  return (
    <Layout>
      <motion.div className="p-8 space-y-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/dashboard")}
            className="px-4 py-1 bg-gray-100 rounded shadow text-sm"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold">User #{numericUserId}</h1>
        </div>

        {/* SUMMARY */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard title="Email" value={userInfo?.email ?? "—"} />
          <StatCard title="Phone" value={userInfo?.phone ?? "—"} />
          <StatCard title="Total Invested" value={formatCurrency(totals.invested)} />
          <StatCard title="Total Valuation" value={formatCurrency(totals.valuation)} />
        </div>

        {/* CHARTS ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Asset / Category Allocation - use assetAllocation from backend (same as main dashboard) */}
          <div className="bg-white p-6 rounded-2xl shadow h-[420px]">
            <h2 className="text-xl font-semibold mb-4">Category / Asset Allocation</h2>

            <div className="w-full flex justify-center" style={{ height: 320 }}>
              <div style={{ width: "70%", height: "100%", minWidth: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={DEFAULT_MARGIN}>
                    <Pie
                      data={assetAllocation && assetAllocation.length ? assetAllocation : [{ category: "none", value: 1, percentage: 100 }]}
                      dataKey="percentage"
                      nameKey="category"
                      outerRadius={115}
                      innerRadius={55}
                      paddingAngle={2}
                      labelLine
                      label={({ payload, percent }: any) => {
                        const pct = typeof percent === "number" ? (percent * 100).toFixed(1) : "0.0";
                        return `${payload?.category ?? ""}: ${pct}%`;
                      }}
                    >
                      {(assetAllocation && assetAllocation.length ? assetAllocation : [{ category: "none" }]).map((_, i) => (
                        <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
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
                      {formatCurrency(totals.valuation || totals.invested)}
                    </text>

                    <Tooltip
                      formatter={(_value: any, _name: any, props: any) => {
                        const payload = props?.payload ?? {};
                        const pct = typeof payload?.percentage === "number" ? `${payload.percentage.toFixed(2)}%` : "";
                        const val = typeof payload?.value === "number" ? `₹${payload.value.toLocaleString("en-IN")}` : "";
                        return [`${pct}${val ? ` • ${val}` : ""}`, payload?.category ?? ""];
                      }}
                      wrapperStyle={{ zIndex: 10000, pointerEvents: "none" }}
                      contentStyle={{ borderRadius: 6 }}
                    />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Monthly Uploads */}
          <div className="bg-white p-6 rounded-2xl shadow h-[420px]">
            <h2 className="text-xl font-semibold mb-4">Monthly Uploads</h2>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={monthly ?? []} margin={{ top: 20, right: 20, bottom: 40, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" angle={-20} textAnchor="end" interval={0} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#4F46E5" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* FAMILY MEMBERS */}
        <div className="bg-white p-6 rounded-2xl shadow">
          <h2 className="text-xl font-semibold mb-4">Family Members</h2>
          {family.length === 0 ? (
            <div className="text-sm text-gray-500">No family members.</div>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-gray-600">
                  <th className="py-2 px-3">Member ID</th>
                  <th className="py-2 px-3">Name</th>
                </tr>
              </thead>
              <tbody>
                {family.map((m) => (
                  <tr className="border-b" key={m.member_id}>
                    <td className="py-2 px-3">{m.member_id}</td>
                    <td className="py-2 px-3">{m.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* HOLDINGS */}
        <div className="bg-white p-6 rounded-2xl shadow">
          <h2 className="text-xl font-semibold mb-4">All Holdings</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-gray-600 border-b">
                  <th className="py-2 px-3">Portfolio ID</th>
                  <th className="py-2 px-3">Fund</th>
                  <th className="py-2 px-3">ISIN</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Category</th>
                  <th className="py-2 px-3">Invested</th>
                  <th className="py-2 px-3">Valuation</th>
                  <th className="py-2 px-3">Units</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h, i) => (
                  <tr className="border-b" key={i}>
                    <td className="py-2 px-3">{h.portfolio_id}</td>
                    <td className="py-2 px-3">{h.fund_name ?? "—"}</td>
                    <td className="py-2 px-3">{h.isin_no ?? "—"}</td>
                    <td className="py-2 px-3">{h.type ?? "—"}</td>
                    <td className="py-2 px-3">{h.category ?? "Unclassified"}</td>
                    <td className="py-2 px-3">{formatCurrency(h.invested_amount)}</td>
                    <td className="py-2 px-3">{formatCurrency(h.valuation ?? h.invested_amount)}</td>
                    <td className="py-2 px-3">{h.units ?? "—"}</td>
                  </tr>
                ))}
                {holdings.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-gray-500">
                      No holdings found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </Layout>
  );
};

const StatCard: React.FC<{ title: string; value: any }> = ({ title, value }) => (
  <div className="bg-white p-5 rounded-2xl shadow">
    <div className="text-sm text-gray-600">{title}</div>
    <div className="text-2xl font-bold mt-2">{value}</div>
  </div>
);

export default AdminUserDetail;
