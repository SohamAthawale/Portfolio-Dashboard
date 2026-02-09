import { useNavigate } from 'react-router-dom';
import { Calendar, TrendingUp, Eye } from 'lucide-react';
import { motion } from 'framer-motion';

interface HistoryItem {
  upload_id: string;
  upload_date: string;
  total_value: number;
}

interface HistoryListProps {
  items: HistoryItem[];
}

export const HistoryList: React.FC<HistoryListProps> = ({ items }) => {
  const navigate = useNavigate();

  const handleViewPortfolio = (uploadId: string) => {
    navigate(`/portfolio/${uploadId}`);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.length === 0 ? (
        <div className="col-span-full text-center py-12 text-slate-500">
          No upload history available
        </div>
      ) : (
        items.map((item, index) => (
          <motion.div
            key={item.upload_id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="app-panel p-6 hover:shadow-2xl transition-shadow"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-cyan-100 rounded-lg">
                <Calendar className="text-cyan-700" size={20} />
              </div>
              <div>
                <p className="text-sm text-slate-600">Upload Date</p>
                <p className="font-medium text-slate-800">
                  {new Date(item.upload_date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <TrendingUp className="text-emerald-600" size={20} />
              </div>
              <div>
                <p className="text-sm text-slate-600">Total Value</p>
                <p className="text-xl font-bold text-slate-800">
                  ₹{item.total_value.toLocaleString()}
                </p>
              </div>
            </div>

            <button
              onClick={() => handleViewPortfolio(item.upload_id)}
              className="btn-primary w-full"
            >
              <Eye size={18} />
              View Portfolio
            </button>
          </motion.div>
        ))
      )}
    </div>
  );
};
