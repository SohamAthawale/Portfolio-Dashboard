import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { ChartCard } from "../components/ChartCard";
import { HoldingsTable, Holding } from "../components/HoldingsTable";
import { TrendingUp, Wallet, PieChart,ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

interface MemberDashboardData {
  member_id: number;
  member_name: string;
  member_email: string;
  total_value: number;
  equity_value: number;
  mf_value: number;
  holdings: Holding[];
}

export const MemberDashboard = () => {
  const [data, setData] = useState<MemberDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { member_id } = useParams();
  const navigate = useNavigate();
  useAuth();

  useEffect(() => {
    const fetchMemberData = async () => {
      try {
        if (!member_id) return;
        setIsLoading(true);
        setError(null);

        const res = await fetch(`${API_BASE}/family/member/${member_id}/dashboard`, {
          credentials: "include",
        });

        if (res.status === 401) {
          navigate("/login");
          return;
        }

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to fetch member data.");
        }

        const json = await res.json();

        const holdings: Holding[] = (json.holdings || []).map((h: any) => ({
          company: h.fund_name || "Unknown",
          isin: h.isin_no || "N/A",
          quantity: 0,
          value: parseFloat(h.closing_balance || h.value || 0),
          category:
            h.category ||
            (h.fund_name?.toLowerCase().includes("fund") ? "Mutual Fund" : "Equity"),
        }));

        setData({
          member_id: json.member_id,
          member_name: json.member_name,
          member_email: json.member_email,
          total_value: json.total_value,
          equity_value: json.equity_value,
          mf_value: json.mf_value,
          holdings,
        });
      } catch (err: any) {
        console.error("⚠️ Member dashboard error:", err);
        setError(err.message || "Network error.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMemberData();
  }, [member_id, navigate]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="text-center text-red-600 mt-12 font-medium">{error}</div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="text-center text-gray-600 mt-12">
          No data found for this member.
        </div>
      </Layout>
    );
  }

  const summaryCards = [
    { title: "Total Portfolio Value", value: data.total_value, icon: TrendingUp, color: "blue" },
    { title: "Equity Value", value: data.equity_value, icon: Wallet, color: "green" },
    { title: "Mutual Funds", value: data.mf_value, icon: PieChart, color: "purple" },
  ];

  const chartData = [
    { name: "Equity", value: data.equity_value },
    { name: "Mutual Funds", value: data.mf_value },
  ].filter((item) => item.value > 0);

  const colorMap: Record<string, string> = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    purple: "bg-purple-500",
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">
              {data.member_name}'s Dashboard
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {data.member_email || "No email provided"}
            </p>
          </div>
          <button
            onClick={() => navigate("/family-dashboard")}
            className="flex items-center gap-2 text-blue-600 hover:underline mt-2"
          >
            <ArrowLeft size={18} /> Back to Family Dashboard
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {summaryCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="bg-white rounded-xl shadow-md p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-lg ${colorMap[card.color]}`}>
                    <Icon className="text-white" size={24} />
                  </div>
                </div>
                <h3 className="text-sm font-medium text-gray-600 mb-1">{card.title}</h3>
                <p className="text-2xl font-bold text-gray-800">
                  ₹{card.value.toLocaleString("en-IN")}
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
