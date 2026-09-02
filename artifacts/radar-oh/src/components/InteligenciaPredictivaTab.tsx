import { useState, useEffect } from "react";
import { fetchRadarPredictive, submitRadarAssistantRequest } from "../data/radarApi";
import { 
  RefreshCw, 
  Target, 
  Activity, 
  AlertTriangle, 
  Zap, 
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  HelpCircle,
  MessageSquare,
  Search,
  CheckCircle2,
  ChevronRight,
  Info
} from "lucide-react";
import type { 
  RadarPredictive, 
  RadarPredictiveSignal, 
  RadarPredictiveScenariosItem, 
  RadarAssistantResponse
} from "@workspace/api-client-react";

export default function InteligenciaPredictivaTab() {
  const [period, setPeriod] = useState<number>(30);
  const [data, setData] = useState<RadarPredictive | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Assistant state
  const [question, setQuestion] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [assistantResponse, setAssistantResponse] = useState<RadarAssistantResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchRadarPredictive({ days: period });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar la inteligencia predictiva.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [period]);

  const askAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setAssistantLoading(true);
    setAssistantError("");
    setAssistantResponse(null);
    try {
      const res = await submitRadarAssistantRequest({ question: question.trim() });
      setAssistantResponse(res);
      setQuestion("");
    } catch (err) {
      setAssistantError(err instanceof Error ? err.message : "Error de comunicación con el asistente.");
    } finally {
      setAssistantLoading(false);
    }
  };

  return (
    <div className="rdo-tab-container space-y-6 pb-12">
      <div className="rdo-section-head">
        <div>
          <h2 className="rdo-page-title">Inteligencia Predictiva</h2>
          <p className="rdo-page-desc flex items-center gap-2">
            <Target size={14} className="text-blue-500" />
            Modelos prospectivos y simulaciones basados en evidencia retrospectiva. Estas proyecciones no representan probabilidades calibradas.
          </p>
        </div>
        <div className="rdo-actions">
          <select 
            className="rdo-control w-auto" 
            value={period} 
            onChange={(e) => setPeriod(Number(e.target.value))}
            disabled={loading}
          >
            <option value={30}>Horizonte 30 días</option>
            <option value={60}>Horizonte 60 días</option>
            <option value={90}>Horizonte 90 días</option>
            <option value={180}>Horizonte 180 días</option>
          </select>
          <button className="rdo-button secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "rdo-spin" : ""} /> Actualizar modelo
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="rdo-monitor-loading"><div className="rdo-loading-mark" /> Sintetizando proyecciones y simulando escenarios...</div>
      )}

      {error && (
        <div className="rdo-monitor-error"><AlertTriangle size={16} /> {error}</div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Resumen Ejecutivo */}
          <div className="rdo-panel rdo-panel-pad bg-slate-900 border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={16} className="text-amber-500" />
              <h3 className="font-[Syne] font-bold text-base text-slate-100">Resumen Prospectivo</h3>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed max-w-4xl">{data.executive_summary}</p>
            <div className="mt-4 pt-4 border-t border-slate-800/50 flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
              <span>Metodología: {data.methodology.label}</span>
              <span>Cobertura de evidencia: {data.quality.evidence_coverage_percent}%</span>
              <span>Consistencia: {data.quality.trend_consistency_percent}%</span>
              <span>Calibración: {data.quality.calibration_status.replace('_', ' ')}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Tendencias de Mercado */}
            <div className="rdo-panel rdo-panel-pad">
              <h3 className="rdo-section-title mb-4 flex items-center gap-2"><Activity size={16} /> Tendencias de Mercado (Proyectadas)</h3>
              <div className="space-y-3">
                {data.market_trends.length === 0 && <div className="rdo-empty">Insuficiente evidencia para proyectar tendencias</div>}
                {data.market_trends.map((trend, idx) => (
                  <SignalCard key={idx} signal={trend} />
                ))}
              </div>
            </div>

            {/* Pronósticos Competitivos */}
            <div className="rdo-panel rdo-panel-pad">
              <h3 className="rdo-section-title mb-4 flex items-center gap-2"><Target size={16} /> Anticipación Competitiva</h3>
              <div className="space-y-3">
                {data.competitor_forecasts.length === 0 && <div className="rdo-empty">No hay pronósticos concluyentes</div>}
                {data.competitor_forecasts.map((forecast, idx) => (
                  <SignalCard key={idx} signal={forecast} />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Oportunidades Prospectivas */}
            <div className="rdo-panel rdo-panel-pad">
              <h3 className="rdo-section-title mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-emerald-500" /> Oportunidades Emergentes</h3>
              <div className="space-y-3">
                {data.opportunities.length === 0 && <div className="rdo-empty">Sin oportunidades proyectadas de alta confianza</div>}
                {data.opportunities.map((opp, idx) => (
                  <SignalCard key={idx} signal={opp} borderClass="border-emerald-100 dark:border-emerald-900/30" bgClass="bg-emerald-50/50 dark:bg-emerald-900/10" />
                ))}
              </div>
            </div>

            {/* Amenazas Prospectivas */}
            <div className="rdo-panel rdo-panel-pad">
              <h3 className="rdo-section-title mb-4 flex items-center gap-2"><TrendingDown size={16} className="text-red-500" /> Amenazas en Formación</h3>
              <div className="space-y-3">
                {data.threats.length === 0 && <div className="rdo-empty">Sin amenazas inminentes detectadas</div>}
                {data.threats.map((threat, idx) => (
                  <SignalCard key={idx} signal={threat} borderClass="border-red-100 dark:border-red-900/30" bgClass="bg-red-50/50 dark:bg-red-900/10" />
                ))}
              </div>
            </div>
          </div>

          {/* Alertas Preventivas */}
          <div className="rdo-panel rdo-panel-pad border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-900/5">
            <h3 className="rdo-section-title mb-4 flex items-center gap-2 text-amber-900 dark:text-amber-500"><ShieldAlert size={16} /> Alertas Preventivas</h3>
            <div className="space-y-3">
              {data.predictive_alerts.length === 0 && <div className="text-sm text-slate-500 px-2 py-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-md">El modelo no detecta vulnerabilidades críticas preventivas en este momento.</div>}
              {data.predictive_alerts.map((alert, idx) => (
                <div key={idx} className="flex gap-4 p-4 border border-amber-200 dark:border-amber-900/50 rounded-lg bg-white dark:bg-slate-900">
                  <div className="flex-shrink-0 mt-0.5"><AlertTriangle size={16} className="text-amber-500" /></div>
                  <div className="flex-1">
                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-1">{alert.title}</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">{alert.description}</div>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
                      <span className="flex items-center gap-1"><CheckCircle2 size={10} /> Confianza: {alert.confidence}%</span>
                      <span>Evidencias: {alert.evidence_event_ids.length}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Escenarios */}
          <div>
            <h3 className="rdo-section-title mb-4 mt-6">Simulación de Escenarios (A corto plazo)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.scenarios.map((scenario) => (
                <div key={scenario.label} className="rdo-panel rdo-panel-pad flex flex-col h-full">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500 mb-2">{scenario.label === 'base' ? 'Escenario Base' : scenario.label === 'accelerated' ? 'Escenario Acelerado' : 'Escenario de Contracción (Quiet)'}</div>
                  <div className="text-sm text-slate-700 dark:text-slate-300 flex-1 leading-relaxed">{scenario.description}</div>
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 font-mono">
                    Apoyado en {scenario.input_event_ids.length} puntos de datos
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Asistente Predictivo */}
          <div className="rdo-panel rdo-panel-pad mt-8">
            <h3 className="rdo-section-title mb-4 flex items-center gap-2"><HelpCircle size={16} /> Interrogación al Modelo Prospectivo</h3>
            <div className="text-sm text-slate-500 mb-4">
              Consulte al asistente predictivo sobre posibles movimientos de la competencia o evolución de tendencias. Las respuestas se generan sintetizando el historial recopilado, sin acceso a información externa que no se haya ingerido previamente.
            </div>

            <form onSubmit={askAssistant} className="flex gap-2">
              <input
                type="text"
                className="rdo-control flex-1"
                placeholder="Ej. ¿Qué probabilidad hay de que el competidor X lance una nueva campaña este trimestre?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={assistantLoading}
              />
              <button 
                type="submit" 
                className="rdo-button primary" 
                disabled={assistantLoading || !question.trim()}
              >
                <Search size={14} className={assistantLoading ? "hidden" : ""} />
                {assistantLoading ? <RefreshCw size={14} className="rdo-spin" /> : "Consultar"}
              </button>
            </form>

            {assistantError && (
              <div className="mt-4 text-xs text-red-600 bg-red-50 p-3 rounded-md border border-red-100">
                {assistantError}
              </div>
            )}

            {assistantResponse && (
              <div className="mt-4 p-4 border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg">
                <div className="flex gap-3">
                  <MessageSquare size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2 leading-relaxed">
                      {assistantResponse.answer}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono text-slate-500 mt-3 pt-3 border-t border-blue-100 dark:border-blue-900/30">
                      <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-blue-400" /> Nivel de Confianza: {assistantResponse.confidence}%</span>
                      <span>{assistantResponse.evidence_event_ids.length} evidencias citadas</span>
                    </div>
                    {assistantResponse.caveat && (
                      <div className="mt-2 flex gap-1.5 items-start text-xs text-slate-500 italic bg-slate-100/50 dark:bg-slate-800/50 p-2 rounded">
                        <Info size={12} className="flex-shrink-0 mt-0.5" />
                        <span>{assistantResponse.caveat}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          
        </div>
      )}
    </div>
  );
}

function SignalCard({ signal, borderClass = "border-slate-200 dark:border-slate-800", bgClass = "bg-white dark:bg-slate-900/50" }: { signal: RadarPredictiveSignal, borderClass?: string, bgClass?: string }) {
  return (
    <div className={`p-4 border ${borderClass} rounded-lg ${bgClass}`}>
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{signal.title}</h4>
        <div className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
          Confianza: {signal.confidence}%
        </div>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-3">{signal.description}</p>
      <div className="flex items-center gap-4 text-[10px] font-mono text-slate-400">
        {signal.competitor_id && <span className="flex items-center gap-1 border-r border-slate-300 dark:border-slate-700 pr-4">Ref Competidor: {signal.competitor_id.substring(0, 8)}...</span>}
        <span>Sustentado en {signal.evidence_event_ids.length} eventos históricos</span>
      </div>
    </div>
  );
}
