import { useState, useEffect } from "react";
import { fetchRadarIntegrationsOverview } from "../data/radarApi";
import { Zap, ShieldAlert, ShieldCheck, Link as LinkIcon, RefreshCw, AlertTriangle, Book, CheckCircle2, XCircle, PauseCircle, Clock, Server, Briefcase, Activity, Radio, Lock } from "lucide-react";
import type { RadarIntegrationsOverview, RadarIntegration, RadarWebhookSubscription, RadarIntegrationsOverviewDepartmentsItem } from "@workspace/api-client-react";

export default function CentroIntegracionesTab() {
  const [data, setData] = useState<RadarIntegrationsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const overview = await fetchRadarIntegrationsOverview();
      setData(overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la vista general de integraciones.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="rdo-tab-container space-y-6">
      <div className="rdo-section-head">
        <div>
          <h2 className="rdo-page-title">Centro de Integraciones</h2>
          <p className="rdo-page-desc flex items-center gap-2">
            <Zap size={14} className="text-amber-500" />
            Conecta RadarOH con el resto de la empresa y distribuye inteligencia de forma automática.
          </p>
        </div>
        <div className="rdo-actions">
          <button className="rdo-button secondary" onClick={() => void load()} disabled={loading} data-testid="button-refresh-integrations">
            <RefreshCw size={14} className={loading ? "rdo-spin" : ""} /> Actualizar
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="rdo-monitor-loading">
          <div className="rdo-loading-mark" /> Cargando estado de integraciones...
        </div>
      )}

      {error && (
        <div className="rdo-monitor-error">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {data && (
        <>
          {/* Safety State Card */}
          <div className={`rdo-panel rdo-panel-pad relative overflow-hidden ${!data.safety.external_connections_enabled ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50' : ''}`}>
            {!data.safety.external_connections_enabled && (
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
            )}
            <div className="flex items-start gap-4">
              <div className={`mt-1 flex-shrink-0 ${data.safety.external_connections_enabled ? 'text-emerald-500' : 'text-amber-500'}`}>
                {data.safety.external_connections_enabled ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
              </div>
              <div className="flex-1">
                <h3 className="font-bold font-[Syne] text-lg mb-1 flex items-center gap-2 text-slate-900 dark:text-slate-100">
                  {data.safety.external_connections_enabled ? 'Conexiones Externas Activas' : 'Modo Seguro Activo'}
                  {!data.safety.external_connections_enabled && <span className="rdo-badge amber text-[10px]">Aislado</span>}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl mb-4">
                  {data.safety.external_connections_enabled 
                    ? "RadarOH está autorizado para comunicarse con sistemas externos y entregar webhooks en tiempo real." 
                    : "Ninguna conexión externa está habilitada actualmente. Todos los webhooks, sincronizaciones de API y entregas a departamentos están pausados en la red interna para evitar fugas de datos de inteligencia no intencionadas. La monitorización base sigue funcionando localmente."}
                </p>
                <div className="flex flex-wrap gap-4 text-xs font-mono text-slate-500">
                  <div className="flex items-center gap-1.5">
                    {data.safety.authorization_required ? <Lock size={12} className="text-amber-500" /> : <ShieldCheck size={12} className="text-emerald-500" />}
                    Autorización OAuth/Token requerida
                  </div>
                  <div className="flex items-center gap-1.5">
                    {data.safety.documentation_required ? <Book size={12} className="text-blue-500" /> : <ShieldCheck size={12} className="text-emerald-500" />}
                    Docs técnicas requeridas
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Integrations Catalog */}
              <div className="rdo-panel rdo-panel-pad">
                <h3 className="rdo-section-title mb-4 flex items-center gap-2"><LinkIcon size={16} /> Catálogo de Integraciones</h3>
                
                {data.integrations.length === 0 ? (
                  <div className="rdo-empty">No hay integraciones configuradas</div>
                ) : (
                  <div className="space-y-4">
                    {data.integrations.map((integration) => (
                      <IntegrationCard key={integration.id} integration={integration} />
                    ))}
                  </div>
                )}
              </div>

              {/* Webhooks & Observability */}
              <div className="rdo-panel rdo-panel-pad">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="rdo-section-title flex items-center gap-2"><Radio size={16} /> Suscripciones de Webhooks</h3>
                  <div className="flex items-center gap-3 text-[10px] font-mono">
                    <span className="flex items-center gap-1 text-slate-500"><Clock size={12} /> {data.deliveries.pending} pend.</span>
                    <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={12} /> {data.deliveries.succeeded} ok</span>
                    <span className="flex items-center gap-1 text-red-600"><XCircle size={12} /> {data.deliveries.failed} error</span>
                  </div>
                </div>

                {data.webhooks.length === 0 ? (
                  <div className="rdo-empty">No hay suscripciones de webhooks activas</div>
                ) : (
                  <div className="space-y-3">
                    {data.webhooks.map((webhook) => (
                      <WebhookCard key={webhook.id} webhook={webhook} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              {/* Department Focus */}
              <div className="rdo-panel rdo-panel-pad">
                <h3 className="rdo-section-title mb-4 flex items-center gap-2"><Briefcase size={16} /> Reparto por Departamentos</h3>
                <div className="space-y-3">
                  {data.departments.map((dept) => (
                    <DepartmentCard key={dept.id} dept={dept} />
                  ))}
                  {data.departments.length === 0 && <div className="rdo-empty">No hay distribución de departamentos configurada</div>}
                </div>
              </div>

              {/* Private API Readiness */}
              <div className="rdo-panel rdo-panel-pad">
                <h3 className="rdo-section-title mb-4 flex items-center gap-2"><Server size={16} /> API de Inteligencia</h3>
                <div className="bg-slate-900 rounded-lg p-4 text-slate-300">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Estado</span>
                    <span className="rdo-badge text-[10px] bg-slate-800 text-emerald-400 border border-slate-700">{data.api.public_status}</span>
                  </div>
                  <div className="mb-3">
                    <span className="text-[10px] text-slate-500 block mb-1 font-mono uppercase tracking-wider">Base Path (Interno)</span>
                    <code className="text-xs text-blue-300 bg-slate-800 px-2 py-1 rounded select-all break-all block">{data.api.private_base_path}</code>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-2 font-mono uppercase tracking-wider">Eventos de Suscripción</span>
                    <div className="flex flex-wrap gap-2">
                      {data.api.supported_events.map(ev => (
                        <span key={ev} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{ev}</span>
                      ))}
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

function IntegrationCard({ integration }: { integration: RadarIntegration }) {
  const isError = integration.status === 'error';

  return (
    <div className={`p-4 border rounded-lg ${isError ? 'border-red-200 bg-red-50/30' : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30'}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{integration.name}</h4>
          <span className="text-[10px] font-mono text-slate-500 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded">{integration.provider}</span>
        </div>
        <StatusBadge status={integration.status} />
      </div>
      
      <div className="text-xs text-slate-600 dark:text-slate-400 mb-3 flex items-center gap-2">
        <span className="capitalize">{integration.category}</span>
        <span className="text-slate-300 dark:text-slate-700">•</span>
        <a href={integration.documentation_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-1">
          <Book size={10} /> Documentación
        </a>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {integration.scopes.map(scope => (
          <span key={scope} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
            {scope}
          </span>
        ))}
      </div>

      <div className="flex justify-between items-end pt-3 border-t border-slate-200 dark:border-slate-800">
        <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
           {integration.authorized ? <Lock size={10} className="text-emerald-500" /> : <Lock size={10} className="text-amber-500" />}
           {integration.authorized ? 'Autorizado' : 'Requiere autorización'}
        </div>
        {isError && integration.last_error && (
          <div className="text-[10px] text-red-500 max-w-[200px] truncate" title={integration.last_error}>
            {integration.last_error}
          </div>
        )}
      </div>
    </div>
  );
}

function WebhookCard({ webhook }: { webhook: RadarWebhookSubscription }) {
  const isError = webhook.status === 'error';
  return (
    <div className={`p-3 border rounded-lg text-sm ${isError ? 'border-red-200 bg-red-50/20' : 'border-slate-200 dark:border-slate-800'}`}>
      <div className="flex justify-between items-start mb-1.5">
        <div className="font-semibold text-slate-800 dark:text-slate-200">{webhook.name}</div>
        <StatusBadge status={webhook.status} size="sm" />
      </div>
      <div className="text-[10px] font-mono text-slate-500 mb-2 truncate max-w-full" title={webhook.endpoint_url}>
        {webhook.endpoint_url}
      </div>
      
      <div className="flex flex-wrap gap-1.5 mb-2">
        {webhook.event_types.map(ev => (
           <span key={ev} className="text-[9px] px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{ev}</span>
        ))}
      </div>

      {isError && webhook.last_error && (
        <div className="text-xs text-red-600 dark:text-red-400 mt-2 pt-2 border-t border-red-100 dark:border-red-900/30">
          <AlertTriangle size={12} className="inline mr-1" />
          {webhook.last_error} (Fallo {webhook.consecutive_failures}/{webhook.max_attempts})
        </div>
      )}
    </div>
  );
}

function DepartmentCard({ dept }: { dept: RadarIntegrationsOverviewDepartmentsItem }) {
  return (
    <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900/50">
      <div className="font-bold text-sm mb-1">{dept.name}</div>
      <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">{dept.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {dept.focus.map(f => (
          <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status, size = "md" }: { status: string, size?: "sm" | "md" }) {
  let color = "bg-slate-100 text-slate-600 border-slate-200";
  let icon = <Activity size={size === 'sm' ? 10 : 12} />;
  let label = status;

  if (status === 'ready' || status === 'active') {
    color = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50";
    icon = <CheckCircle2 size={size === 'sm' ? 10 : 12} />;
    label = status === 'ready' ? 'Listo' : 'Activo';
  } else if (status === 'pending_authorization') {
    color = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50";
    icon = <Clock size={size === 'sm' ? 10 : 12} />;
    label = 'Pendiente Auth';
  } else if (status === 'paused') {
    color = "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
    icon = <PauseCircle size={size === 'sm' ? 10 : 12} />;
    label = 'Pausado';
  } else if (status === 'error') {
    color = "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50";
    icon = <AlertTriangle size={size === 'sm' ? 10 : 12} />;
    label = 'Error';
  }

  return (
    <span className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded-full font-medium ${size === 'sm' ? 'text-[9px]' : 'text-[10px]'} ${color}`}>
      {icon} {label}
    </span>
  );
}
