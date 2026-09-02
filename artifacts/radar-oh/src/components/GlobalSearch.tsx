import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { fetchRadarSearch } from "../data/radarApi";
import type { RadarSearchResponseResultsItem } from "@workspace/api-client-react";

export default function GlobalSearch({ onNavigate }: { onNavigate: (tab: string, id?: string | null) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RadarSearchResponseResultsItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await fetchRadarSearch(query);
        setResults(data.results || []);
        setIsOpen(true);
      } catch (err) {
        console.error("Search error", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (result: RadarSearchResponseResultsItem) => {
    setIsOpen(false);
    setQuery("");
    let tab = "resumen";
    let id: string | null = null;
    
    switch (result.type) {
      case "competitor":
        tab = "competidores";
        id = result.id;
        break;
      case "source":
        tab = "fuentes";
        break;
      case "event":
        tab = "historial";
        break;
      case "insight":
        tab = "insights";
        break;
      default:
        tab = "resumen";
    }
    
    onNavigate(tab, id);
  };

  return (
    <div className="relative" ref={searchRef}>
      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 w-64 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
        <Search size={14} className="text-gray-400" />
        <input
          type="text"
          placeholder="Buscar inteligencia..."
          className="bg-transparent border-none outline-none text-sm w-full text-gray-800 dark:text-gray-200"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
        />
        {loading && <div className="rdo-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full" />}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-2 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {results.map((res, i) => (
            <div 
              key={`${res.id}-${i}`} 
              className="p-3 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
              onClick={() => handleSelect(res)}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-bold text-sm text-gray-900 dark:text-gray-100">{res.title}</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">{res.type}</span>
              </div>
              <p className="text-xs text-gray-500 line-clamp-2">{res.detail}</p>
              {res.importance && (
                <div className="mt-1">
                  <span className={`text-[9px] uppercase tracking-wide ${
                    res.importance === 'critical' ? 'text-red-600' :
                    res.importance === 'high' ? 'text-orange-600' :
                    res.importance === 'medium' ? 'text-blue-600' : 'text-gray-500'
                  }`}>
                    • {res.importance}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {isOpen && query.length >= 2 && !loading && results.length === 0 && (
        <div className="absolute top-full mt-2 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-50 p-4 text-center text-sm text-gray-500">
          No se encontraron resultados para "{query}"
        </div>
      )}
    </div>
  );
}
