import { useState, useMemo } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';

// ✅ Exported so Dashboard & Snapshot can import the same type
export interface Holding {
  company?: string;
  isin?: string;
  quantity?: number;
  nav?: number;
  invested_amount?: number;
  value?: number;
  category?: string;
  type?: string;
  scheme_type?: string;
  amc?: string;
}

interface HoldingsTableProps {
  holdings: Holding[];
}

type SortField = 'company' | 'value' | 'category' | 'nav' | 'invested_amount';
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
    let filtered = holdings.filter((h) => {
      const company = (h.company ?? '').toLowerCase();
      const isin = (h.isin ?? '').toLowerCase();
      const category = (h.category ?? '').toLowerCase();
      const term = searchTerm.toLowerCase();
      return (
        company.includes(term) || isin.includes(term) || category.includes(term)
      );
    });

    filtered.sort((a, b) => {
      const aVal = (a[sortField] ?? '') as string | number;
      const bVal = (b[sortField] ?? '') as string | number;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      const aNum = Number(aVal) || 0;
      const bNum = Number(bVal) || 0;
      return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
    });

    return filtered;
  }, [holdings, searchTerm, sortField, sortDirection]);

  const fmtCurrency = (n?: number) =>
    n !== undefined && !isNaN(n)
      ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
      : '-';

  return (
    <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
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
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-200">
              <th
                className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('company')}
              >
                <div className="flex items-center gap-2">
                  Company
                  <ArrowUpDown size={14} />
                </div>
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-700">
                ISIN
              </th>
              <th className="text-right py-3 px-4 font-medium text-gray-700">
                Quantity
              </th>
              <th
                className="text-right py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('nav')}
              >
                <div className="flex items-center justify-end gap-2">
                  NAV
                  <ArrowUpDown size={14} />
                </div>
              </th>
              <th
                className="text-right py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('invested_amount')}
              >
                <div className="flex items-center justify-end gap-2">
                  Invested
                  <ArrowUpDown size={14} />
                </div>
              </th>
              <th
                className="text-right py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('value')}
              >
                <div className="flex items-center justify-end gap-2">
                  Current Value
                  <ArrowUpDown size={14} />
                </div>
              </th>
              <th
                className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('category')}
              >
                <div className="flex items-center gap-2">
                  Category
                  <ArrowUpDown size={14} />
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredAndSortedHoldings.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">
                  No holdings found
                </td>
              </tr>
            ) : (
              filteredAndSortedHoldings.map((h, i) => (
                <tr
                  key={h.isin ?? i}
                  className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  }`}
                >
                  <td className="py-3 px-4 font-medium text-gray-800">
                    {h.company || 'Unknown'}
                  </td>
                  <td className="py-3 px-4 text-gray-600 text-sm">
                    {h.isin || '-'}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {h.quantity ? h.quantity.toFixed(2) : '-'}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {h.nav ? `₹${h.nav.toFixed(2)}` : '-'}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {fmtCurrency(h.invested_amount)}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-gray-800">
                    {fmtCurrency(h.value)}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                        (h.category || '').toLowerCase().includes('equity')
                          ? 'bg-blue-100 text-blue-700'
                          : (h.category || '').toLowerCase().includes('debt')
                          ? 'bg-yellow-100 text-yellow-700'
                          : (h.category || '').toLowerCase().includes('hybrid')
                          ? 'bg-purple-100 text-purple-700'
                          : (h.category || '').toLowerCase().includes('gold')
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {h.category || '—'}
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
