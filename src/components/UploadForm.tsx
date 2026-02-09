import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Users, Plus, Trash2, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '/pmsreports';

interface UploadFormProps {
  onSuccess: () => void;
}

interface UploadItem {
  id: number;
  file: File | null;
  fileType: string;
  password?: string;
}

export const UploadForm: React.FC<UploadFormProps> = ({ onSuccess }) => {
  const [uploads, setUploads] = useState<UploadItem[]>([
    { id: Date.now(), file: null, fileType: '', password: '' },
  ]);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState<number | null>(null);

  const navigate = useNavigate();
  const { user } = useAuth();

  /* ===============================
     Fetch family members
  =============================== */
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await fetch(`${API_BASE}/family/members`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setMembers(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('❌ Error fetching members:', err);
      }
    };
    fetchMembers();
  }, []);

  /* ===============================
     Upload row helpers
  =============================== */
  const updateUpload = (
    id: number,
    field: 'file' | 'fileType' | 'password',
    value: any
  ) => {
    setUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, [field]: value } : u))
    );
  };

  const addUploadRow = () => {
    setUploads((prev) => [
      ...prev,
      { id: Date.now(), file: null, fileType: '', password: '' },
    ]);
  };

  const removeUploadRow = (id: number) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  };

  /* ===============================
     Submit
  =============================== */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !user?.email ||
      uploads.length === 0 ||
      uploads.some((u) => !u.file || !u.fileType)
    ) {
      setError('Please select statement type and file for all uploads.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setError('');

    const formData = new FormData();

    // backend currently expects email for /upload
    formData.append('email', user.email);

    // ✅ CORRECT: Flask expects repeated [] keys
    uploads.forEach((u) => {
      formData.append('files[]', u.file as File);
      formData.append('file_types[]', u.fileType);
      formData.append('passwords[]', u.password || '');
    });

    if (selectedMember !== null) {
      formData.append('member_id', String(selectedMember));
    }

    const endpoint =
      selectedMember !== null
        ? `${API_BASE}/upload-member`
        : `${API_BASE}/upload`;

    try {
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => (prev >= 90 ? 90 : prev + 10));
      }, 200);

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await response.json();

      if (response.ok) {
        setTimeout(() => {
          onSuccess();
          navigate('/dashboard');
        }, 500);
      } else {
        setError(data.error || 'Upload failed.');
        setUploadProgress(0);
      }
    } catch (err) {
      console.error('❌ Upload error:', err);
      setError('Network error. Please try again.');
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  /* ===============================
     UI
  =============================== */
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="app-panel p-6 sm:p-8 max-w-3xl mx-auto"
    >
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-cyan-50 border border-cyan-100 rounded-2xl mb-4">
          <Upload className="text-cyan-700" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Upload ECAS Statements
        </h2>
        <p className="text-slate-500">
          Upload one or multiple PDF statements together
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ===============================
           Upload For
        =============================== */}
        {members.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Upload For
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className={`p-3 border rounded-xl text-sm transition ${
                  selectedMember === null
                    ? 'border-cyan-400 bg-cyan-50 text-cyan-700'
                    : 'border-slate-200 text-slate-700 bg-white'
                }`}
              >
                <Users className="mx-auto mb-1" size={18} />
                Myself
              </button>

              {members.map((m) => (
                <button
                  key={m.member_id}
                  type="button"
                  onClick={() => setSelectedMember(m.member_id)}
                  className={`p-3 border rounded-xl text-sm transition ${
                    selectedMember === m.member_id
                      ? 'border-cyan-400 bg-cyan-50 text-cyan-700'
                      : 'border-slate-200 text-slate-700 bg-white'
                  }`}
                >
                  <Users className="mx-auto mb-1" size={18} />
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ===============================
           Upload Items
        =============================== */}
        {uploads.map((u, index) => (
          <div key={u.id} className="mb-6 app-panel-soft p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="font-semibold text-slate-800">
                Statement {index + 1}
              </span>
              {uploads.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeUploadRow(u.id)}
                  className="text-rose-500"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <select
              value={u.fileType}
              onChange={(e) =>
                updateUpload(u.id, 'fileType', e.target.value)
              }
              required
              className="app-select mb-3"
            >
              <option value="">Select statement type</option>
              <option value="ecas_nsdl">ECAS-NSDL</option>
              <option value="ecas_cdsl">ECAS-CDSL</option>
              <option value="ecas_cams">ECAS-CAMS</option>
            </select>

            <input
              type="file"
              accept=".pdf"
              onChange={(e) =>
                updateUpload(u.id, 'file', e.target.files?.[0] || null)
              }
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800"
            />

            <div className="relative mt-3">
              <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="password"
                placeholder="PDF password (if any)"
                value={u.password || ''}
                onChange={(e) =>
                  updateUpload(u.id, 'password', e.target.value)
                }
                className="app-input pl-9 text-sm"
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addUploadRow}
          className="w-full mb-4 border border-dashed border-cyan-300 text-cyan-700 py-2.5 rounded-xl flex items-center justify-center gap-2 font-semibold hover:bg-cyan-50 transition"
        >
          <Plus size={16} /> Add another statement
        </button>

        {/* Progress */}
        {isUploading && (
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1 text-slate-600">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <motion.div
                animate={{ width: `${uploadProgress}%` }}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 h-2 rounded-full"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={
            isUploading ||
            uploads.some((u) => !u.file || !u.fileType)
          }
          className="btn-primary w-full"
        >
          {isUploading ? 'Uploading...' : 'Upload Statements'}
        </button>
      </form>
    </motion.div>
  );
};
