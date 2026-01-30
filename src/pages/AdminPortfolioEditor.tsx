// src/pages/AdminPortfolioEditor.tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { motion } from "framer-motion";
import Logo from "../components/logo";

const API_BASE = import.meta.env.VITE_API_URL || '/pmsreports';

/* Types */
type PortfolioEntry = {
  id: number;
  portfolio_id: number;
  user_id: number;
  member_id?: number | null;
  valuation?: number | null;
  fund_name?: string | null;
  booking_date?: string | null;
  isin_no?: string | null;
  transaction_no?: string | null;
  created_at?: string;
  type?: string | null;
  units?: number | null;
  invested_amount?: number | null;
  nav?: number | null;
  category?: string | null;
  sub_category?: string | null;
};

export const AdminPortfolioEditor: React.FC = () => {
  const params = useParams<{ userId: string; requestId: string }>();
  const userId = Number(params.userId);
  const requestId = Number(params.requestId);
  const navigate = useNavigate();

  const [portfolioIds, setPortfolioIds] = useState<number[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [entries, setEntries] = useState<PortfolioEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [formState, setFormState] = useState<Partial<PortfolioEntry>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!userId) return;
    const loadIds = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/admin/user/${userId}/portfolio-ids`, { credentials: "include" });
        const data = await res.json();
        if (res.ok) {
          setPortfolioIds(data.portfolio_ids || []);
        } else {
          console.error(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadIds();
  }, [userId]);

  useEffect(() => {
    if (!userId || !selectedPortfolioId) {
      setEntries([]);
      return;
    }
    const loadEntries = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/admin/user/${userId}/portfolios?portfolio_id=${encodeURIComponent(String(selectedPortfolioId))}`, { credentials: "include" });
        const data = await res.json();
        if (res.ok && Array.isArray(data)) setEntries(data);
        else console.error(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadEntries();
  }, [userId, selectedPortfolioId]);

  useEffect(() => {
    if (!selectedEntryId) { setFormState({}); return; }
    const entry = entries.find((e) => e.id === selectedEntryId);
    if (!entry) return;
    setFormState({
      valuation: entry.valuation ?? null,
      fund_name: entry.fund_name ?? "",
      booking_date: entry.booking_date ?? "",
      isin_no: entry.isin_no ?? "",
      transaction_no: entry.transaction_no ?? "",
      type: entry.type ?? "",
      units: entry.units ?? null,
      invested_amount: entry.invested_amount ?? null,
      nav: entry.nav ?? null,
      category: entry.category ?? "",
      sub_category: entry.sub_category ?? "",
      member_id: entry.member_id ?? null,
    });
  }, [selectedEntryId, entries]);

  const handleChange = <K extends keyof PortfolioEntry>(k: K, v: PortfolioEntry[K] | null) => {
    setFormState((s) => ({ ...s, [k]: v }));
  };

  const handleSave = async () => {
    if (!selectedEntryId) { alert("Select an entry first"); return; }

    // Calculate changed fields vs original entry
    const orig = entries.find((e) => e.id === selectedEntryId);
    if (!orig) { alert("Original entry missing"); return; }

    const payload: Record<string, any> = {};
    const editableFields: (keyof PortfolioEntry)[] = ["valuation","fund_name","booking_date","isin_no","transaction_no","type","units","invested_amount","nav","category","sub_category","member_id"];

    for (const key of editableFields) {
      const newVal = (formState as any)[key];
      const origVal = (orig as any)[key];
      // Use simple comparison; convert null/undefined to string for safe comparison
      if (String(newVal ?? "") !== String(origVal ?? "")) {
        payload[key as string] = newVal;
      }
    }

    if (Object.keys(payload).length === 0) {
      alert("No changes to save");
      return;
    }

    setSaving(true);
    try {
      // Call perform endpoint: it will update the portfolio entry and mark service request completed
      const body = {
        portfolio_entry_id: selectedEntryId,
        fields: payload,
        admin_description: `Updated by admin on ${new Date().toLocaleString()}`
      };

      const res = await fetch(`${API_BASE}/admin/service-requests/${requestId}/perform`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Failed to update and complete request");
      } else {
        alert("Saved and request marked completed.");
        // go back to requests list
        navigate("/admin/service-requests");
      }
    } catch (e) {
      console.error(e);
      alert("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-8">
        <div className="flex items-center justify-between mb-6">

        {/* LEFT group → Logo + Title together */}
        <div className="flex items-center gap-4">
          <Logo className="w-44 h-auto" />
          <h1 className="text-2xl font-bold">Portfolio Editor — Admin</h1>
        </div>

        {/* RIGHT group → Button */}
        <div>
          <button
            onClick={() => navigate("/admin/service-requests")}
            className="px-3 py-2 bg-gray-100 rounded"
          >
            Back to Requests
          </button>
        </div>

      </div>


        <div className="bg-white rounded-xl p-6 shadow space-y-4">
          <div>
            <h3 className="font-semibold">Step 1 — Select portfolio_id for user {userId}</h3>
            {loading ? <p>Loading...</p> : (
              <div className="flex flex-wrap gap-2 mt-2">
                {portfolioIds.length === 0 && <div className="text-sm text-gray-500">No portfolios found for this user.</div>}
                {portfolioIds.map((pid) => (
                  <button key={pid} onClick={() => { setSelectedPortfolioId(pid); setSelectedEntryId(null); }} className={`px-3 py-1 rounded ${selectedPortfolioId === pid ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
                    {pid}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedPortfolioId && (
            <div>
              <h3 className="font-semibold">Step 2 — Choose entry inside portfolio_id {selectedPortfolioId}</h3>
              {loading ? <p>Loading...</p> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  {entries.map((e) => (
                    <div key={e.id} className={`p-3 rounded border ${selectedEntryId === e.id ? "border-blue-500 bg-blue-50" : "bg-white"}`}>
                      <div className="flex justify-between">
                        <div>
                          <div className="font-semibold">{e.fund_name}</div>
                          <div className="text-sm text-gray-600">id: {e.id} • valuation: {e.valuation ?? "-"}</div>
                        </div>
                        <div>
                          <button onClick={() => setSelectedEntryId(e.id)} className="px-2 py-1 bg-blue-600 text-white rounded">Edit</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedEntryId && (
            <div>
              <h3 className="font-semibold">Step 3 — Edit entry {selectedEntryId}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-sm">Fund Name</label>
                  <input value={(formState.fund_name ?? "") as string} onChange={(e) => handleChange("fund_name", e.target.value || null)} className="w-full border rounded px-2 py-1" />
                </div>

                <div>
                  <label className="block text-sm">Valuation</label>
                  <input type="number" value={(formState.valuation ?? "") as any} onChange={(e) => handleChange("valuation", e.target.value ? parseFloat(e.target.value) : null)} className="w-full border rounded px-2 py-1" />
                </div>

                <div>
                  <label className="block text-sm">Units</label>
                  <input type="number" value={(formState.units ?? "") as any} onChange={(e) => handleChange("units", e.target.value ? parseFloat(e.target.value) : null)} className="w-full border rounded px-2 py-1" />
                </div>

                <div>
                  <label className="block text-sm">Invested Amount</label>
                  <input type="number" value={(formState.invested_amount ?? "") as any} onChange={(e) => handleChange("invested_amount", e.target.value ? parseFloat(e.target.value) : null)} className="w-full border rounded px-2 py-1" />
                </div>

                <div>
                  <label className="block text-sm">NAV</label>
                  <input type="number" value={(formState.nav ?? "") as any} onChange={(e) => handleChange("nav", e.target.value ? parseFloat(e.target.value) : null)} className="w-full border rounded px-2 py-1" />
                </div>

                <div>
                  <label className="block text-sm">Category</label>
                  <input value={(formState.category ?? "") as string} onChange={(e) => handleChange("category", e.target.value || null)} className="w-full border rounded px-2 py-1" />
                </div>

                <div>
                  <label className="block text-sm">Sub Category</label>
                  <input value={(formState.sub_category ?? "") as string} onChange={(e) => handleChange("sub_category", e.target.value || null)} className="w-full border rounded px-2 py-1" />
                </div>

                <div>
                  <label className="block text-sm">ISIN</label>
                  <input value={(formState.isin_no ?? "") as string} onChange={(e) => handleChange("isin_no", e.target.value || null)} className="w-full border rounded px-2 py-1" />
                </div>

                <div>
                  <label className="block text-sm">Booking Date</label>
                  <input type="date" value={formState.booking_date ? String(formState.booking_date).split("T")[0] : ""} onChange={(e) => handleChange("booking_date", e.target.value || null)} className="w-full border rounded px-2 py-1" />
                </div>

                <div>
                  <label className="block text-sm">Transaction No</label>
                  <input value={(formState.transaction_no ?? "") as string} onChange={(e) => handleChange("transaction_no", e.target.value || null)} className="w-full border rounded px-2 py-1" />
                </div>

                <div>
                  <label className="block text-sm">Type</label>
                  <input value={(formState.type ?? "") as string} onChange={(e) => handleChange("type", e.target.value || null)} className="w-full border rounded px-2 py-1" />
                </div>

                <div>
                  <label className="block text-sm">Member ID</label>
                  <input type="number" value={(formState.member_id ?? "") as any} onChange={(e) => handleChange("member_id", e.target.value ? parseInt(e.target.value) : null)} className="w-full border rounded px-2 py-1" />
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded">
                  {saving ? "Saving..." : "Save & Complete Request"}
                </button>
                <button onClick={() => navigate("/admin/service-requests")} className="px-4 py-2 border rounded">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </Layout>
  );
};
