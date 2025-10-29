import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { HistoryList } from '../components/HistoryList';
import { motion } from 'framer-motion';

interface HistoryItem {
  upload_id: string;
  upload_date: string;
  total_value: number;
}

const DUMMY_HISTORY: HistoryItem[] = [
  {
    upload_id: '1',
    upload_date: '2025-10-15',
    total_value: 420000,
  },
  {
    upload_id: '2',
    upload_date: '2025-09-28',
    total_value: 398000,
  },
  {
    upload_id: '3',
    upload_date: '2025-09-10',
    total_value: 385000,
  },
  {
    upload_id: '4',
    upload_date: '2025-08-22',
    total_value: 372000,
  },
];

export const History = () => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch('/history-data');
        if (response.ok) {
          const data = await response.json();
          setHistory(data);
        } else {
          setHistory(DUMMY_HISTORY);
        }
      } catch (error) {
        setHistory(DUMMY_HISTORY);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, []);

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Upload History</h1>
          <p className="text-gray-600">View your previous portfolio uploads</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <HistoryList items={history} />
        )}
      </motion.div>
    </Layout>
  );
};
