import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, CheckCircle, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

// ✅ Centralize backend URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

interface UploadFormProps {
  onSuccess: () => void;
}

export const UploadForm: React.FC<UploadFormProps> = ({ onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  // ✅ Fetch family members
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await fetch(`${API_BASE}/family/members`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setMembers(data);
        }
      } catch (err) {
        console.error('❌ Error fetching members:', err);
      }
    };
    fetchMembers();
  }, []);

  // ✅ File selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === 'application/pdf') {
        setFile(selectedFile);
        setError('');
      } else {
        setError('Please select a PDF file');
        setFile(null);
      }
    }
  };

  // ✅ Submit upload
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user?.email) {
      setError('No file selected or user not logged in.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setError('');

    const password = prompt('Enter PDF password (if applicable):') || '';
    const formData = new FormData();
    formData.append('file', file);
    formData.append('email', user.email);
    formData.append('password', password);

    // ✅ Add member_id if selected
    if (selectedMember) {
      formData.append('member_id', selectedMember);
    }

    // ✅ Choose endpoint dynamically
    const endpoint = selectedMember
      ? `${API_BASE}/upload-member`
      : `${API_BASE}/upload`;

    try {
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
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
        console.log('✅ Upload success:', data);
        setTimeout(() => {
          onSuccess();
          // ✅ Redirect to unified dashboard
          navigate('/dashboard');
        }, 500);
      } else {
        setError(data.error || 'Upload failed. Please try again.');
        setUploadProgress(0);
      }
    } catch (err) {
      console.error('❌ Network error:', err);
      setError('Network error. Please check your connection.');
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-xl shadow-lg p-8 max-w-2xl mx-auto"
    >
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
          <Upload className="text-blue-600" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Upload ECAS Statement</h2>
        <p className="text-gray-600">
          Upload your PDF statement for yourself or a family member
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ✅ Interactive Family Member Cards */}
        {members.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-800 mb-3">
              Upload For
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* Myself card */}
              <motion.button
                type="button"
                onClick={() => setSelectedMember('')}
                whileTap={{ scale: 0.97 }}
                className={`p-3 border rounded-xl flex flex-col items-center justify-center gap-1 text-sm transition ${
                  selectedMember === ''
                    ? 'border-blue-500 bg-blue-50 text-blue-600 font-semibold shadow-sm'
                    : 'border-gray-300 hover:border-blue-400 text-gray-700'
                }`}
              >
                <Users size={20} />
                Myself
              </motion.button>

              {/* Family Member cards */}
              {members.map((m) => (
                <motion.button
                  key={m.member_id}
                  type="button"
                  onClick={() => setSelectedMember(m.member_id)}
                  whileTap={{ scale: 0.97 }}
                  className={`p-3 border rounded-xl flex flex-col items-center justify-center gap-1 text-sm transition ${
                    selectedMember === m.member_id
                      ? 'border-blue-500 bg-blue-50 text-blue-600 font-semibold shadow-sm'
                      : 'border-gray-300 hover:border-blue-400 text-gray-700'
                  }`}
                >
                  <Users size={20} />
                  {m.name}
                </motion.button>
              ))}
            </div>

            <p className="text-xs text-gray-500 mt-2">
              Select whose portfolio statement you’re uploading.
            </p>
          </div>
        )}

        {/* File Upload */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
          <input
            type="file"
            id="file-upload"
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          <label htmlFor="file-upload" className="cursor-pointer">
            <FileText className="mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-gray-700 font-medium mb-2">
              {file ? file.name : 'Click to select a PDF file'}
            </p>
            <p className="text-sm text-gray-500">Maximum file size: 10MB</p>
          </label>
        </div>

        {/* File Selected */}
        <AnimatePresence>
          {file && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4"
            >
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="text-green-600" size={20} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800">{file.name}</p>
                  <p className="text-xs text-green-600">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload Progress */}
        {isUploading && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Uploading...</span>
              <span className="text-sm font-medium text-blue-600">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${uploadProgress}%` }}
                className="bg-blue-600 h-full"
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!file || isUploading}
          className="w-full mt-6 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUploading ? 'Uploading...' : 'Upload Statement'}
        </button>
      </form>
    </motion.div>
  );
};
