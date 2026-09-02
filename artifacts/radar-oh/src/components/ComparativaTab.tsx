import { useState, useEffect } from "react";
import { fetchRadarExecutiveDashboard } from "../data/radarApi";
import { RefreshCw, Building2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import type { RadarCompetitor, RadarExecutiveDashboardCompetitorCompareItem } from "@workspace/api-client-react";

const CHART_COLORS = {
  blue: "#0079F2",
  purple: "#795EFF",
  green: "#009118",
  red: "#A60808",
  pink: "#ec4899",
};

export default function ComparativaTab({ competitors }: { competitors: RadarCompetitor[] }) {
  const [data, setData] = useState<RadarExecutiveDashboardCompetitorCompareItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchRadarExecutiveDashboard({});
      setData(result.competitor_compare);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando comparativa");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="rdo-tab-container">
      <div className="rdo-section-head" style={{ marginBottom: "20px" }}>
        <div>
          <h2 className="rdo-page-title">Comparativa Competitiva</h2>
          <p className="rdo-page-desc">Métricas relativas de los actores del mercado.</p>
        </div>
        <div className="rdo-actions">
          <button className="rdo-button secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "rdo-spin" : ""} /> Actualizar
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="rdo-monitor-loading">Cargando comparativa...</div>
      )}

      {error && <div className="rdo-monitor-error">{error}</div>}

      {data && (
        <>
          <div className="rdo-panel rdo-panel-pad" style={{ marginBottom: "20px" }}>
            <h3 className="rdo-section-title" style={{ marginBottom: "20px" }}>Actividad y Relevancia por Competidor</h3>
            <ResponsiveContainer width="100%" height={350} debounce={0}>
              <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="name" fontSize={12} tickMargin={10} />
                <YAxis fontSize={12} />
                <Tooltip isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                <Legend />
                <Bar dataKey="activity" name="Actividad" fill={CHART_COLORS.blue} isAnimationActive={false} />
                <Bar dataKey="relevance" name="Relevancia" fill={CHART_COLORS.purple} isAnimationActive={false} />
                <Bar dataKey="importance" name="Importancia" fill={CHART_COLORS.green} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rdo-panel">
            <div className="rdo-table-wrap">
              <table className="rdo-table">
                <thead>
                  <tr>
                    <th>Competidor</th>
                    <th>Prioridad</th>
                    <th>Actividad</th>
                    <th>Cambios</th>
                    <th>Importancia</th>
                    <th>Relevancia</th>
                    <th>Último Evento</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((c) => (
                    <tr key={c.competitor_id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <Building2 size={14} className="text-gray-400" />
                          <strong className="text-gray-900">{c.name}</strong>
                        </div>
                      </td>
                      <td>
                        <span className={`rdo-badge ${c.priority === 'alta' ? 'red' : c.priority === 'media' ? 'amber' : 'teal'}`}>
                          {c.priority.toUpperCase()}
                        </span>
                      </td>
                      <td>{c.activity}</td>
                      <td>{c.changes}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-blue-600 h-1.5" style={{ width: `${c.importance}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{c.importance}%</span>
                        </div>
                      </td>
                      <td>{c.relevance}%</td>
                      <td className="text-gray-500 font-mono text-xs">
                        {c.last_event_at ? new Date(c.last_event_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-gray-500 py-8">
                        No hay datos de comparativa disponibles.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
