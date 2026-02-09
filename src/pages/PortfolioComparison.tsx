import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  LabelList,
  Cell,
} from "recharts";
import {
  ArrowLeft,
  ArrowRightLeft,
  RefreshCcw,
  TrendingUp,
  CircleOff,
  Gauge,
  Filter,
} from "lucide-react";

type Holding = {
  company: string;
  isin?: string | null;
  quantity: number;
  nav: number;
  invested_amount: number;
  value: number;
  category?: string;
  sub_category?: string;
  type?: string;
};

type AllocationItem = {
  category: string;
  value: number;
  percentage: number;
};

type MemberPortfolio = {
  label: string;
  member_id: number | null;
  summary: { total: number };
  holdings: Holding[];
  asset_allocation?: AllocationItem[];
};

type PortfolioResponse = {
  portfolio_id: number;
  members: MemberPortfolio[];
};

type HistoryItem = {
  portfolio_id: number;
  upload_date: string;
  total_value: number;
};

const API_BASE = import.meta.env.VITE_API_URL || "/pmsreports";

const PALETTE = [
  "#0ea5e9",
  "#2563eb",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#6366f1",
];

const currency = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const percentage = (n: number) => `${Number(n || 0).toFixed(2)}%`;

const getAllMembersEntry = (resp?: PortfolioResponse | null) => {
  if (!resp?.members?.length) return null;
  const allEntry = resp.members.find((m) => m.member_id === null) ?? resp.members[0];
  return allEntry;
};

const buildHoldingMap = (holdings: Holding[]) => {
  const map = new Map<string, Holding & { key: string }>();

  holdings.forEach((h) => {
    const key = (h.isin && h.isin.trim())
      ? h.isin.trim().toUpperCase()
      : `${(h.company || "").toUpperCase()}|${(h.type || "").toUpperCase()}`;

    if (!map.has(key)) {
      map.set(key, { ...h, key });
      return;
    }

    const existing = map.get(key)!;
    map.set(key, {
      ...existing,
      quantity: Number(existing.quantity || 0) + Number(h.quantity || 0),
      invested_amount:
        Number(existing.invested_amount || 0) + Number(h.invested_amount || 0),
      value: Number(existing.value || 0) + Number(h.value || 0),
    });
  });

  return map;
};

const mergeAllocations = (alloc?: AllocationItem[]) => {
  if (!alloc) return new Map<string, AllocationItem>();
  const map = new Map<string, AllocationItem>();
  alloc.forEach((a) => {
    const key = a.category || "Others";
    map.set(key, {
      category: key,
      value: Number((map.get(key)?.value || 0) + (a.value || 0)),
      percentage: Number((map.get(key)?.percentage || 0) + (a.percentage || 0)),
    });
  });
  return map;
};

export const PortfolioComparison = () => {
  const navigate = useNavigate();
  const { portfolioId } = useParams();

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [latestPortfolioId, setLatestPortfolioId] = useState<number | null>(null);
  const [selectedHistoricalId, setSelectedHistoricalId] = useState<number | null>(
    portfolioId ? Number(portfolioId) : null
  );

  const [currentData, setCurrentData] = useState<PortfolioResponse | null>(null);
  const [historicalData, setHistoricalData] = useState<PortfolioResponse | null>(null);

  const [loadingBasics, setLoadingBasics] = useState(true);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ---------------- Fetch history + latest portfolio ----------------
  useEffect(() => {
    const fetchBasics = async () => {
      try {
        setLoadingBasics(true);
        setError(null);

        const [histRes, latestRes] = await Promise.all([
          fetch(`${API_BASE}/history-data`, { credentials: "include" }),
          fetch(`${API_BASE}/portfolio/latest`, { credentials: "include" }),
        ]);

        if (histRes.status === 401 || latestRes.status === 401) return navigate("/login");

        const histJson = await histRes.json();
        const latestJson = await latestRes.json();

        const histArray = Array.isArray(histJson) ? histJson : [];
        setHistory(histArray);
        setLatestPortfolioId(latestJson?.portfolio_id ?? null);

        // Default historical selection: pick previous upload if available, else first entry
        if (!selectedHistoricalId && histArray.length) {
          const previous = histArray.find(
            (h: HistoryItem) => latestJson?.portfolio_id && h.portfolio_id !== latestJson.portfolio_id
          );
          setSelectedHistoricalId(Number((previous ?? histArray[0]).portfolio_id));
        }
      } catch (err) {
        console.error("Failed to load basics", err);
        setError("Unable to load history. Please try again.");
      } finally {
        setLoadingBasics(false);
      }
    };

    fetchBasics();
  }, [navigate, selectedHistoricalId]);

  // ---------------- Fetch comparison payloads ----------------
  useEffect(() => {
    const fetchPortfolios = async () => {
      if (!latestPortfolioId || !selectedHistoricalId) return;
      try {
        setLoadingCompare(true);
        setError(null);

        const [currentRes, histRes] = await Promise.all([
          fetch(`${API_BASE}/portfolio/${latestPortfolioId}/members`, {
            credentials: "include",
          }),
          fetch(`${API_BASE}/portfolio/${selectedHistoricalId}/members`, {
            credentials: "include",
          }),
        ]);

        if (currentRes.status === 401 || histRes.status === 401) return navigate("/login");

        const currentJson = await currentRes.json();
        const histJson = await histRes.json();

        if (!currentRes.ok) throw new Error(currentJson?.error || "Failed to load current portfolio");
        if (!histRes.ok) throw new Error(histJson?.error || "Failed to load historical portfolio");

        setCurrentData(currentJson);
        setHistoricalData(histJson);
      } catch (err: any) {
        console.error("Comparison fetch failed", err);
        setError(err?.message || "Unable to load comparison data");
      } finally {
        setLoadingCompare(false);
      }
    };

    fetchPortfolios();
  }, [latestPortfolioId, selectedHistoricalId, navigate]);

  // ---------------- Derived data ----------------
  const historicalEntry = useMemo(() => getAllMembersEntry(historicalData), [historicalData]);
  const currentEntry = useMemo(() => getAllMembersEntry(currentData), [currentData]);

  const historicalHoldings = historicalEntry?.holdings ?? [];
  const currentHoldings = currentEntry?.holdings ?? [];

  const histMap = useMemo(() => buildHoldingMap(historicalHoldings), [historicalHoldings]);
  const currMap = useMemo(() => buildHoldingMap(currentHoldings), [currentHoldings]);

  const comparisonRows = useMemo(() => {
    const keys = new Set<string>([...histMap.keys(), ...currMap.keys()]);
    return Array.from(keys).map((key) => {
      const hist = histMap.get(key);
      const curr = currMap.get(key);

      const histValue = Number(hist?.value ?? 0);
      const currValue = Number(curr?.value ?? 0);
      const diff = currValue - histValue;

      return {
        key,
        name: curr?.company ?? hist?.company ?? "Unknown",
        isin: curr?.isin ?? hist?.isin ?? null,
        category: curr?.category ?? hist?.category ?? "Unclassified",
        subCategory: curr?.sub_category ?? hist?.sub_category ?? "",
        type: curr?.type ?? hist?.type ?? "",
        histQty: hist?.quantity ?? 0,
        currQty: curr?.quantity ?? 0,
        histValue,
        currValue,
        diff,
        diffPct: histValue ? (diff / histValue) * 100 : null,
        status: hist && curr ? "kept" : hist ? "exited" : "new",
      };
    });
  }, [histMap, currMap]);

  const topMovers = useMemo(() => {
    return [...comparisonRows]
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 8);
  }, [comparisonRows]);

  const allocationDiff = useMemo(() => {
    const histAlloc = mergeAllocations(historicalEntry?.asset_allocation);
    const currAlloc = mergeAllocations(currentEntry?.asset_allocation);

    const keys = new Set<string>([...histAlloc.keys(), ...currAlloc.keys()]);

    return Array.from(keys)
      .map((k) => {
        const h = histAlloc.get(k);
        const c = currAlloc.get(k);
        return {
          category: k,
          historical: h?.value ?? 0,
          current: c?.value ?? 0,
        };
      })
      .sort((a, b) => b.current + b.historical - (a.current + a.historical))
      .slice(0, 12);
  }, [historicalEntry, currentEntry]);

  const totals = useMemo(() => ({
    historical: Number(historicalEntry?.summary?.total ?? 0),
    current: Number(currentEntry?.summary?.total ?? 0),
  }), [historicalEntry, currentEntry]);

  const formatYAxisLabel = (label: string) => {
    if (!isMobile) return label;
    return label.length > 24 ? `${label.slice(0, 24)}…` : label;
  };

  // ---------------- UI helpers ----------------
  const selectedHistoryMeta = history.find((h) => h.portfolio_id === selectedHistoricalId);
  const isLoading = loadingBasics || loadingCompare;

  const handleChange = (id: number) => {
    setSelectedHistoricalId(id);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          <div className="animate-pulse app-panel p-4 sm:p-6 space-y-3">
            <div className="h-5 w-40 bg-slate-200 rounded" />
            <div className="h-7 w-64 bg-slate-200 rounded" />
            <div className="h-4 w-48 bg-slate-200 rounded" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2].map((k) => (
              <div key={k} className="app-panel p-4 sm:p-5 animate-pulse space-y-3">
                <div className="h-5 w-32 bg-slate-200 rounded" />
                <div className="h-10 w-full bg-slate-100 rounded" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((k) => (
              <div key={k} className="app-panel p-4 sm:p-5 animate-pulse space-y-3">
                <div className="h-5 w-28 bg-slate-200 rounded" />
                <div className="h-36 w-full bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500 flex items-center gap-2"><ArrowRightLeft size={16} /> Compare historical upload vs current portfolio</p>
            <h1 className="app-title">Portfolio Comparison</h1>
            <p className="app-subtitle">Line-by-line deltas, allocation shifts, and top movers.</p>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="btn-secondary">
              <ArrowLeft size={16} /> Back
            </button>
            <button onClick={() => handleChange(selectedHistoricalId || (history[0]?.portfolio_id ?? 0))} className="btn-secondary">
              <RefreshCcw size={16} /> Refresh
            </button>
          </div>
        </div>

        <div className="app-panel p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-2">
                <Filter size={14} /> Historical upload
              </label>
              <select
                value={selectedHistoricalId ?? ""}
                onChange={(e) => handleChange(Number(e.target.value))}
                className="app-select mt-2"
              >
                {history.map((h) => (
                  <option key={h.portfolio_id} value={h.portfolio_id}>
                    #{h.portfolio_id} • {new Date(h.upload_date).toLocaleDateString("en-GB")} • {currency(h.total_value)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full sm:w-auto">
              <div className="app-panel-soft p-3 rounded-xl border border-cyan-100">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Historical</div>
                <div className="text-lg font-semibold text-slate-800">{currency(totals.historical)}</div>
                <div className="text-xs text-slate-500">{selectedHistoryMeta ? new Date(selectedHistoryMeta.upload_date).toLocaleDateString("en-GB") : "Select upload"}</div>
              </div>
              <div className="app-panel-soft p-3 rounded-xl border border-emerald-100">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Current</div>
                <div className="text-lg font-semibold text-emerald-700">{currency(totals.current)}</div>
                <div className="text-xs text-slate-500">Latest snapshot</div>
              </div>
            </div>
          </div>

          {error && <div className="text-rose-600 text-sm">{error}</div>}
          {isLoading && (
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span className="h-3 w-3 rounded-full border-2 border-cyan-400 border-r-transparent animate-spin" />
              Loading comparison…
            </div>
          )}
        </div>

        {!isLoading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="app-panel p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Gauge size={16} /> Portfolio totals
              </div>
              <div className="w-full" style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[{ name: "Value", historical: totals.historical, current: totals.current }]}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => currency(Number(v))} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: any) => currency(Number(v))} />
                    <Legend />
                    <Bar dataKey="historical" fill="#cbd5e1" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="current" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="app-panel p-4 sm:p-5 space-y-3 lg:col-span-2">
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <TrendingUp size={16} /> Allocation shift (top 12 categories)
              </div>
              {allocationDiff.length === 0 ? (
                <div className="text-slate-500 text-sm">No allocation data</div>
              ) : (
                <div className="w-full" style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={allocationDiff}
                      margin={{ left: 80, right: 40, top: 10, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis type="number" tickFormatter={(v) => currency(Number(v))} />
                      <YAxis dataKey="category" type="category" width={120} />
                      <Tooltip formatter={(v: any) => currency(Number(v))} />
                      <Legend />
                      <Bar dataKey="historical" fill="#cbd5e1" barSize={12}>
                        <LabelList dataKey="historical" position="right" formatter={(v: any) => currency(Number(v))} fontSize={11} />
                      </Bar>
                      <Bar dataKey="current" fill="#0ea5e9" barSize={12}>
                        <LabelList dataKey="current" position="right" formatter={(v: any) => currency(Number(v))} fontSize={11} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {!isLoading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="app-panel p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <TrendingUp size={16} /> Top movers by value
              </div>
              {topMovers.length === 0 ? (
                <div className="text-slate-500 text-sm">No holdings to compare.</div>
              ) : (
                <div className="w-full" style={{ height: isMobile ? 240 : 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={topMovers}
                      margin={{ left: isMobile ? 70 : 100, right: 20, top: 10, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis type="number" tickFormatter={(v) => currency(Number(v))} />
                      <YAxis dataKey="name" type="category" width={isMobile ? 120 : 160} tickFormatter={formatYAxisLabel} />
                      <Tooltip formatter={(v: any) => currency(Number(v))} />
                      <Bar dataKey="diff" barSize={14}>
                        {topMovers.map((item, idx) => (
                          <Cell
                            key={item.key}
                            fill={item.diff >= 0 ? PALETTE[idx % PALETTE.length] : "#f43f5e"}
                          />
                        ))}
                        <LabelList
                          dataKey="diff"
                          position="right"
                          formatter={(v: any) => currency(Number(v))}
                          fontSize={isMobile ? 10 : 11}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="app-panel p-4 sm:p-5">
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <ArrowRightLeft size={16} /> Quick stats
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
                <div className="app-panel-soft p-3 rounded-xl border border-cyan-100">
                  <div className="text-[11px] text-slate-500">Holdings compared</div>
                  <div className="text-lg font-semibold">{comparisonRows.length}</div>
                </div>
                <div className="app-panel-soft p-3 rounded-xl border border-emerald-100">
                  <div className="text-[11px] text-slate-500">Winners</div>
                  <div className="text-lg font-semibold text-emerald-700">
                    {comparisonRows.filter((r) => r.diff > 0).length}
                  </div>
                </div>
                <div className="app-panel-soft p-3 rounded-xl border border-amber-100">
                  <div className="text-[11px] text-slate-500">Exited</div>
                  <div className="text-lg font-semibold text-amber-700">
                    {comparisonRows.filter((r) => r.status === "exited").length}
                  </div>
                </div>
                <div className="app-panel-soft p-3 rounded-xl border border-rose-100">
                  <div className="text-[11px] text-slate-500">New</div>
                  <div className="text-lg font-semibold text-rose-600">
                    {comparisonRows.filter((r) => r.status === "new").length}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {!isLoading && !error && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="app-panel p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-600">
                <ArrowRightLeft size={16} /> Line-by-line comparison
              </div>
              <div className="text-xs text-slate-400">Matched by ISIN, otherwise by fund name + type</div>
            </div>

            {comparisonRows.length === 0 ? (
              <div className="text-slate-500 text-sm">No holdings to compare.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Fund</th>
                      <th className="px-3 py-2 text-left">Category</th>
                      <th className="px-3 py-2 text-right">Hist Qty</th>
                      <th className="px-3 py-2 text-right">Curr Qty</th>
                      <th className="px-3 py-2 text-right">Hist Value</th>
                      <th className="px-3 py-2 text-right">Curr Value</th>
                      <th className="px-3 py-2 text-right">Change</th>
                      <th className="px-3 py-2 text-right">Change %</th>
                      <th className="px-3 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows
                      .sort((a, b) => b.currValue - a.currValue)
                      .map((row) => (
                        <tr key={row.key} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800">
                            <div>{row.name}</div>
                            {row.isin && <div className="text-[11px] text-slate-400">{row.isin}</div>}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{row.subCategory || row.category}</td>
                          <td className="px-3 py-2 text-right">{row.histQty.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{row.currQty.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{currency(row.histValue)}</td>
                          <td className="px-3 py-2 text-right">{currency(row.currValue)}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${row.diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {currency(row.diff)}
                          </td>
                          <td className={`px-3 py-2 text-right ${row.diffPct !== null ? (row.diffPct >= 0 ? "text-emerald-600" : "text-rose-600") : "text-slate-500"}`}>
                            {row.diffPct === null ? "–" : percentage(row.diffPct)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {row.status === "new" && <span className="px-2 py-1 text-[11px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">New</span>}
                            {row.status === "exited" && <span className="px-2 py-1 text-[11px] rounded-full bg-amber-50 text-amber-700 border border-amber-100">Exited</span>}
                            {row.status === "kept" && <span className="px-2 py-1 text-[11px] rounded-full bg-slate-100 text-slate-700 border border-slate-200">Kept</span>}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {!isLoading && !error && comparisonRows.length === 0 && (
          <div className="flex items-center gap-2 text-slate-500 text-sm"><CircleOff size={16} /> Nothing to compare yet.</div>
        )}
      </div>
    </Layout>
  );
};

export default PortfolioComparison;
