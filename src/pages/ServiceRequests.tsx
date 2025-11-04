import React from 'react';
import { Layout } from '../components/Layout';

export const ServiceRequests: React.FC = () => {
  return (
    <Layout>
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-4 text-gray-800">
          Service Requests
        </h1>
        <p className="text-gray-600">
          Here, admins can view and manage user service requests.
        </p>
      </div>
    </Layout>
  );
};
