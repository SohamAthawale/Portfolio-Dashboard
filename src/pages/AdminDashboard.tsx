import { Layout } from '../components/Layout';
import { motion } from 'framer-motion';
import { BarChart3, Users, Database } from 'lucide-react';

export const AdminDashboard = () => {
  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-8"
      >
        <h1 className="text-3xl font-bold text-gray-800 mb-4">Admin Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-lg flex items-center gap-4">
            <Users className="text-blue-600" size={28} />
            <div>
              <h3 className="font-semibold text-gray-800">Users</h3>
              <p className="text-gray-600">Manage registered users</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-lg flex items-center gap-4">
            <Database className="text-green-600" size={28} />
            <div>
              <h3 className="font-semibold text-gray-800">Portfolios</h3>
              <p className="text-gray-600">Review uploaded portfolios</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-lg flex items-center gap-4">
            <BarChart3 className="text-purple-600" size={28} />
            <div>
              <h3 className="font-semibold text-gray-800">Analytics</h3>
              <p className="text-gray-600">View system metrics</p>
            </div>
          </div>
        </div>
      </motion.div>
    </Layout>
  );
};
