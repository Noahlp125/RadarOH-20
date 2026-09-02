import { useState } from "react";
import { fetchRadarExecutiveDashboard, downloadRadarExecutiveReport } from "../data/radarApi";
import { FileText, Download, Play, CheckCircle, RefreshCw } from "lucide-react";
import type { RadarCompetitor, RadarSource, RadarExecutiveDashboardReport } from "@workspace/api-client-react";

export default function InformesTab({ competitors, sources }: { competitors: RadarCompetitor[], sources: RadarSource[] }) {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<RadarExecutiveDashboardReport | null>(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    competitor_id: "",
    source_id: "",
    priority: "",
    event_type: "",
    from: "",
    to: ""
  });

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const activeFilters: Record<string, string> = {};
      Object.entries(filters).forEach(([k, v]) => {
        if (v) {
          if (k === "from" || k === "to") {
            const date = new Date(v);
            date.setHours(k === "to" ? 23 : 0, k === "to" ? 59 : 0, k === "to" ? 59 : 0, k === "to" ? 999 : 0);
            if (!isNaN(date.getTime())) activeFilters[k] = date.toISOString();
          } else {
            activeFilters[k] = v;
          }
        }
      });
      const result = await fetchRadarExecutiveDashboard(activeFilters as any);
      setReportData(result.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error generando reporte");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const activeFilters: Record<string, string> = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v) {
        if (k === "from" || k === "to") {
          const date = new Date(v);
            date.setHours(k === "to" ? 23 : 0, k === "to" ? 59 : 0, k === "to" ? 59 : 0, k === "to" ? 999 : 0);
          if (!isNaN(date.getTime())) activeFilters[k] = date.toISOString();
        } else {
          activeFilters[k] = v;
        }
      }
    });
    void downloadRadarExecutiveReport(activeFilters as any);
  };

  return (
    <div className="rdo-tab-container">
      <div className="rdo-section-head" style={{ marginBottom: "20px" }}>
        <div>
          <h2 className="rdo-page-title">Informes Ejecutivos</h2>
          <p className="rdo-page-desc">Generación de reportes de inteligencia filtrados.</p>
        </div>
      </div>

      <div className="rdo-panel rdo-panel-pad" style={{ marginBottom: "20px" }}>
        <h3 className="rdo-section-title" style={{ marginBottom: "16px" }}>Parámetros del Informe</h3>
        <div className="rdo-form-grid three">
          <label className="rdo-field">
            <span className="rdo-field-label">Desde (Fecha)</span>
            <input
              type="date"
              className="rdo-control"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </label>
          <label className="rdo-field">
            <span className="rdo-field-label">Hasta (Fecha)</span>
            <input
              type="date"
              className="rdo-control"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </label>
          <label className="rdo-field">
            <span className="rdo-field-label">Tipo de evento</span>
            <input
              type="text"
              placeholder="Ej: precios, lanzamientos..."
              className="rdo-control"
              value={filters.event_type}
              onChange={(e) => setFilters({ ...filters, event_type: e.target.value })}
            />
          </label>
          <label className="rdo-field">
            <span className="rdo-field-label">Competidor</span>
            <select
              className="rdo-control"
              value={filters.competitor_id}
              onChange={(e) => setFilters({ ...filters, competitor_id: e.target.value })}
            >
              <option value="">Todos</option>
              {competitors.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </label>
          <label className="rdo-field">
            <span className="rdo-field-label">Fuente</span>
            <select
              className="rdo-control"
              value={filters.source_id}
              onChange={(e) => setFilters({ ...filters, source_id: e.target.value })}
            >
              <option value="">Todas</option>
              {sources.map(s => (
                <option key={s.id} value={s.id}>{s.termino || s.id}</option>
              ))}
            </select>
          </label>
          <label className="rdo-field">
            <span className="rdo-field-label">Prioridad mínima</span>
            <select
              className="rdo-control"
              value={filters.priority}
              onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            >
              <option value="">Cualquiera</option>
              <option value="high">Alta</option>
              <option value="critical">Crítica</option>
            </select>
          </label>
        </div>
        <div className="rdo-form-actions" style={{ marginTop: "20px" }}>
          <button className="rdo-button secondary" onClick={handleDownload}>
            <Download size={14} /> Descargar CSV Directo
          </button>
          <button className="rdo-button primary" onClick={() => void handleGenerate()} disabled={loading}>
            {loading ? <RefreshCw size={14} className="rdo-spin" /> : <Play size={14} />} Generar Resumen
          </button>
        </div>
      </div>

      {error && <div className="rdo-monitor-error">{error}</div>}

      {reportData && (
        <div className="rdo-panel rdo-panel-pad bg-gray-50 border-gray-200">
          <div className="flex items-center gap-3 mb-6">
            <FileText size={24} className="text-blue-600" />
            <h3 className="text-xl font-bold font-serif text-gray-900">{reportData.title}</h3>
          </div>
          
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider font-mono">Highlights Ejecutivos</h4>
            <ul className="space-y-3">
              {reportData.highlights.map((h, i) => (
                <li key={i} className="flex gap-3 text-gray-700 text-sm leading-relaxed bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                  <CheckCircle size={16} className="text-green-600 shrink-0 mt-0.5" />
                  <span>{h}</span>
                </li>
              ))}
              {reportData.highlights.length === 0 && (
                <li className="text-gray-500 italic">No hay highlights para los filtros seleccionados.</li>
              )}
            </ul>
          </div>
          
          <div className="mt-8 flex justify-end">
             <button className="rdo-button primary" onClick={handleDownload}>
              <Download size={14} /> Exportar Datos Completos (CSV)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
