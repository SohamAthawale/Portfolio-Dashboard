import { useState, useMemo } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';

// ✅ Exported so Dashboard can import the same type
export interface Holding {
  company: string;
  isin: string;
  quantity?: number; // optional → backend doesn’t have to send it
  value: number;
  category: string;
}

interface HoldingsTableProps {
  holdings: Holding[];
}

type SortField = 'company' | 'value' | 'category';
type SortDirection = 'asc' | 'desc';

export const HoldingsTable: React.FC<HoldingsTableProps> = ({ holdings }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredAndSortedHoldings = useMemo(() => {
    let filtered = holdings.filter(
      (holding) =>
        holding.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        holding.isin.toLowerCase().includes(searchTerm.toLowerCase()) ||
        holding.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      let aVal: string | number = a[sortField];
      let bVal: string | number = b[sortField];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [holdings, searchTerm, sortField, sortDirection]);

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-800">Holdings</h3>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search holdings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th
                className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSort('company')}
              >
                <div className="flex items-center gap-2">
                  Company
                  <ArrowUpDown size={16} />
                </div>
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-700">ISIN</th>
              <th className="text-right py-3 px-4 font-medium text-gray-700">
                Quantity
              </th>
              <th
                className="text-right py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSort('value')}
              >
                <div className="flex items-center justify-end gap-2">
                  Value
                  <ArrowUpDown size={16} />
                </div>
              </th>
              <th
                className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSort('category')}
              >
                <div className="flex items-center gap-2">
                  Category
                  <ArrowUpDown size={16} />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedHoldings.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-500">
                  No holdings found
                </td>
              </tr>
            ) : (
              filteredAndSortedHoldings.map((holding, index) => (
                <tr
                  key={holding.isin}
                  className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  }`}
                >
                  <td className="py-3 px-4 font-medium text-gray-800">
                    {holding.company}
                  </td>
                  <td className="py-3 px-4 text-gray-600 text-sm">{holding.isin}</td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {holding.quantity ?? '-'}
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-gray-800">
                    ₹{holding.value.toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                        holding.category === 'Equity'
                          ? 'bg-blue-100 text-blue-700'
                          : holding.category === 'Mutual Fund'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}
                    >
                      {holding.category}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        Showing {filteredAndSortedHoldings.length} of {holdings.length} holdings
      </div>
    </div>
  );
};
