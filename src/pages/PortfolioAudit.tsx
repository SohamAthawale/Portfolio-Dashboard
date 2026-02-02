import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, PlusCircle, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { motion } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_URL || '/pmsreports';

/* ===============================
   Types
=============================== */
interface PortfolioEntry {
  fund_name: string;
  isin_no: string;
  units: number;
  nav: number;
  valuation: number;
  category: string;
  sub_category: string;
  type: string;
}

interface DuplicateSummary {
  isin_no: string;
  fund_name: string;
  occurrences: number;
  sources: string[];
}

interface DuplicateDetail {
  id: number;
  isin_no: string;
  fund_name: string;
  units: number;
  nav: number;
  valuation: number;
  file_type: string;
  source_file: string;
  created_at: string;
  linked_portfolio_entry_id?: number | null;
}

/* ===============================
   Component
=============================== */
export default function PortfolioAudit() {
  const { portfolio_id } = useParams<{ portfolio_id: string }>();

  const [entries, setEntries] = useState<PortfolioEntry[]>([]);
  const [dupSummary, setDupSummary] = useState<DuplicateSummary[]>([]);
  const [dupDetails, setDupDetails] = useState<DuplicateDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* ===============================
     Load data
  =============================== */
  const load = async () => {
    try {
      setLoading(true);

      const [e, s, d] = await Promise.all([
        fetch(`${API_BASE}/portfolio/${portfolio_id}/entries`, {
          credentials: 'include',
        }),
        fetch(`${API_BASE}/portfolio/${portfolio_id}/duplicates/summary`, {
          credentials: 'include',
        }),
        fetch(`${API_BASE}/portfolio/${portfolio_id}/duplicates/detail`, {
          credentials: 'include',
        }),
      ]);

      if (!e.ok || !s.ok || !d.ok) {
        throw new Error('Failed to load portfolio audit data');
      }

      setEntries(await e.json());
      setDupSummary(await s.json());
      setDupDetails(await d.json());
    } catch (err: any) {
      setError(err.message || 'Error loading audit data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [portfolio_id]);

  /* ===============================
     Actions
  =============================== */
  const acceptDuplicate = async (dupId: number) => {
    await fetch(
      `${API_BASE}/portfolio/duplicates/${dupId}/accept`,
      { method: 'POST', credentials: 'include' }
    );
    load();
  };

  const removeDuplicate = async (dupId: number) => {
    await fetch(
      `${API_BASE}/portfolio/duplicates/${dupId}/remove`,
      { method: 'DELETE', credentials: 'include' }
    );
    load();
  };

  /* ===============================
     Loading / Error
  =============================== */
  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64 text-gray-600">
          Loading portfolio audit…
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      </Layout>
    );
  }

  /* ===============================
     UI
  =============================== */
  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="max-w-7xl mx-auto p-6"
      >
        <h1 className="text-3xl font-bold text-gray-800 mb-8">
          Portfolio Audit – ID {portfolio_id}
        </h1>

        {/* ===============================
           FINAL HOLDINGS
        =============================== */}
        <div className="bg-white shadow rounded-xl mb-10 overflow-x-auto">
          <h2 className="px-6 py-4 border-b font-semibold text-gray-800">
            Final Portfolio Holdings
          </h2>

          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">Fund</th>
                <th className="px-4 py-2">ISIN</th>
                <th className="px-4 py-2">Units</th>
                <th className="px-4 py-2">NAV</th>
                <th className="px-4 py-2">Value</th>
                <th className="px-4 py-2">Type</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className="border-t">
                  <td className="px-4 py-2">{e.fund_name}</td>
                  <td className="px-4 py-2">{e.isin_no || '—'}</td>
                  <td className="px-4 py-2 text-right">{e.units}</td>
                  <td className="px-4 py-2 text-right">{e.nav}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    ₹{e.valuation.toLocaleString()}
                  </td>
                  <td className="px-4 py-2">{e.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ===============================
           DUPLICATE SUMMARY
        =============================== */}
        <div className="bg-white shadow rounded-xl mb-10 overflow-x-auto">
          <h2 className="px-6 py-4 border-b font-semibold text-gray-800 flex items-center gap-2">
            <AlertTriangle className="text-yellow-500" size={18} />
            Duplicate Summary
          </h2>

          {dupSummary.length === 0 ? (
            <div className="p-6 text-gray-600">
              No duplicates found across uploaded files 🎉
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-2 text-left">ISIN</th>
                  <th className="px-4 py-2 text-left">Fund</th>
                  <th className="px-4 py-2">Occurrences</th>
                  <th className="px-4 py-2">Sources</th>
                </tr>
              </thead>
              <tbody>
                {dupSummary.map((d, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-2">{d.isin_no || '—'}</td>
                    <td className="px-4 py-2">{d.fund_name}</td>
                    <td className="px-4 py-2 text-center font-semibold">
                      {d.occurrences}
                    </td>
                    <td className="px-4 py-2">{d.sources.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ===============================
           DUPLICATE DETAIL + ACTIONS
        =============================== */}
        {dupDetails.length > 0 && (
          <div className="bg-white shadow rounded-xl overflow-x-auto">
            <h2 className="px-6 py-4 border-b font-semibold text-gray-800">
              Duplicate Detail (Audit Trail)
            </h2>

            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-2 text-left">ISIN</th>
                  <th className="px-4 py-2 text-left">Fund</th>
                  <th className="px-4 py-2">Units</th>
                  <th className="px-4 py-2">NAV</th>
                  <th className="px-4 py-2">Value</th>
                  <th className="px-4 py-2">File</th>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {dupDetails.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="px-4 py-2">{d.isin_no || '—'}</td>
                    <td className="px-4 py-2">{d.fund_name}</td>
                    <td className="px-4 py-2 text-right">{d.units}</td>
                    <td className="px-4 py-2 text-right">{d.nav}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      ₹{d.valuation.toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{d.source_file}</td>
                    <td className="px-4 py-2">{d.file_type}</td>
                    <td className="px-4 py-2">
                      {!d.linked_portfolio_entry_id ? (
                        <button
                          onClick={() => acceptDuplicate(d.id)}
                          className="text-green-600 hover:underline flex items-center gap-1"
                        >
                          <PlusCircle size={16} /> Add
                        </button>
                      ) : (
                        <button
                          onClick={() => removeDuplicate(d.id)}
                          className="text-red-600 hover:underline flex items-center gap-1"
                        >
                          <Trash2 size={16} /> Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </Layout>
  );
}
