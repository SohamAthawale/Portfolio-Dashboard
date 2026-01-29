import { useState, useMemo } from "react";
import { Search, ArrowUpDown } from "lucide-react";

/* =======================
   TYPES
======================= */

export interface Holding {
  company?: string;
  isin?: string;
  category?: string;
  sub_category?: string;
  type?: string;
  invested_amount?: number;
  quantity?: number;
  nav?: number;
  value?: number;
  returns?: {
    "1y"?: number;
    "3y"?: number;
    "5y"?: number;
    "10y"?:number;
  };
  [key: string]: any;
}

interface HoldingsTableProps {
  holdings: Holding[];
}

type SortField =
  | "company"
  | "value"
  | "category"
  | "nav"
  | "invested_amount"
  | "return_1y"
  | "return_3y"
  | "return_5y"
  | "return_10y";

type SortDirection = "asc" | "desc";

/* =======================
   HELPERS
======================= */

const normalize = (str: any) =>
  str === null || str === undefined
    ? ""
    : String(str)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "")
        .replace(/[^a-z0-9]/g, "");

const fmt = (n?: number) =>
  n !== undefined && !isNaN(n)
    ? `₹${Number(n).toLocaleString("en-IN", {
        maximumFractionDigits: 2,
      })}`
    : "-";

const fmtPct = (v?: number) =>
  typeof v === "number" ? `${v.toFixed(2)}%` : "—";

const returnColor = (v?: number) => {
  if (typeof v !== "number") return "text-gray-400";
  if (v > 0) return "text-green-600";
  if (v < 0) return "text-red-600";
  return "text-gray-500";
};

/* =======================
   COMPONENT
======================= */

export const HoldingsTable: React.FC<HoldingsTableProps> = ({ holdings }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const filteredAndSortedHoldings = useMemo(() => {
    const term = normalize(searchTerm);

    const filtered = holdings.filter((h) => {
      return (
        normalize(h.company).includes(term) ||
        normalize(h.isin).includes(term) ||
        normalize(h.category).includes(term) ||
        normalize(h.sub_category).includes(term) ||
        normalize(h.type).includes(term)
      );
    });

    const getSortValue = (h: Holding) => {
      if (sortField === "return_1y") return h.returns?.["1y"] ?? -Infinity;
      if (sortField === "return_3y") return h.returns?.["3y"] ?? -Infinity;
      if (sortField === "return_5y") return h.returns?.["5y"] ?? -Infinity;
      if (sortField === "return_10y") return h.returns?.["10y"] ?? -Infinity;
      return h[sortField];
    };

    filtered.sort((a, b) => {
      const aVal = getSortValue(a);
      const bVal = getSortValue(b);

      if (typeof aVal === "string" || typeof bVal === "string") {
        return sortDirection === "asc"
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      }

      const aNum = Number(aVal) || 0;
      const bNum = Number(bVal) || 0;

      return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
    });

    return filtered;
  }, [holdings, searchTerm, sortField, sortDirection]);

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
            placeholder="Search company, ISIN, category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-200">
              <th
                onClick={() => handleSort("company")}
                className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center gap-2">
                  Company / Scheme <ArrowUpDown size={14} />
                </div>
              </th>

              <th className="text-left py-3 px-4 font-medium text-gray-700">
                ISIN
              </th>

              <th className="text-right py-3 px-4 font-medium text-gray-700">
                Qty
              </th>

              <th
                onClick={() => handleSort("nav")}
                className="text-right py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
              >
                <div className="flex justify-end gap-2">
                  NAV <ArrowUpDown size={14} />
                </div>
              </th>

              <th
                onClick={() => handleSort("invested_amount")}
                className="text-right py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
              >
                <div className="flex justify-end gap-2">
                  Invested <ArrowUpDown size={14} />
                </div>
              </th>

              <th
                onClick={() => handleSort("value")}
                className="text-right py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
              >
                <div className="flex justify-end gap-2">
                  Current Value <ArrowUpDown size={14} />
                </div>
              </th>

              {/* RETURNS */}
              <th
                onClick={() => handleSort("return_1y")}
                className="text-right py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
              >
                1Y %
              </th>
              <th
                onClick={() => handleSort("return_3y")}
                className="text-right py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
              >
                3Y %
              </th>
              <th
                onClick={() => handleSort("return_5y")}
                className="text-right py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
              >
                5Y %
              </th>
              <th
                onClick={() => handleSort("return_10y")}
                className="text-right py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
              >
                10Y %
              </th>

              <th className="text-left py-3 px-4 font-medium text-gray-700">
                Category
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredAndSortedHoldings.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-8 text-gray-500">
                  No holdings found
                </td>
              </tr>
            ) : (
              filteredAndSortedHoldings.map((h, i) => (
                <tr
                  key={i}
                  className={`border-b transition ${
                    i % 2 === 0 ? "bg-white" : "bg-gray-50"
                  } hover:bg-gray-100`}
                >
                  <td className="py-3 px-4 font-medium text-gray-800">
                    {h.company}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {h.isin}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {h.quantity}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {fmt(h.nav)}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {fmt(h.invested_amount)}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-gray-800">
                    {fmt(h.value)}
                  </td>

                  {/* RETURNS */}
                  <td
                    className={`py-3 px-4 text-right font-medium ${returnColor(
                      h.returns?.["1y"]
                    )}`}
                  >
                    {fmtPct(h.returns?.["1y"])}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-medium ${returnColor(
                      h.returns?.["3y"]
                    )}`}
                  >
                    {fmtPct(h.returns?.["3y"])}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-medium ${returnColor(
                      h.returns?.["5y"]
                    )}`}
                  >
                    {fmtPct(h.returns?.["5y"])}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-medium ${returnColor(
                      h.returns?.["10y"]
                    )}`}
                  >
                    {fmtPct(h.returns?.["10y"])}
                  </td>

                  <td className="py-3 px-4 text-gray-700">
                    {h.category}
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
