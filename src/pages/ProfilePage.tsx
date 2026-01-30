import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Navigate } from 'react-router-dom';
import { Users, PlusCircle, Mail, Phone, Clock, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
const API_BASE = import.meta.env.VITE_API_URL || '/pmsreports';

interface FamilyMember {
  member_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  created_at?: string;
}

export const ProfilePage = () => {
  const { user } = useAuth();
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [uploadHistoryCount, setUploadHistoryCount] = useState<number>(0);
  const [showForm, setShowForm] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', email: '', phone: '' });
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  // 🚫 BLOCK ADMIN -> redirect to admin dashboard
  if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [famRes, histRes] = await Promise.all([
          fetch(`${API_BASE}/family/members`, { credentials: 'include' }),
          fetch(`${API_BASE}/history-data`, { credentials: 'include' })
        ]);

        const family = await famRes.json();
        const history = await histRes.json();

        setFamilyMembers(Array.isArray(family) ? family : []);
        setUploadHistoryCount(Array.isArray(history) ? history.length : 0);
      } catch (error) {
        console.error('❌ Error fetching profile data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // ADD MEMBER
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMember.name.trim()) {
      alert('Name is required');
      return;
    }

    setAdding(true);

    try {
      const res = await fetch(`${API_BASE}/family/add-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newMember),
      });

      const data = await res.json();

      if (res.ok) {
        setFamilyMembers((prev) => [...prev, data.member]);
        setNewMember({ name: '', email: '', phone: '' });
        setShowForm(false);
      } else {
        alert(data.error || 'Error adding member');
      }
    } catch (error) {
      console.error('❌ Error adding family member:', error);
    } finally {
      setAdding(false);
    }
  };

  // DELETE MEMBER
  const handleDeleteMember = async (member_id: number) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this family member?');
    if (!confirmDelete) return;

    setDeleting(member_id);

    try {
      const res = await fetch(`${API_BASE}/family/delete-member/${member_id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();

      if (res.ok) {
        setFamilyMembers((prev) => prev.filter((m) => m.member_id !== member_id));
      } else {
        alert(data.error || 'Error deleting member');
      }
    } catch (error) {
      console.error('❌ Error deleting family member:', error);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Layout>
      <div className="p-8">
        <h1 className="text-2xl font-semibold mb-6">User Profile</h1>

        {/* USER INFO */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <p className="text-lg font-medium text-gray-800 mb-2">{user?.email}</p>
          <p className="text-gray-600">Welcome to your family dashboard.</p>
        </div>

        {/* SUMMARY CARDS */}
        {loading ? (
          <p>Loading data...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            <motion.div whileHover={{ scale: 1.02 }} className="bg-white p-6 rounded-xl shadow-sm flex items-center gap-4">
              <Users size={32} className="text-blue-500" />
              <div>
                <p className="text-gray-600 text-sm">Family Members</p>
                <p className="text-xl font-semibold">{familyMembers.length}</p>
              </div>
            </motion.div>

            <motion.div whileHover={{ scale: 1.02 }} className="bg-white p-6 rounded-xl shadow-sm flex items-center gap-4">
              <Clock size={32} className="text-purple-500" />
              <div>
                <p className="text-gray-600 text-sm">Total Uploads</p>
                <p className="text-xl font-semibold">{uploadHistoryCount}</p>
              </div>
            </motion.div>
          </div>
        )}

        {/* ADD MEMBER BUTTON */}
        <div className="mb-6">
          <button
            onClick={() => setShowForm((prev) => !prev)}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg shadow hover:bg-blue-700 transition"
          >
            <PlusCircle size={18} />
            {showForm ? 'Cancel' : 'Add Family Member'}
          </button>
        </div>

        {/* ADD MEMBER FORM */}
        {showForm && (
          <form
            onSubmit={handleAddMember}
            className="bg-white rounded-xl shadow-sm p-6 mb-8 space-y-4 max-w-md"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 focus:ring focus:ring-blue-100"
                value={newMember.name}
                onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                className="w-full border rounded-lg px-3 py-2 focus:ring focus:ring-blue-100"
                value={newMember.email}
                onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 focus:ring focus:ring-blue-100"
                value={newMember.phone}
                onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
              />
            </div>

            <button
              type="submit"
              disabled={adding}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg shadow hover:bg-blue-700 transition disabled:opacity-50"
            >
              {adding ? 'Adding...' : 'Add Member'}
            </button>
          </form>
        )}

        {/* FAMILY MEMBER LIST */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Family Members</h2>

          {familyMembers.length === 0 ? (
            <p className="text-gray-500">No family members added yet.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {familyMembers.map((m) => (
                <motion.div key={m.member_id} whileHover={{ scale: 1.02 }} className="border rounded-lg p-4 flex flex-col gap-2 relative">
                  <button
                    onClick={() => handleDeleteMember(m.member_id)}
                    disabled={deleting === m.member_id}
                    className="absolute top-3 right-3 text-red-500 hover:text-red-700 transition"
                  >
                    {deleting === m.member_id ? (
                      <span className="text-xs text-gray-400">Deleting...</span>
                    ) : (
                      <Trash2 size={18} />
                    )}
                  </button>

                  <p className="font-medium text-gray-800">{m.name}</p>

                  {m.email && (
                    <p className="text-sm text-gray-600 flex items-center gap-2">
                      <Mail size={14} /> {m.email}
                    </p>
                  )}

                  {m.phone && (
                    <p className="text-sm text-gray-600 flex items-center gap-2">
                      <Phone size={14} /> {m.phone}
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};
