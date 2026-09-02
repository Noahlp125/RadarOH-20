import { useState, useEffect } from "react";
import { fetchRadarExecutiveDashboard } from "../data/radarApi";
import { RefreshCw } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";
import type { RadarCompetitor, RadarSource, RadarExecutiveDashboard, GetRadarExecutiveDashboardPriority } from "@workspace/api-client-react";

const CHART_COLORS = {
  blue: "#0079F2",
  purple: "#795EFF",
  green: "#009118",
  red: "#A60808",
  pink: "#ec4899",
};

export default function EjecutivoTab({ competitors, sources }: { competitors: RadarCompetitor[], sources: RadarSource[] }) {
  const [data, setData] = useState<RadarExecutiveDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    competitor_id: "",
    source_id: "",
    priority: "",
    event_type: "",
    q: "",
    from: "",
    to: ""
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const activeFilters: Record<string, string> = {};
      if (filters.competitor_id) activeFilters.competitor_id = filters.competitor_id;
      if (filters.source_id) activeFilters.source_id = filters.source_id;
      if (filters.priority) activeFilters.priority = filters.priority;
      if (filters.event_type) activeFilters.event_type = filters.event_type;
      if (filters.q) activeFilters.q = filters.q;
      
      if (filters.from) {
        const fromDate = new Date(filters.from);
        fromDate.setHours(0, 0, 0, 0);
        if (!isNaN(fromDate.getTime())) activeFilters.from = fromDate.toISOString();
      }
      
      if (filters.to) {
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        if (!isNaN(toDate.getTime())) activeFilters.to = toDate.toISOString();
      }

      const result = await fetchRadarExecutiveDashboard(activeFilters as any);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando dashboard");
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
          <h2 className="rdo-page-title">Dashboard Ejecutivo</h2>
          <p className="rdo-page-desc">Visión consolidada y KPIs estratégicos.</p>
        </div>
        <div className="rdo-actions">
          <button className="rdo-button secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "rdo-spin" : ""} /> Actualizar
          </button>
        </div>
      </div>

      <div className="rdo-panel rdo-panel-pad" style={{ marginBottom: "20px" }}>
        <div className="rdo-form-grid three">
          <label className="rdo-field">
            <span className="rdo-field-label">Búsqueda</span>
            <input
              type="text"
              className="rdo-control"
              placeholder="Buscar..."
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            />
          </label>
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
            <span className="rdo-field-label">Prioridad</span>
            <select
              className="rdo-control"
              value={filters.priority}
              onChange={(e) => setFilters({ ...filters, priority: e.target.value as GetRadarExecutiveDashboardPriority })}
            >
              <option value="">Todas</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </label>
        </div>
        <div className="rdo-form-actions">
          <button className="rdo-button primary" onClick={() => void load()}>Aplicar filtros</button>
        </div>
      </div>

      {loading && !data && (
        <div className="rdo-monitor-loading">Cargando indicadores...</div>
      )}

      {error && <div className="rdo-monitor-error">{error}</div>}

      {data && (
        <div className="space-y-6">
          <div className="rdo-stat-grid">
            <div className="rdo-stat">
              <div className="rdo-stat-label">Eventos Totales</div>
              <div className="rdo-stat-value" style={{ color: CHART_COLORS.blue }}>{data.kpis.total_events}</div>
            </div>
            <div className="rdo-stat">
              <div className="rdo-stat-label">Prioridad Alta</div>
              <div className="rdo-stat-value" style={{ color: CHART_COLORS.red }}>{data.kpis.high_priority_events}</div>
            </div>
            <div className="rdo-stat">
              <div className="rdo-stat-label">Alertas No Leídas</div>
              <div className="rdo-stat-value" style={{ color: CHART_COLORS.purple }}>{data.kpis.unread_alerts}</div>
            </div>
            <div className="rdo-stat">
              <div className="rdo-stat-label">Competidores Activos</div>
              <div className="rdo-stat-value">{data.kpis.active_competitors}</div>
            </div>
            <div className="rdo-stat">
              <div className="rdo-stat-label">Salud de Fuentes</div>
              <div className="rdo-stat-value" style={{ color: data.kpis.source_health_percent < 80 ? CHART_COLORS.red : CHART_COLORS.green }}>{data.kpis.source_health_percent}%</div>
            </div>
            <div className="rdo-stat">
              <div className="rdo-stat-label">Relevancia Media</div>
              <div className="rdo-stat-value">{data.kpis.average_relevance}%</div>
            </div>
          </div>

          <div className="rdo-summary-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div className="rdo-panel rdo-panel-pad">
              <h3 className="rdo-section-title" style={{ marginBottom: "16px" }}>Evolución de Eventos</h3>
              <ResponsiveContainer width="100%" height={250} debounce={0}>
                <AreaChart data={data.timeline}>
                  <defs>
                    <linearGradient id="colorEv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.4}/>
                      <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="date" fontSize={11} tickFormatter={(tick) => new Date(tick).toLocaleDateString()} />
                  <YAxis fontSize={11} />
                  <Tooltip isAnimationActive={false} />
                  <Area type="monotone" dataKey="events" name="Eventos" stroke={CHART_COLORS.blue} fillOpacity={1} fill="url(#colorEv)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="rdo-panel rdo-panel-pad">
              <h3 className="rdo-section-title" style={{ marginBottom: "16px" }}>Distribución por Tipo</h3>
              <ResponsiveContainer width="100%" height={250} debounce={0}>
                <BarChart data={data.by_type}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="type" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip isAnimationActive={false} />
                  <Bar dataKey="count" name="Cantidad" fill={CHART_COLORS.purple} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rdo-summary-grid" style={{ gridTemplateColumns: "1fr 1.5fr", gap: "20px" }}>
            <div className="rdo-panel rdo-panel-pad">
              <h3 className="rdo-section-title" style={{ marginBottom: "16px" }}>Radar Competitivo</h3>
              {data.radar_points.some((point) => point.activity > 0 || point.relevance > 0 || point.importance > 0) ? (
                <ResponsiveContainer width="100%" height={300} debounce={0}>
                  <RadarChart data={data.radar_points} outerRadius={110}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="name" fontSize={11} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} />
                    <Radar name="Actividad" dataKey="activity" stroke={CHART_COLORS.blue} fill={CHART_COLORS.blue} fillOpacity={0.4} isAnimationActive={false} />
                    <Radar name="Relevancia" dataKey="relevance" stroke={CHART_COLORS.purple} fill={CHART_COLORS.purple} fillOpacity={0.4} isAnimationActive={false} />
                    <Radar name="Importancia" dataKey="importance" stroke={CHART_COLORS.green} fill={CHART_COLORS.green} fillOpacity={0.4} isAnimationActive={false} />
                    <Tooltip isAnimationActive={false} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="rdo-empty">El radar se activará cuando existan señales competitivas en el periodo.</div>
              )}
            </div>

            <div className="rdo-panel rdo-panel-pad">
              <h3 className="rdo-section-title" style={{ marginBottom: "16px" }}>Hallazgos Recientes</h3>
              {data.findings.length > 0 ? (
                <div className="space-y-4">
                  {data.findings.slice(0,3).map(f => (
                    <div key={f.id} className="rdo-ai-finding" style={{ marginBottom: "12px", padding: "12px" }}>
                      <div className="rdo-ai-finding-head">
                        <h4 className="rdo-ai-finding-title">{f.title}</h4>
                        <span className={`rdo-badge ${f.importance === 'high' || f.importance === 'critical' ? 'red' : f.importance === 'medium' ? 'amber' : 'teal'}`}>
                          {f.importance}
                        </span>
                      </div>
                      <p className="rdo-row-note" style={{ marginTop: "6px" }}>{f.summary}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rdo-empty">No hay hallazgos recientes</div>
              )}
            </div>
          </div>

          <div className="rdo-summary-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div className="rdo-panel rdo-panel-pad">
              <h3 className="rdo-section-title" style={{ marginBottom: "16px" }}>Tendencias Detectadas</h3>
              {data.trends.length > 0 ? (
                <div className="space-y-4">
                  {data.trends.slice(0,4).map((t, i) => (
                    <div key={i} className="rdo-ai-finding" style={{ marginBottom: "12px", padding: "12px" }}>
                      <div className="rdo-ai-finding-head">
                        <h4 className="rdo-ai-finding-title">{t.name}</h4>
                        <span className={`rdo-badge ${t.direction === 'growing' ? 'green' : t.direction === 'declining' ? 'red' : 'amber'}`}>
                          {t.direction === 'growing' ? 'Al alza' : t.direction === 'declining' ? 'A la baja' : t.direction === 'emerging' ? 'Emergente' : 'Estable'} · {Math.abs(t.delta)}
                        </span>
                      </div>
                      <p className="rdo-row-note" style={{ marginTop: "6px" }}>{t.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rdo-empty">No hay tendencias detectadas</div>
              )}
            </div>

            <div className="rdo-panel rdo-panel-pad">
              <h3 className="rdo-section-title" style={{ marginBottom: "16px" }}>Distribución por Importancia</h3>
              <ResponsiveContainer width="100%" height={300} debounce={0}>
                <BarChart data={data.by_importance} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="label" fontSize={11} width={80} />
                  <Tooltip isAnimationActive={false} />
                  <Bar dataKey="count" name="Eventos" fill={CHART_COLORS.green} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="rdo-panel rdo-panel-pad">
            <h3 className="rdo-section-title" style={{ marginBottom: "16px" }}>Registro de Actividad</h3>
            {data.activity.length > 0 ? (
              <div className="rdo-table-wrap">
                <table className="rdo-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Acción</th>
                      <th>Entidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activity.slice(0, 8).map(act => (
                      <tr key={act.id}>
                        <td className="text-xs text-gray-500">{new Date(act.created_at).toLocaleString()}</td>
                        <td>{act.action}</td>
                        <td><span className="rdo-badge">{act.entity_type}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rdo-empty">No hay actividad reciente</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
