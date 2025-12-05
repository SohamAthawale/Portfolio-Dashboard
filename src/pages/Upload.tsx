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
      <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
          <div>
            <Logo className="w-40 mb-4 h-auto" />
          </div>
        </div>
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-20 right-6 bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 z-50"
          >
            <CheckCircle size={24} />
            <div>
              <p className="font-medium">Upload Successful!</p>
              <p className="text-sm text-green-100">Redirecting to dashboard...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-4xl mx-auto">
        <UploadForm onSuccess={handleSuccess} />
      </div>
    </Layout>
  );
};
