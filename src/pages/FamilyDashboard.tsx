import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { ChartCard } from '../components/ChartCard';
import { HoldingsTable, Holding } from '../components/HoldingsTable';
import { Users, TrendingUp, Eye, PlusCircle, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

export const FamilyDashboard = () => {
  const [familyData, setFamilyData] = useState<any | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [loadingAdd, setLoadingAdd] = useState(false);
  const navigate = useNavigate();

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        const [membersRes, familyRes] = await Promise.all([
          fetch(`${API_BASE}/family/members`, { credentials: 'include' }),
          fetch(`${API_BASE}/family/dashboard`, { credentials: 'include' }),
        ]);

        if (membersRes.status === 401 || familyRes.status === 401) {
          navigate('/login');
          return;
        }

        const membersData = await membersRes.json();
        const familyDashboard = await familyRes.json();

        setMembers(membersData || []);
        setFamilyData(familyDashboard);
      } catch (err: any) {
        console.error('❌ Error fetching family dashboard:', err);
        setError('Unable to fetch family data.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const handleAddMember = async () => {
    if (!form.name.trim()) {
      alert('Name is required.');
      return;
    }
    try {
      setLoadingAdd(true);
      const res = await fetch(`${API_BASE}/family/add-member`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add member.');
      }

      // Add to list dynamically
      setMembers((prev) => [...prev, data.member]);
      setForm({ name: '', email: '', phone: '' });
      setShowModal(false);
    } catch (err: any) {
      alert(err.message || 'Error adding member.');
    } finally {
      setLoadingAdd(false);
    }
  };

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

  const holdings: Holding[] = (familyData?.holdings || []).map((h: any) => ({
    company: h.fund_name || 'Unknown',
    isin: h.isin || h.isin_no || 'N/A',
    quantity: 0,
    value: parseFloat(h.value || h.closing_balance || 0),
    category: h.category || 'Mutual Fund',
  }));

  const totalValue = familyData?.total_value || 0;

  const chartData = [{ name: 'Total', value: totalValue }];

  return (
    <Layout>
      <div className="space-y-6 relative">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Family Dashboard</h1>
            <p className="text-gray-600 mt-1">
              Consolidated portfolio view for all family members.
            </p>
          </div>

          {/* Add Member Button */}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <PlusCircle size={18} /> Add Member
          </button>
        </div>

        {/* Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white shadow-md rounded-xl p-6 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-full">
              <Users size={28} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Total Family Portfolio</h3>
              <p className="text-2xl font-bold text-gray-800">
                ₹{totalValue.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Chart and Holdings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <ChartCard data={chartData} />
          </div>

          <div className="lg:col-span-2">
            <HoldingsTable holdings={holdings} />
          </div>
        </div>

        {/* Family Members */}
        <div className="bg-white rounded-xl shadow-md p-6 mt-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="text-blue-600" /> Family Members
          </h2>

          {members.length === 0 ? (
            <p className="text-gray-600">No family members added yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {members.map((member, index) => (
                <motion.div
                  key={member.member_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="bg-gray-50 rounded-xl shadow-sm p-4 flex flex-col justify-between"
                >
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">
                      {member.name}
                    </h3>
                    <p className="text-sm text-gray-500">{member.email || '—'}</p>
                    <p className="text-sm text-gray-500">{member.phone || '—'}</p>
                  </div>

                  <button
                    onClick={() => navigate(`/family/member/${member.member_id}`)}
                    className="mt-4 flex items-center justify-center gap-2 text-blue-600 hover:underline"
                  >
                    <Eye size={16} /> View Dashboard
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Add Member Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 relative">
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-800"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold mb-4">Add Family Member</h2>

              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="Phone (optional)"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end mt-6 gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddMember}
                  disabled={loadingAdd}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loadingAdd ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};
