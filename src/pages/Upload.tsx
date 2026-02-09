import { useState } from 'react';
import { Layout } from '../components/Layout';
import { UploadForm } from '../components/UploadForm';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import Logo from '../components/logo';

export const Upload = () => {
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSuccess = () => {
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  return (
    <Layout>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-8">
        <div>
          <Logo className="mb-3" />
          <h1 className="app-title">Statement Upload Center</h1>
          <p className="app-subtitle mt-1">
            Import one or many statement files and instantly sync your portfolio.
          </p>
        </div>
      </div>
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 right-6 bg-emerald-500 text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 z-50"
          >
            <CheckCircle size={24} />
            <div>
              <p className="font-medium">Upload Successful!</p>
              <p className="text-sm text-emerald-100">Redirecting to dashboard...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-4xl">
        <UploadForm onSuccess={handleSuccess} />
      </div>
    </Layout>
  );
};
