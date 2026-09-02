import { useState, useEffect } from "react";
import { fetchRadarIntelligence } from "../data/radarApi";
import { RefreshCw, ShieldCheck, ChevronRight, Activity, TrendingUp, Cpu, Eye, Info, Sparkles, TrendingDown, Minus, Lightbulb, Target, Settings, Brain, AlertTriangle } from "lucide-react";
import type { RadarIntelligence, RadarCompetitorScorecard, RadarIntelligenceTrend, RadarRecommendation, RadarOpportunity, RadarQualityMetrics, RadarCompetitorScorecardBreakdown } from "@workspace/api-client-react";

export default function InteligenciaAvanzadaTab() {
  const [period, setPeriod] = useState<number>(30);
  const [data, setData] = useState<RadarIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchRadarIntelligence({ days: period });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la inteligencia avanzada.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [period]);

  const topCompetitor = data?.scorecards.reduce((acc, curr) => (curr.score > (acc?.score || 0) ? curr : acc), data.scorecards[0]);
  const strongestTrend = data?.trends.reduce((acc, curr) => (curr.confidence > (acc?.confidence || 0) ? curr : acc), data.trends[0]);

  return (
    <div className="rdo-tab-container space-y-6">
      <div className="rdo-section-head">
        <div>
          <h2 className="rdo-page-title">Inteligencia Avanzada</h2>
          <p className="rdo-page-desc flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-500" />
            Las puntuaciones y señales son deterministas y basadas en evidencia, no pronósticos.
          </p>
        </div>
        <div className="rdo-actions">
          <select 
            className="rdo-control w-auto" 
            value={period} 
            onChange={(e) => setPeriod(Number(e.target.value))}
            disabled={loading}
          >
            <option value={30}>30 días</option>
            <option value={60}>60 días</option>
            <option value={90}>90 días</option>
            <option value={180}>180 días</option>
          </select>
          <button className="rdo-button secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "rdo-spin" : ""} /> Actualizar
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="rdo-monitor-loading"><div className="rdo-loading-mark" /> Calculando inteligencia sobre el periodo...</div>
      )}

      {error && (
        <div className="rdo-monitor-error"><AlertTriangle size={16} /> {error}</div>
      )}

      {data && (
        <>
          {/* Executive Brief */}
          <div className="rdo-panel rdo-panel-pad" style={{ background: "var(--navy)", color: "var(--paper)" }}>
            <div className="flex items-center gap-2 mb-3">
               <Sparkles size={16} style={{ color: "var(--signal)" }} />
               <h3 className="font-[Syne] font-bold text-base" style={{ color: "var(--paper)" }}>{data.report.title}</h3>
            </div>
            <p className="text-sm opacity-90 leading-relaxed max-w-4xl">{data.report.summary}</p>
            <div className="mt-4 text-[9px] font-[Space_Mono] uppercase tracking-wider opacity-50 flex items-center gap-4">
              <span>Generado: {new Date(data.report.generated_at).toLocaleString()}</span>
              <span>Metodología: {data.methodology.label}</span>
            </div>
          </div>

          {/* KPIs */}
          <div className="rdo-stat-grid">
            <div className="rdo-stat relative overflow-hidden">
              <div className="rdo-stat-label">Competidor Líder</div>
              <div className="rdo-stat-value text-blue-600 dark:text-blue-400 truncate" title={topCompetitor?.name}>{topCompetitor?.name || "N/A"}</div>
              <div className="rdo-stat-meta">{topCompetitor?.score.toFixed(1) || 0} pts — Banda {topCompetitor?.band || "N/A"}</div>
            </div>
            <div className="rdo-stat">
              <div className="rdo-stat-label">Tendencia Principal</div>
              <div className="rdo-stat-value truncate" title={strongestTrend?.label}>{strongestTrend?.label || "N/A"}</div>
              <div className="rdo-stat-meta">{strongestTrend?.confidence}% confianza</div>
            </div>
            <div className="rdo-stat">
              <div className="rdo-stat-label">Monitorización Exitosa</div>
              <div className="rdo-stat-value text-emerald-600 dark:text-emerald-400">{data.quality.monitoring.success_rate.toFixed(1)}%</div>
              <div className="rdo-stat-meta">{data.quality.monitoring.runs} ciclos</div>
            </div>
            <div className="rdo-stat">
              <div className="rdo-stat-label">Hallazgos Verificados</div>
              <div className="rdo-stat-value">{data.quality.ai.grounded_findings}</div>
              <div className="rdo-stat-meta">de {data.quality.ai.findings} totales</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Scorecards */}
            <div className="rdo-panel rdo-panel-pad">
              <h3 className="rdo-section-title mb-4 flex items-center gap-2"><Target size={16} /> Scorecard Competitivo</h3>
              <div className="space-y-4">
                {data.scorecards.map((sc) => (
                  <div key={sc.competitor_id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{sc.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-1">
                          Banda {sc.band} · {sc.signal_count} señales
                        </div>
                      </div>
                      <div className="text-xl font-bold font-[Syne] tracking-tight text-blue-600 dark:text-blue-400">
                        {sc.score.toFixed(1)}
                      </div>
                    </div>
                    
                    <div className="space-y-2 mt-2">
                      <ScoreBar label="Actividad" value={sc.breakdown.activity} color="bg-blue-500" />
                      <ScoreBar label="Momentum" value={sc.breakdown.momentum} color="bg-indigo-500" />
                      <ScoreBar label="Importancia" value={sc.breakdown.importance} color="bg-emerald-500" />
                      <ScoreBar label="Relevancia" value={sc.breakdown.relevance} color="bg-amber-500" />
                       <ScoreBar label="Recencia" value={sc.breakdown.recency} color="bg-cyan-500" />
                    </div>
                  </div>
                ))}
                {data.scorecards.length === 0 && <div className="rdo-empty">No hay competidores analizados</div>}
              </div>
            </div>

            {/* Trends */}
            <div className="rdo-panel rdo-panel-pad">
              <h3 className="rdo-section-title mb-4 flex items-center gap-2"><Activity size={16} /> Tendencias de Mercado</h3>
              <div className="space-y-3">
                {data.trends.map((trend) => (
                  <div key={trend.key} className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-semibold text-sm">{trend.label}</div>
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-mono">
                        {trend.direction === 'growing' || trend.direction === 'accelerating' ? <TrendingUp size={12} className="text-emerald-500" /> : 
                         trend.direction === 'declining' ? <TrendingDown size={12} className="text-red-500" /> : <Minus size={12} className="text-slate-500" />}
                        {trend.delta_percent > 0 ? '+' : ''}{trend.delta_percent}%
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 mb-2">{trend.basis}</div>
                    <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono">
                      <span>Muestras: {trend.previous_count} → {trend.current_count}</span>
                      <span className="flex items-center gap-1"><ShieldCheck size={10} /> Confianza: {trend.confidence}%</span>
                    </div>
                  </div>
                ))}
                {data.trends.length === 0 && <div className="rdo-empty">No se detectaron tendencias</div>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Recommendations */}
            <div className="lg:col-span-2 rdo-panel rdo-panel-pad">
              <h3 className="rdo-section-title mb-4 flex items-center gap-2"><Lightbulb size={16} /> Recomendaciones Estratégicas</h3>
              <div className="space-y-4">
                {data.recommendations.map((rec) => (
                  <div key={rec.id} className="relative p-4 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                    <div className={`absolute top-0 left-0 w-1 h-full ${
                      rec.priority === 'critical' ? 'bg-red-500' : 
                      rec.priority === 'high' ? 'bg-amber-500' : 
                      rec.priority === 'medium' ? 'bg-blue-500' : 'bg-slate-300'
                    }`} />
                    <div className="pl-3">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-sm">{rec.title}</h4>
                        <span className="rdo-badge text-[9px]">{rec.priority}</span>
                      </div>
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">Acción: {rec.action}</div>
                      <div className="text-xs text-slate-500 mb-3">{rec.reason}</div>
                      <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1"><ShieldCheck size={12} /> {rec.confidence}% confianza</span>
                        <span className="flex items-center gap-1"><Info size={12} /> {rec.evidence_event_ids.length} evidencias</span>
                      </div>
                    </div>
                  </div>
                ))}
                {data.recommendations.length === 0 && <div className="rdo-empty">No hay recomendaciones en este periodo</div>}
              </div>
            </div>

            {/* Opportunities & System Quality */}
            <div className="space-y-5">
              <div className="rdo-panel rdo-panel-pad">
                <h3 className="rdo-section-title mb-4 flex items-center gap-2"><Target size={16} /> Oportunidades</h3>
                <div className="space-y-3">
                  {data.opportunities.map((opp, idx) => (
                    <div key={idx} className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-lg">
                      <div className="flex justify-between items-start mb-1">
                        <div className="font-semibold text-sm text-amber-900 dark:text-amber-400">{opp.title}</div>
                        <div className="text-xs font-bold text-amber-600 font-mono">{opp.score}</div>
                      </div>
                      <div className="text-xs text-amber-800/70 dark:text-amber-500/70">{opp.description}</div>
                    </div>
                  ))}
                  {data.opportunities.length === 0 && <div className="rdo-empty">No hay oportunidades identificadas</div>}
                </div>
              </div>

              <div className="rdo-panel rdo-panel-pad">
                <h3 className="rdo-section-title mb-4 flex items-center gap-2"><Settings size={16} /> Calidad del Sistema</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold mb-2"><Eye size={14} /> Monitorización</div>
                    <div className="grid grid-cols-2 gap-2">
                      <MetricCard label="Latencia" value={`${data.quality.monitoring.average_latency_ms}ms`} />
                      <MetricCard label="Errores" value={data.quality.monitoring.sources_with_errors.toString()} error={data.quality.monitoring.sources_with_errors > 0} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold mb-2"><Brain size={14} /> Motor IA</div>
                    <div className="grid grid-cols-2 gap-2">
                      <MetricCard label="Análisis" value={data.quality.ai.analyses.toString()} />
                      <MetricCard label="Veracidad" value={`${Math.round((data.quality.ai.grounded_findings / Math.max(1, data.quality.ai.findings)) * 100)}%`} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold mb-2"><AlertTriangle size={14} /> Alertas</div>
                    <div className="grid grid-cols-2 gap-2">
                      <MetricCard label="No leídas" value={data.quality.alerts.unread.toString()} />
                       <MetricCard label="Lectura" value={`${Math.round(data.quality.alerts.read_rate)}%`} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ScoreBar({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-[10px] text-slate-500 font-mono uppercase tracking-wider">{label}</div>
      <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <div className="w-8 text-[10px] font-mono text-right text-slate-600">{Math.round(value)}</div>
    </div>
  );
}

function MetricCard({ label, value, error }: { label: string, value: string, error?: boolean }) {
  return (
    <div className={`p-2 rounded bg-slate-50 dark:bg-slate-900 border ${error ? 'border-red-200 dark:border-red-900/50' : 'border-slate-200 dark:border-slate-800'}`}>
      <div className="text-[10px] text-slate-500 font-mono mb-0.5">{label}</div>
      <div className={`text-sm font-semibold ${error ? 'text-red-600 dark:text-red-400' : ''}`}>{value}</div>
    </div>
  );
}