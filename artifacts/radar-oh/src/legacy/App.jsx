import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import GlobalSearch from "../components/GlobalSearch";
import AlertasPreferences from "../components/AlertasPreferences";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CircleDot,
  Download,
  ExternalLink,
  Gauge,
  History,
  Layers3,
  ListChecks,
  MapPin,
  Menu,
  LogOut,
  Plus,
  Play,
  Radar,
  RefreshCw,
  Rss,
  Search,
  Tags,
  Target,
  Trash2,
  Upload,
  X,
  Sparkles,
  Zap,
  CheckCircle,
} from "lucide-react";
import {
  fetchRadarState,
  fetchRadarMonitorHistory,
  fetchRadarMonitorStatus,
  importRadarSnapshot,
  removeRadarCompetitor,
  removeRadarSource,
  saveRadarState,
  triggerRadarMonitor,
  fetchRadarAiStatus,
  triggerRadarAiAnalysis,
  fetchRadarAiAnalyses,
  fetchRadarAiAlerts,
  markRadarAiAlert,
} from "../data/radarApi";
import { useUser, useClerk } from "@clerk/react";

const EjecutivoTab = lazy(() => import("../components/EjecutivoTab"));
const ComparativaTab = lazy(() => import("../components/ComparativaTab"));
const InformesTab = lazy(() => import("../components/InformesTab"));

const KEYS = {
  sources: "radar-oh:sources",
  competitors: "radar-oh:competitors",
  keywords: "radar-oh:keywords",
  plan: "radar-oh:plan",
};
const TIPOS_FUENTE = ["Buscadores", "Redes sociales", "Portales y directorios", "Prensa y sector"];
const FRECUENCIAS = ["Diaria", "Semanal", "Mensual"];
const PRIORIDADES = ["alta", "media", "baja"];
const VOLUMENES = ["Alto", "Medio", "Bajo"];
const HORIZONTES = ["30", "60", "90"];
const HORIZONTE_LABEL = { "30": "Primeros 30 días", "60": "Días 31–60", "90": "Días 61–90" };
const TARGET_COMPETITORS = 15;
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

async function loadKey(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
async function saveKey(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("No se pudo guardar", key, error);
  }
}
const emptyCompetitor = () => ({
  id: uid(),
  nombre: "",
  ubicacion: "",
  especialidad: "",
  rango_precio: "",
  web: "",
  redes: "",
  fortalezas: "",
  debilidades: "",
  notas: "",
  prioridad: "media",
  estado: "pendiente",
});
const emptySource = () => ({
  id: uid(),
  termino: "",
  tipo: TIPOS_FUENTE[0],
  frecuencia: FRECUENCIAS[0],
  notas: "",
  connector: "manual",
  endpoint_url: "",
  enabled: false,
  competitor_id: null,
});
const emptyKeyword = () => ({ id: uid(), termino: "", volumen: "Medio", posicion: "", notas: "" });

export default function RadarOH() {
  const { user, isLoaded: userLoaded } = useUser();
  const { signOut } = useClerk();
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("connecting");
  const [syncError, setSyncError] = useState("");
  const [tab, setTab] = useState("ejecutivo");
  const [sources, setSources] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [plan, setPlan] = useState({ "30": [], "60": [], "90": [] });
  const [expandedCompetitor, setExpandedCompetitor] = useState(null);
  const [addingSource, setAddingSource] = useState(false);
  const [monitorStatus, setMonitorStatus] = useState(null);
  const [monitorHistory, setMonitorHistory] = useState([]);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [monitorError, setMonitorError] = useState("");
  const [runningSource, setRunningSource] = useState(null);
  const [addingKeyword, setAddingKeyword] = useState(false);
  const [newPlanText, setNewPlanText] = useState({ "30": "", "60": "", "90": "" });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const importInputRef = useRef(null);

  const [aiStatus, setAiStatus] = useState(null);
  const [aiAnalyses, setAiAnalyses] = useState([]);
  const [aiAlerts, setAiAlerts] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [runningAnalysis, setRunningAnalysis] = useState(false);

  const loadAiData = async (tabName) => {
    setAiLoading(true);
    setAiError("");
    try {
      if (tabName === "insights") {
        const status = await fetchRadarAiStatus();
        setAiStatus(status);
      } else if (tabName === "historial_ia") {
        const analyses = await fetchRadarAiAnalyses();
        setAiAnalyses(analyses);
      } else if (tabName === "alertas") {
        const alerts = await fetchRadarAiAlerts();
        setAiAlerts(alerts);
      }
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "No se pudo cargar la información de IA.");
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (!loading && (tab === "insights" || tab === "historial_ia" || tab === "alertas")) {
      void loadAiData(tab);
    }
  }, [tab, loading]);

  const loadMonitorData = async (includeHistory = false) => {
    setMonitorLoading(true);
    setMonitorError("");
    try {
      const [status, history] = await Promise.all([
        fetchRadarMonitorStatus(),
        includeHistory ? fetchRadarMonitorHistory() : Promise.resolve(null),
      ]);
      setMonitorStatus(status);
      if (history) setMonitorHistory(history);
    } catch (error) {
      setMonitorError(error instanceof Error ? error.message : "No se pudo cargar la monitorización.");
    } finally {
      setMonitorLoading(false);
    }
  };

  useEffect(() => {
    if (!loading && (tab === "monitorizacion" || tab === "historial")) {
      void loadMonitorData(tab === "historial");
    }
  }, [tab, loading]);

  const runMonitor = async (sourceId) => {
    setRunningSource(sourceId || "all");
    setMonitorError("");
    try {
      await triggerRadarMonitor(sourceId);
      const [state] = await Promise.all([
        fetchRadarState(),
        loadMonitorData(tab === "historial"),
      ]);
      setSources(state.sources || []);
    } catch (error) {
      setMonitorError(error instanceof Error ? error.message : "No se pudo ejecutar la monitorización.");
    } finally {
      setRunningSource(null);
    }
  };

  const runAiAnalysis = async (limit) => {
    setRunningAnalysis(true);
    setAiError("");
    try {
      await triggerRadarAiAnalysis({ limit });
      await loadAiData("insights");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "No se pudo ejecutar el análisis.");
    } finally {
      setRunningAnalysis(false);
    }
  };

  const markAlert = async (id, status) => {
    try {
      const updated = await markRadarAiAlert(id, { status });
      setAiAlerts((current) => current.map((a) => (a.id === id ? updated : a)));
      // Also update aiStatus if we are viewing insights? Usually not needed if we are on alerts tab
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "No se pudo actualizar la alerta.");
    }
  };

  const deleteSource = async (sourceId) => {
    try {
      await removeRadarSource(sourceId);
      setSources((current) => current.filter((source) => source.id !== sourceId));
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "No se pudo eliminar la fuente.");
    }
  };

  const deleteCompetitor = async (competitorId) => {
    try {
      await removeRadarCompetitor(competitorId);
      setCompetitors((current) => current.filter((competitor) => competitor.id !== competitorId));
      if (expandedCompetitor === competitorId) setExpandedCompetitor(null);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "No se pudo eliminar el competidor.");
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const [s, c, k, p] = await Promise.all([
        loadKey(KEYS.sources),
        loadKey(KEYS.competitors),
        loadKey(KEYS.keywords),
        loadKey(KEYS.plan),
      ]);
      const localState = {
        sources: Array.isArray(s) ? s : [],
        competitors: Array.isArray(c) ? c : [],
        keywords: Array.isArray(k) ? k : [],
        plan: p && typeof p === "object" && !Array.isArray(p) ? { "30": [], "60": [], "90": [], ...p } : { "30": [], "60": [], "90": [] },
      };
      const hasLocalData = localState.sources.length || localState.competitors.length || localState.keywords.length ||
        HORIZONTES.some((horizon) => localState.plan[horizon]?.length);
      try {
        const remote = await fetchRadarState();
        if (!active) return;
        let nextState = {
          sources: remote.sources || [],
          competitors: remote.competitors || [],
          keywords: remote.keywords || [],
          plan: remote.plan || { "30": [], "60": [], "90": [] },
        };
        const remoteIsEmpty = !nextState.sources.length && !nextState.competitors.length && !nextState.keywords.length &&
          !HORIZONTES.some((horizon) => nextState.plan[horizon]?.length);
        if (remoteIsEmpty && hasLocalData) {
          const migrated = await importRadarSnapshot(localState, "localStorage-migration.json");
          nextState = migrated.state;
        }
        setSources(nextState.sources);
        setCompetitors(nextState.competitors);
        setKeywords(nextState.keywords);
        setPlan({ "30": [], "60": [], "90": [], ...nextState.plan });
        setSyncStatus("remote");
        setSyncError("");
      } catch (error) {
        if (!active) return;
        setSources(localState.sources);
        setCompetitors(localState.competitors);
        setKeywords(localState.keywords);
        setPlan(localState.plan);
        setSyncStatus("local");
        setSyncError("La persistencia central no está disponible. Los cambios se guardan temporalmente en este navegador.");
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!loading) saveKey(KEYS.sources, sources); }, [sources, loading]);
  useEffect(() => { if (!loading) saveKey(KEYS.competitors, competitors); }, [competitors, loading]);
  useEffect(() => { if (!loading) saveKey(KEYS.keywords, keywords); }, [keywords, loading]);
  useEffect(() => { if (!loading) saveKey(KEYS.plan, plan); }, [plan, loading]);
  useEffect(() => {
    if (loading || syncStatus !== "remote") return undefined;
    const timer = window.setTimeout(async () => {
      try {
        await saveRadarState({ sources, competitors, keywords, plan });
        setSyncError("");
      } catch {
        setSyncStatus("local");
        setSyncError("Se perdió la conexión con PostgreSQL. Los cambios siguen guardados localmente hasta recuperar la conexión.");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [sources, competitors, keywords, plan, loading, syncStatus]);

  const planTotal = HORIZONTES.reduce((total, horizon) => total + (plan[horizon] || []).length, 0);
  const planDone = HORIZONTES.reduce(
    (total, horizon) => total + (plan[horizon] || []).filter((item) => item.done).length,
    0,
  );
  const revisados = competitors.filter((competitor) => competitor.estado === "revisado").length;
  const today = useMemo(
    () => new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }),
    [],
  );

  const selectTab = (nextTab, competitorId = null) => {
    setTab(nextTab);
    setMobileNavOpen(false);
    if (competitorId) setExpandedCompetitor(competitorId);
  };
  const exportData = () => {
    const payload = { sources, competitors, keywords, plan, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `radar-oh-datos-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importData = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let nextState = null;
      try {
        const parsed = JSON.parse(reader.result);
        const collectionKeys = ["sources", "competitors", "keywords"];
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("La raíz debe ser un objeto JSON.");
        }
        for (const key of collectionKeys) {
          if (parsed[key] !== undefined && !Array.isArray(parsed[key])) throw new Error(`El campo ${key} debe ser una lista.`);
          if (Array.isArray(parsed[key]) && parsed[key].some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
            throw new Error(`El campo ${key} contiene registros no válidos.`);
          }
        }
        if (parsed.plan !== undefined && (!parsed.plan || typeof parsed.plan !== "object" || Array.isArray(parsed.plan))) {
          throw new Error("El campo plan debe ser un objeto.");
        }
        if (parsed.plan && HORIZONTES.some((horizon) => parsed.plan[horizon] !== undefined && !Array.isArray(parsed.plan[horizon]))) {
          throw new Error("Cada horizonte del plan debe ser una lista.");
        }
        if ((sources.length || competitors.length || keywords.length || planTotal) &&
          !window.confirm("La importación sustituirá los datos actuales. ¿Continuar?")) return;
        nextState = {
          sources: parsed.sources !== undefined ? parsed.sources : sources,
          competitors: parsed.competitors !== undefined ? parsed.competitors : competitors,
          keywords: parsed.keywords !== undefined ? parsed.keywords : keywords,
          plan: parsed.plan !== undefined ? { "30": [], "60": [], "90": [], ...parsed.plan } : plan,
        };
        const result = await importRadarSnapshot(parsed, file.name);
        setSources(result.state.sources);
        setCompetitors(result.state.competitors);
        setKeywords(result.state.keywords);
        setPlan({ "30": [], "60": [], "90": [], ...result.state.plan });
        setSyncStatus("remote");
        setSyncError("");
        window.alert("Datos importados correctamente.");
      } catch (error) {
        if (error instanceof SyntaxError) {
          window.alert("El archivo no es un JSON válido.");
          return;
        }
        if (error instanceof Error && error.message.startsWith("La raíz") || error instanceof Error && error.message.startsWith("El campo")) {
          window.alert(error.message);
          return;
        }
        if (nextState && (error instanceof TypeError || error instanceof Error && error.message.includes("fetch"))) {
          setSyncStatus("local");
          setSyncError("No se pudo sincronizar la importación. Se conserva solo en este navegador.");
          setSources(nextState.sources);
          setCompetitors(nextState.competitors);
          setKeywords(nextState.keywords);
          setPlan(nextState.plan);
          window.alert("La importación se guardó localmente, pero PostgreSQL no está disponible.");
          return;
        }
        window.alert(error instanceof Error ? error.message : "El archivo no es válido.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  if (loading) {
    return <div className="rdo-loading"><div className="rdo-loading-inner"><div className="rdo-loading-mark" /><span>Cargando espacio de inteligencia</span></div></div>;
  }

  return (
    <div className="rdo-app">
      <div className="rdo-shell">
        <Sidebar tab={tab} onSelect={selectTab} open={mobileNavOpen} today={today} />
        <div className="rdo-main">
          <header className="rdo-topbar">
            <div className="rdo-topbar-left">
              <button className="rdo-mobile-toggle" onClick={() => setMobileNavOpen(true)} aria-label="Abrir navegación" data-testid="button-open-navigation"><Menu size={20} /></button>
              <div>
                <div className="rdo-kicker">OH Casas · inteligencia digital</div>
                <h1 className="rdo-topbar-title">{tab === "resumen" ? "Centro de control" : tabTitle(tab)}</h1>
              </div>
            </div>
            <div className="rdo-topbar-right">
              <GlobalSearch onNavigate={selectTab} />
              <span className="rdo-date">{today}</span>
              <div className="rdo-profile">
                <span className="rdo-avatar">{user?.firstName?.[0] || user?.primaryEmailAddress?.emailAddress?.[0]?.toUpperCase() || "?"}</span>
                <span className="rdo-profile-name">{user?.fullName || user?.primaryEmailAddress?.emailAddress || "Usuario"}</span>
                <button onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })} className="rdo-icon-button" style={{marginLeft: 8, width: 24, height: 24}} title="Cerrar sesión">
                  <LogOut size={14} />
                </button>
              </div>
            </div>
          </header>
          <main className="rdo-content">
            {syncStatus !== "remote" && syncError && <div className={`rdo-sync-banner ${syncStatus === "local" ? "warning" : ""}`} role="status"><span className="rdo-sync-dot" /><span>{syncStatus === "connecting" ? "Conectando con PostgreSQL…" : syncError}</span></div>}
            <div className="rdo-utility">
              <button className="rdo-button secondary" onClick={exportData} data-testid="button-export-data"><Download size={14} /> Exportar datos</button>
              <button className="rdo-button secondary" onClick={() => importInputRef.current?.click()} data-testid="button-import-data"><Upload size={14} /> Importar datos</button>
              <input ref={importInputRef} className="rdo-hidden" type="file" accept="application/json" onChange={importData} data-testid="input-import-data" />
            </div>
            <Suspense fallback={<div className="rdo-monitor-loading"><div className="rdo-loading-mark" /> Cargando inteligencia ejecutiva...</div>}>
              {tab === "ejecutivo" && <EjecutivoTab competitors={competitors} sources={sources} />}
              {tab === "comparativa" && <ComparativaTab competitors={competitors} />}
              {tab === "informes" && <InformesTab competitors={competitors} sources={sources} />}
            </Suspense>
            {tab === "resumen" && (
              <ResumenTab
                sources={sources}
                competitors={competitors}
                keywords={keywords}
                revisados={revisados}
                planDone={planDone}
                planTotal={planTotal}
                onJump={(id) => selectTab("competidores", id)}
                onSelect={selectTab}
              />
            )}
            {tab === "fuentes" && <FuentesTab sources={sources} setSources={setSources} competitors={competitors} adding={addingSource} setAdding={setAddingSource} onRemove={deleteSource} />}
            {tab === "competidores" && (
              <CompetidoresTab
                competitors={competitors}
                setCompetitors={setCompetitors}
                expandedId={expandedCompetitor}
                setExpandedId={setExpandedCompetitor}
                onRemove={deleteCompetitor}
              />
            )}
            {tab === "keywords" && <KeywordsTab keywords={keywords} setKeywords={setKeywords} adding={addingKeyword} setAdding={setAddingKeyword} />}
            {tab === "plan" && <PlanTab plan={plan} setPlan={setPlan} newPlanText={newPlanText} setNewPlanText={setNewPlanText} />}
            {tab === "monitorizacion" && <MonitorizacionTab status={monitorStatus} loading={monitorLoading} error={monitorError} runningSource={runningSource} onRefresh={() => loadMonitorData(false)} onRun={runMonitor} onConfigure={() => selectTab("fuentes")} />}
            {tab === "historial" && <HistorialTab events={monitorHistory} competitors={competitors} loading={monitorLoading} error={monitorError} onRefresh={() => loadMonitorData(true)} />}
            {tab === "insights" && <InsightsTab status={aiStatus} loading={aiLoading} error={aiError} onRun={(limit) => runAiAnalysis(limit)} running={runningAnalysis} />}
            {tab === "alertas" && (
              <>
                <AlertasPreferences />
                <AlertasTab alerts={aiAlerts} loading={aiLoading} error={aiError} onMark={markAlert} onRefresh={() => loadAiData("alertas")} />
              </>
            )}
            {tab === "historial_ia" && <HistorialIATab analyses={aiAnalyses} loading={aiLoading} error={aiError} onRefresh={() => loadAiData("historial_ia")} />}
          </main>
        </div>
      </div>
      {mobileNavOpen && <button className="rdo-mobile-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Cerrar navegación" data-testid="button-close-navigation" />}
    </div>
  );
}

function tabTitle(tab) {
  return { ejecutivo: "Dashboard Ejecutivo", comparativa: "Comparativa Competitiva", informes: "Informes", fuentes: "Fuentes de señal", competidores: "Mapa competitivo", keywords: "Keywords estratégicas", plan: "Plan de situación", monitorizacion: "Monitorización automática", historial: "Historial competitivo", insights: "Insights IA", alertas: "Alertas de mercado", historial_ia: "Historial IA", resumen: "Centro de control" }[tab] || "RadarOH";
}

function Sidebar({ tab, onSelect, open, today }) {
  const items = [
    { id: "ejecutivo", label: "Ejecutivo", icon: Gauge, group: "Espacio de trabajo" },
    { id: "comparativa", label: "Comparativa", icon: Layers3, group: "Espacio de trabajo" },
    { id: "resumen", label: "Resumen", icon: Activity, group: "Espacio de trabajo" },
    { id: "fuentes", label: "Fuentes", icon: Search, group: "Espacio de trabajo" },
    { id: "competidores", label: "Competidores", icon: Building2, group: "Espacio de trabajo" },
    { id: "keywords", label: "Keywords", icon: Tags, group: "Espacio de trabajo" },
    { id: "plan", label: "Plan 30–60–90", icon: ListChecks, group: "Espacio de trabajo" },
    { id: "monitorizacion", label: "Monitorización", icon: Activity, group: "Inteligencia continua" },
    { id: "historial", label: "Historial", icon: History, group: "Inteligencia continua" },
    { id: "informes", label: "Informes", icon: Download, group: "Inteligencia continua" },
    { id: "insights", label: "Insights IA", icon: Sparkles, group: "Inteligencia artificial" },
    { id: "alertas", label: "Alertas", icon: BellRing, group: "Inteligencia artificial" },
    { id: "historial_ia", label: "Historial IA", icon: History, group: "Inteligencia artificial" },
  ];
  return (
    <aside className={`rdo-sidebar ${open ? "open" : ""}`}>
      <div className="rdo-brand">
        <span className="rdo-brand-mark"><Radar size={19} /></span>
        <div><div className="rdo-brand-name">RadarOH</div><div className="rdo-brand-sub">OH Casas / signal desk</div></div>
      </div>
      {["Espacio de trabajo", "Inteligencia continua", "Inteligencia artificial"].map((group) => (
        <div key={group} style={{ marginBottom: group === "Espacio de trabajo" ? 24 : group === "Inteligencia continua" ? 24 : 0 }}>
          <div className="rdo-nav-label">{group}</div>
          <nav className="rdo-nav" aria-label={group}>
            {items.filter((item) => item.group === group).map(({ id, label, icon: Icon, disabled }) => (
              <button
                key={id}
                className={`rdo-nav-item ${tab === id ? "active" : ""} ${disabled ? "disabled" : ""}`}
                onClick={() => !disabled && onSelect(id)}
                disabled={disabled}
                title={disabled ? "Disponible en una fase posterior" : label}
                data-testid={`nav-${id}`}
              >
                <Icon size={16} strokeWidth={1.8} /><span className="rdo-nav-text">{label}</span>
                {disabled && <span className="rdo-nav-kicker">Pronto</span>}
              </button>
            ))}
          </nav>
        </div>
      ))}
      <div className="rdo-sidebar-foot">
        <div className="rdo-status-line"><span className="rdo-status-dot" /> Base local sincronizada</div>
        <div style={{ marginTop: 8, color: "hsl(207 20% 57%)", fontFamily: "Space Mono, monospace", fontSize: 9 }}>{today}</div>
      </div>
    </aside>
  );
}

function PageIntro({ eyebrow, title, description, action }) {
  return (
    <div className="rdo-page-intro">
      <div><div className="rdo-eyebrow"><CircleDot size={12} /> {eyebrow}</div><h2 className="rdo-page-title">{title}</h2><p className="rdo-page-desc">{description}</p></div>
      {action && <div className="rdo-actions">{action}</div>}
    </div>
  );
}
function Panel({ children, className = "", pad = true, style }) { return <section className={`rdo-panel ${pad ? "rdo-panel-pad" : ""} ${className}`} style={style}>{children}</section>; }
function SectionHead({ index, title, description, action }) {
  return <div className="rdo-section-head"><div><div className="rdo-section-index">{index}</div><h3 className="rdo-section-title">{title}</h3>{description && <p className="rdo-section-note">{description}</p>}</div>{action}</div>;
}
function AddButton({ onClick, label }) { return <button className="rdo-button primary" onClick={onClick} data-testid={`button-add-${label.toLowerCase().replaceAll(" ", "-")}`}><Plus size={14} />{label}</button>; }
function IconButton({ onClick, title, children, testId }) { return <button className="rdo-icon-button" onClick={onClick} title={title} aria-label={title} data-testid={testId}>{children}</button>; }
function FormActions({ onCancel, onSave, saveLabel = "Guardar" }) {
  return <div className="rdo-form-actions"><button className="rdo-button ghost" onClick={onCancel} data-testid="button-cancel-form">Cancelar</button><button className="rdo-button primary" onClick={onSave} data-testid="button-save-form"><Check size={14} />{saveLabel}</button></div>;
}
function Field({ label, children, full = false }) { return <label className={`rdo-field ${full ? "rdo-form-grid full" : ""}`}><span className="rdo-field-label">{label}</span>{children}</label>; }
function EmptyState({ title, text }) { return <div className="rdo-empty"><strong>{title}</strong>{text}</div>; }
function Badge({ children, tone = "" }) { return <span className={`rdo-badge ${tone}`}>{children}</span>; }

function ResumenTab({ sources, competitors, keywords, revisados, planDone, planTotal, onJump, onSelect }) {
  const keywordBaseline = keywords.filter((keyword) => keyword.posicion !== "").length;
  const coverage = Math.min(100, Math.round((competitors.length / TARGET_COMPETITORS) * 100));
  const radarPoints = competitors.map((competitor, index) => {
    const angle = (index / Math.max(competitors.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = competitor.prioridad === "alta" ? 47 : competitor.prioridad === "media" ? 92 : 136;
    return { ...competitor, x: 180 + radius * Math.cos(angle), y: 180 + radius * Math.sin(angle), color: priorityColor(competitor.prioridad) };
  });
  const activity = [
    competitors.length && `${competitors.length} competidor${competitors.length === 1 ? "" : "es"} en el mapa`,
    sources.length && `${sources.length} fuente${sources.length === 1 ? "" : "s"} configurada${sources.length === 1 ? "" : "s"}`,
    keywordBaseline && `${keywordBaseline} keyword${keywordBaseline === 1 ? "" : "s"} con posición base`,
    planDone && `${planDone} tarea${planDone === 1 ? "" : "s"} del plan completada${planDone === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return (
    <>
      <PageIntro
        eyebrow="Lectura operativa · día 3"
        title="La señal antes que el ruido."
        description="Un punto de control para entender qué está cubierto, qué requiere revisión y dónde poner la atención siguiente."
        action={<button className="rdo-button secondary" onClick={() => onSelect("competidores")} data-testid="button-review-map"><Target size={14} /> Revisar mapa</button>}
      />
      <div className="rdo-stat-grid">
        <Stat label="Fuentes configuradas" value={sources.length} meta="canales de señal" icon={Search} />
        <Stat label="Competidores mapeados" value={`${competitors.length} / ${TARGET_COMPETITORS}`} meta={`${revisados} fichas revisadas`} progress={coverage} icon={Building2} />
        <Stat label="Keywords con base" value={keywordBaseline} meta={`${keywords.length} definidas`} icon={Tags} />
        <Stat label="Plan ejecutado" value={planTotal ? `${planDone}/${planTotal}` : "—"} meta="tareas completadas" progress={planTotal ? Math.round((planDone / planTotal) * 100) : 0} icon={ListChecks} />
      </div>
      <div className="rdo-summary-grid">
        <Panel className="rdo-radar-panel">
          <SectionHead index="01 / RADAR DE PRIORIDAD" title="Mapa de vigilancia" description="Cada punto es una ficha. La distancia al centro representa la prioridad de seguimiento." />
          <div className="rdo-radar-wrap">
            <div className="rdo-radar">
              <svg viewBox="0 0 360 360" role="img" aria-label="Radar de competidores por prioridad">
                {[47, 92, 136].map((radius) => <circle key={radius} cx="180" cy="180" r={radius} fill="none" stroke="hsl(207 16% 82%)" strokeWidth="1" />)}
                <line x1="44" y1="180" x2="316" y2="180" stroke="hsl(207 16% 88%)" strokeWidth="1" /><line x1="180" y1="44" x2="180" y2="316" stroke="hsl(207 16% 88%)" strokeWidth="1" />
                <line x1="84" y1="84" x2="276" y2="276" stroke="hsl(207 16% 91%)" strokeWidth="1" /><line x1="276" y1="84" x2="84" y2="276" stroke="hsl(207 16% 91%)" strokeWidth="1" />
                <circle cx="180" cy="180" r="3" fill="hsl(15 77% 52%)" />
                {radarPoints.map((point) => <circle key={point.id} cx={point.x} cy={point.y} r="6" fill={point.color} stroke="hsl(0 0% 100%)" strokeWidth="2" style={{ cursor: "pointer" }} onClick={() => onJump(point.id)}><title>{point.nombre || "Sin nombre"}</title></circle>)}
                <text x="180" y="35" textAnchor="middle" fill="hsl(207 13% 50%)" fontSize="8" fontFamily="Space Mono">ATENCIÓN</text>
                <text x="180" y="350" textAnchor="middle" fill="hsl(207 13% 50%)" fontSize="8" fontFamily="Space Mono">CONTEXTO</text>
              </svg>
              <div className="rdo-radar-sweep" />
              {!competitors.length && <div className="rdo-radar-empty">Añade competidores<br />para activar el radar</div>}
            </div>
          </div>
          <div className="rdo-radar-legend"><Legend color="hsl(7 65% 47%)" label="Alta · acción próxima" /><Legend color="hsl(38 78% 47%)" label="Media · seguimiento" /><Legend color="hsl(170 31% 42%)" label="Baja · contexto" /></div>
        </Panel>
        <div className="rdo-side-stack">
          <Panel className="rdo-activity">
            <SectionHead index="02 / ACTIVIDAD" title="Últimas señales" description="Estado actual de la base de trabajo." />
            {activity.length ? <div className="rdo-activity-list">{activity.map((item, index) => <div className="rdo-activity-item" key={item}><span className="rdo-activity-mark" /><div><div className="rdo-activity-text">{item}</div><div className="rdo-activity-time">{index === 0 ? "Ahora" : "En esta sesión"}</div></div></div>)}</div> : <EmptyState title="Sin actividad todavía" text="Empieza por añadir una fuente o una ficha al mapa." />}
          </Panel>
          <Panel className="rdo-insight">
            <SectionHead index="03 / LECTURA" title="Siguiente movimiento" />
            <p>{competitors.length < TARGET_COMPETITORS ? <>El mapa está al <strong>{coverage}%</strong> del objetivo inicial. Completa las fichas antes de sacar conclusiones de mercado.</> : <>El objetivo inicial de fichas está cubierto. Revisa las prioridades altas y actualiza las posiciones base.</>}</p>
          </Panel>
        </div>
      </div>
      <Panel style={{ marginTop: 14 }}>
        <SectionHead index="04 / COBERTURA" title="Inventario de inteligencia" description="Accesos directos a las colecciones que sostienen el análisis." />
        <div className="rdo-collection">
          <CollectionRow icon={Search} title="Fuentes y búsquedas" note="Términos, canales y cadencia de revisión" count={sources.length} action={() => onSelect("fuentes")} />
          <CollectionRow icon={Building2} title="Competidores" note="Fichas de empresas y prioridades de vigilancia" count={competitors.length} action={() => onSelect("competidores")} />
          <CollectionRow icon={Layers3} title="Plan de situación" note="Acciones ordenadas por horizonte temporal" count={planTotal ? `${planDone}/${planTotal}` : "—"} action={() => onSelect("plan")} />
        </div>
      </Panel>
    </>
  );
}
function Stat({ label, value, meta, progress, icon: Icon }) {
  return <div className="rdo-stat"><Icon size={15} color="hsl(15 77% 52%)" /><div className="rdo-stat-value" data-testid={`value-${label.toLowerCase().replaceAll(" ", "-")}`}>{value}</div><div className="rdo-stat-label">{label}</div><div className="rdo-stat-meta">{meta}</div>{progress !== undefined && <div className="rdo-progress"><span style={{ width: `${progress}%` }} /></div>}</div>;
}
function Legend({ color, label }) { return <span className="rdo-legend"><i style={{ background: color }} />{label}</span>; }
function CollectionRow({ icon: Icon, title, note, count, action }) {
  return <button className="rdo-collection-row" onClick={action} data-testid={`button-open-${title.toLowerCase().replaceAll(" ", "-")}`}><span className="rdo-row-icon"><Icon size={15} /></span><span className="rdo-row-main"><span className="rdo-row-title">{title}</span><span className="rdo-row-note">{note}</span></span><span className="rdo-row-end"><Badge tone="signal">{count}</Badge><ArrowUpRight size={15} color="hsl(207 13% 60%)" /></span></button>;
}
function priorityColor(priority) { return priority === "alta" ? "hsl(7 65% 47%)" : priority === "media" ? "hsl(38 78% 47%)" : "hsl(170 31% 42%)"; }

function FuentesTab({ sources, setSources, competitors, adding, setAdding, onRemove }) {
  const [draft, setDraft] = useState(emptySource());
  const [expandedId, setExpandedId] = useState(null);
  const save = () => {
    if (!draft.termino.trim()) return;
    setSources([...sources, draft]); setDraft(emptySource()); setAdding(false);
  };
  const grouped = TIPOS_FUENTE.map((tipo) => ({ tipo, items: sources.filter((source) => source.tipo === tipo) }));
  const update = (id, patch) => setSources(sources.map((source) => source.id === id ? { ...source, ...patch } : source));
  return (
    <>
      <PageIntro eyebrow="01 / señales" title="Fuentes de señal" description="Términos, canales y frecuencia con los que se seguirá a OH Casas y al mercado." action={!adding && <AddButton onClick={() => setAdding(true)} label="Añadir fuente" />} />
      {adding && <Panel><SectionHead index="NUEVA FUENTE" title="Configurar señal" description="Define qué debe entrar en tu lectura recurrente." /><div className="rdo-form-grid three"><Field label="Término o búsqueda" full={false}><input autoFocus className="rdo-control" placeholder="Ej. casas modulares Valencia" value={draft.termino} onChange={(event) => setDraft({ ...draft, termino: event.target.value })} data-testid="input-source-term" /></Field><Field label="Tipo"><select className="rdo-control" value={draft.tipo} onChange={(event) => setDraft({ ...draft, tipo: event.target.value })} data-testid="select-source-type">{TIPOS_FUENTE.map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="Frecuencia"><select className="rdo-control" value={draft.frecuencia} onChange={(event) => setDraft({ ...draft, frecuencia: event.target.value })} data-testid="select-source-frequency">{FRECUENCIAS.map((frequency) => <option key={frequency}>{frequency}</option>)}</select></Field><Field label="Notas" full><textarea className="rdo-control textarea" placeholder="Contexto de esta fuente (opcional)" value={draft.notas} onChange={(event) => setDraft({ ...draft, notas: event.target.value })} data-testid="textarea-source-notes" /></Field></div><FormActions onCancel={() => { setAdding(false); setDraft(emptySource()); }} onSave={save} /></Panel>}
      <div style={{ marginTop: adding ? 14 : 0 }}>{sources.length === 0 && !adding ? <EmptyState title="El radar todavía no recibe señales" text="Añade la primera búsqueda o canal que quieras vigilar." /> : grouped.filter((group) => group.items.length).map((group) => <div key={group.tipo} style={{ marginBottom: 24 }}><div className="rdo-section-index" style={{ margin: "0 0 8px 2px" }}>{group.tipo}</div><div className="rdo-collection">{group.items.map((source) => <Panel key={source.id} pad={false}><button className="rdo-collection-row rdo-source-row" onClick={() => setExpandedId(expandedId === source.id ? null : source.id)}><span className="rdo-row-icon">{source.connector === "rss" ? <Rss size={15} /> : <Search size={15} />}</span><span className="rdo-row-main"><span className="rdo-row-title">{source.termino}</span><span className="rdo-row-note">{source.endpoint_url || source.notas || "Monitorización manual"}</span></span><span className="rdo-row-end"><Badge tone={source.enabled ? "teal" : ""}>{source.enabled ? "Activa" : "Manual"}</Badge><Badge tone={source.frecuencia === "Diaria" ? "signal" : source.frecuencia === "Semanal" ? "amber" : ""}>{source.frecuencia}</Badge><ChevronDown size={16} style={{ transform: expandedId === source.id ? "rotate(180deg)" : "none" }} /></span></button>{expandedId === source.id && <div className="rdo-source-config"><div className="rdo-form-grid"><Field label="Conector"><select className="rdo-control" value={source.connector || "manual"} onChange={(event) => update(source.id, { connector: event.target.value, enabled: event.target.value === "manual" ? false : source.enabled })}><option value="manual">Manual</option><option value="rss">RSS / Atom</option><option value="json_api">API JSON pública</option><option value="web">Página web pública</option></select></Field><Field label="Frecuencia"><select className="rdo-control" value={source.frecuencia} onChange={(event) => update(source.id, { frecuencia: event.target.value })}>{FRECUENCIAS.map((frequency) => <option key={frequency}>{frequency}</option>)}</select></Field><Field label="Endpoint público" full><input className="rdo-control" placeholder="https://…" value={source.endpoint_url || ""} onChange={(event) => update(source.id, { endpoint_url: event.target.value, enabled: event.target.value.trim() ? source.enabled : false })} /></Field><Field label="Competidor relacionado"><select className="rdo-control" value={source.competitor_id || ""} onChange={(event) => update(source.id, { competitor_id: event.target.value || null })}><option value="">Detección automática</option>{competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.nombre}</option>)}</select></Field><Field label="Estado"><label className="rdo-toggle"><input type="checkbox" checked={Boolean(source.enabled)} disabled={(source.connector || "manual") === "manual" || !(source.endpoint_url || "").trim()} onChange={(event) => update(source.id, { enabled: event.target.checked })} /><span>{source.enabled ? "Monitorización habilitada" : "Monitorización pausada"}</span></label></Field></div><div className="rdo-form-actions" style={{ justifyContent: "space-between" }}><button className="rdo-button danger" onClick={() => window.confirm("¿Eliminar esta fuente y su historial?") && onRemove(source.id)}><Trash2 size={14} /> Eliminar</button><button className="rdo-button secondary" onClick={() => setExpandedId(null)}>Cerrar</button></div></div>}</Panel>)}</div></div>)}</div>
    </>
  );
}

function MonitorizacionTab({ status, loading, error, runningSource, onRefresh, onRun, onConfigure }) {
  const summary = status?.summary;
  const enabled = status?.sources?.filter((source) => source.enabled) || [];
  return (
    <>
      <PageIntro eyebrow="05 / escucha continua" title="Monitorización automática" description="Seguimiento seguro de feeds RSS, APIs JSON y páginas web públicas, con evidencias y detección de cambios." action={<><button className="rdo-button secondary" onClick={onRefresh} disabled={loading}><RefreshCw size={14} className={loading ? "rdo-spin" : ""} /> Actualizar</button><button className="rdo-button primary" onClick={() => onRun()} disabled={!enabled.length || Boolean(runningSource)}><Play size={14} /> {runningSource === "all" ? "Ejecutando…" : "Ejecutar activas"}</button></>} />
      {error && <div className="rdo-monitor-error"><AlertTriangle size={16} /><span>{error}</span></div>}
      {!status && loading ? <Panel><div className="rdo-monitor-loading"><RefreshCw size={18} className="rdo-spin" /> Consultando fuentes…</div></Panel> : status && <>
        <div className="rdo-stat-grid">
          <Stat label="Fuentes activas" value={summary.enabled_sources} meta={`${summary.total_sources} configuradas`} icon={Activity} />
          <Stat label="Saludables" value={summary.healthy_sources} meta="última ejecución correcta" icon={CheckCircle2} />
          <Stat label="Con error" value={summary.error_sources} meta="requieren revisión" icon={AlertTriangle} />
          <Stat label="Cambios recientes" value={status.recent_changes.length} meta="últimos eventos registrados" icon={History} />
        </div>
        <div className="rdo-monitor-grid">
          <Panel>
            <SectionHead index="FUENTES" title="Estado de conectores" description="El scheduler respeta la frecuencia de cada fuente y reintenta con backoff ante fallos temporales." action={<button className="rdo-button ghost" onClick={onConfigure}>Configurar</button>} />
            {!status.sources.length ? <EmptyState title="No hay fuentes" text="Configura la primera fuente antes de activar la escucha." /> : <div className="rdo-monitor-sources">{status.sources.map((source) => <div className="rdo-monitor-source" key={source.source_id}><span className={`rdo-health-dot ${source.last_status}`} /><div className="rdo-row-main"><div className="rdo-row-title">{source.source_label}</div><div className="rdo-row-note">{source.enabled ? `${connectorLabel(source.connector)} · próxima ${formatDate(source.next_run_at)}` : "Pausada"}</div>{source.last_error && <div className="rdo-source-error">{source.last_error}</div>}</div><div className="rdo-row-end"><Badge tone={statusTone(source.last_status)}>{statusLabel(source.last_status)}</Badge><button className="rdo-icon-button rdo-run-button" title="Ejecutar ahora" disabled={source.connector === "manual" || !source.endpoint_url || Boolean(runningSource)} onClick={() => onRun(source.source_id)}>{runningSource === source.source_id ? <RefreshCw size={14} className="rdo-spin" /> : <Play size={14} />}</button></div></div>)}</div>}
          </Panel>
          <Panel>
            <SectionHead index="CAMBIOS" title="Señales detectadas" description="Cada evento enlaza con la evidencia que originó el cambio." />
            {!status.recent_changes.length ? <EmptyState title="Sin cambios todavía" text="La primera ejecución creará una línea base de evidencias." /> : <div className="rdo-event-list">{status.recent_changes.slice(0, 8).map((event) => <EventRow key={event.id} event={event} />)}</div>}
          </Panel>
        </div>
        <Panel className="rdo-runs-panel">
          <SectionHead index="EJECUCIONES" title="Actividad reciente" description={`Última ejecución: ${formatDate(summary.last_run_at)} · próxima programada: ${formatDate(summary.next_run_at)}`} />
          {!status.recent_runs.length ? <EmptyState title="Sin ejecuciones" text="Activa un conector o ejecútalo manualmente para empezar." /> : <div className="rdo-table-wrap"><table className="rdo-table"><thead><tr><th>Fuente</th><th>Inicio</th><th>Estado</th><th>Intentos</th><th>Elementos</th><th>Cambios</th><th>Duración</th></tr></thead><tbody>{status.recent_runs.map((run) => <tr key={run.id}><td><strong>{run.source_label}</strong><div className="rdo-row-note">{run.trigger === "scheduler" ? "Scheduler" : "Manual"}</div></td><td>{formatDate(run.started_at)}</td><td><Badge tone={statusTone(run.status)}>{statusLabel(run.status)}</Badge></td><td>{run.attempts}</td><td>{run.item_count}</td><td>{run.change_count}</td><td>{run.duration_ms == null ? "—" : `${run.duration_ms} ms`}</td></tr>)}</tbody></table></div>}
        </Panel>
      </>}
    </>
  );
}

function HistorialTab({ events, competitors, loading, error, onRefresh }) {
  const [competitorId, setCompetitorId] = useState("");
  const visible = competitorId ? events.filter((event) => event.competitor_id === competitorId) : events;
  return (
    <>
      <PageIntro eyebrow="06 / memoria competitiva" title="Historial por competidor" description="Cronología verificable de señales nuevas y contenidos actualizados, vinculada a cada competidor cuando existe coincidencia." action={<button className="rdo-button secondary" onClick={onRefresh} disabled={loading}><RefreshCw size={14} className={loading ? "rdo-spin" : ""} /> Actualizar</button>} />
      {error && <div className="rdo-monitor-error"><AlertTriangle size={16} /><span>{error}</span></div>}
      <Panel>
        <div className="rdo-history-toolbar"><Field label="Filtrar por competidor"><select className="rdo-control" value={competitorId} onChange={(event) => setCompetitorId(event.target.value)}><option value="">Todos los competidores</option>{competitors.map((competitor) => <option value={competitor.id} key={competitor.id}>{competitor.nombre}</option>)}</select></Field><div className="rdo-history-count"><strong>{visible.length}</strong><span>eventos visibles</span></div></div>
        {loading && !events.length ? <div className="rdo-monitor-loading"><RefreshCw size={18} className="rdo-spin" /> Cargando historial…</div> : !visible.length ? <EmptyState title="No hay eventos para este filtro" text="Los cambios aparecerán después de ejecutar una fuente configurada." /> : <div className="rdo-event-list rdo-history-list">{visible.map((event) => <EventRow key={event.id} event={event} detailed />)}</div>}
      </Panel>
    </>
  );
}

function EventRow({ event, detailed = false }) {
  return <article className="rdo-event"><span className={`rdo-event-mark ${event.change_type}`}><CircleDot size={14} /></span><div className="rdo-row-main"><div className="rdo-event-meta"><Badge tone={event.change_type === "new" ? "signal" : "amber"}>{event.change_type === "new" ? "Nuevo" : "Actualizado"}</Badge><span>{formatDate(event.occurred_at)}</span></div><div className="rdo-event-title">{event.title || "Cambio detectado"}</div>{detailed && event.summary && <p>{event.summary}</p>}<div className="rdo-event-source">{event.source_label}{event.competitor_name ? ` · ${event.competitor_name}` : ""}</div></div>{event.url && <a className="rdo-icon-button" href={event.url} target="_blank" rel="noreferrer" title="Abrir evidencia"><ExternalLink size={15} /></a>}</article>;
}

function connectorLabel(connector) {
  return { rss: "RSS / Atom", json_api: "API JSON", web: "Web pública", manual: "Manual" }[connector] || connector;
}
function statusLabel(status) {
  return { idle: "Sin ejecutar", running: "En curso", success: "Correcta", error: "Error" }[status] || status;
}
function statusTone(status) {
  return status === "success" ? "teal" : status === "error" ? "red" : status === "running" ? "signal" : "";
}
function formatDate(value) {
  if (!value) return "sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "sin fecha" : new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function CompetidoresTab({ competitors, setCompetitors, expandedId, setExpandedId, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyCompetitor());
  const saveNew = () => { if (!draft.nombre.trim()) return; setCompetitors([...competitors, draft]); setAdding(false); setDraft(emptyCompetitor()); };
  const update = (id, patch) => setCompetitors(competitors.map((competitor) => competitor.id === id ? { ...competitor, ...patch } : competitor));
  const remove = (id) => { if (!window.confirm("¿Eliminar esta ficha del mapa?")) return; void onRemove(id); };
  return (
    <>
      <PageIntro eyebrow="02 / mapa competitivo" title="Competidores" description={`Fichas de empresas de casas modulares a seguir. El objetivo inicial es construir un mapa de ${TARGET_COMPETITORS} actores.`} action={!adding && <AddButton onClick={() => { setDraft(emptyCompetitor()); setAdding(true); }} label="Añadir competidor" />} />
      {adding && <Panel><SectionHead index="NUEVA FICHA" title="Añadir al mapa" description="Registra primero el contexto que permitirá priorizar la vigilancia." /><CompetitorForm draft={draft} setDraft={setDraft} /><FormActions onCancel={() => setAdding(false)} onSave={saveNew} saveLabel="Añadir al radar" /></Panel>}
      <div style={{ marginTop: adding ? 14 : 0 }}>{competitors.length === 0 && !adding ? <EmptyState title="El mapa está vacío" text="Añade la primera empresa de casas modulares a seguir." /> : <div className="rdo-collection">{competitors.map((competitor) => <CompetitorCard key={competitor.id} c={competitor} expanded={expandedId === competitor.id} onToggle={() => setExpandedId(expandedId === competitor.id ? null : competitor.id)} onUpdate={(patch) => update(competitor.id, patch)} onRemove={() => remove(competitor.id)} />)}</div>}</div>
    </>
  );
}
function CompetitorCard({ c, expanded, onToggle, onUpdate, onRemove }) {
  const tone = c.prioridad === "alta" ? "red" : c.prioridad === "media" ? "amber" : "teal";
  return <Panel pad={false} className="rdo-competitor-card"><button className="rdo-collection-row" style={{ width: "100%", border: 0, borderRadius: 0, textAlign: "left" }} onClick={onToggle} data-testid={`button-expand-competitor-${c.id}`}><span className="rdo-row-icon" style={{ color: priorityColor(c.prioridad), background: "hsl(207 16% 96%)" }}><Building2 size={15} /></span><span className="rdo-row-main"><span className="rdo-row-title">{c.nombre || "Sin nombre"}</span><span className="rdo-row-note">{[c.ubicacion, c.especialidad].filter(Boolean).join(" · ") || "Sin contexto añadido"}</span></span><span className="rdo-row-end"><Badge tone={tone}>Prioridad {c.prioridad}</Badge><Badge tone={c.estado === "revisado" ? "teal" : ""}>{c.estado === "revisado" ? "Revisado" : "Pendiente"}</Badge><ChevronDown size={16} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }} /></span></button>{expanded && <div style={{ padding: "18px 20px 20px", borderTop: "1px solid hsl(var(--line))" }}><CompetitorForm draft={c} setDraft={(next) => onUpdate(typeof next === "function" ? next(c) : next)} /><div className="rdo-form-actions" style={{ justifyContent: "space-between" }}><button className="rdo-button danger" onClick={onRemove} data-testid={`button-delete-competitor-${c.id}`}><Trash2 size={14} /> Eliminar</button><button className="rdo-button primary" onClick={() => onUpdate({ estado: c.estado === "revisado" ? "pendiente" : "revisado" })} data-testid={`button-toggle-status-${c.id}`}>{c.estado === "revisado" ? "Marcar como pendiente" : "Marcar como revisado"}</button></div></div>}</Panel>;
}
function CompetitorForm({ draft, setDraft }) {
  const field = (key) => ({ value: draft[key] || "", onChange: (event) => setDraft({ ...draft, [key]: event.target.value }) });
  return <div className="rdo-form-grid"><Field label="Nombre de la empresa"><input className="rdo-control" placeholder="Ej. Modular Home" {...field("nombre")} data-testid="input-competitor-name" /></Field><Field label="Prioridad"><select className="rdo-control" value={draft.prioridad} onChange={(event) => setDraft({ ...draft, prioridad: event.target.value })} data-testid="select-competitor-priority">{PRIORIDADES.map((priority) => <option key={priority} value={priority}>Prioridad {priority}</option>)}</select></Field><Field label="Ubicación"><input className="rdo-control" placeholder="Ciudad o área de operación" {...field("ubicacion")} data-testid="input-competitor-location" /></Field><Field label="Especialidad / tipología"><input className="rdo-control" placeholder="Tipología, sistema o nicho" {...field("especialidad")} data-testid="input-competitor-specialty" /></Field><Field label="Rango de precio"><input className="rdo-control" placeholder="Orientativo" {...field("rango_precio")} data-testid="input-competitor-price" /></Field><Field label="Web"><input className="rdo-control" placeholder="https://" {...field("web")} data-testid="input-competitor-web" /></Field><Field label="Redes sociales" full><input className="rdo-control" placeholder="Perfiles principales" {...field("redes")} data-testid="input-competitor-social" /></Field><Field label="Fortalezas" full><textarea className="rdo-control textarea" {...field("fortalezas")} data-testid="textarea-competitor-strengths" /></Field><Field label="Debilidades" full><textarea className="rdo-control textarea" {...field("debilidades")} data-testid="textarea-competitor-weaknesses" /></Field><Field label="Notas" full><textarea className="rdo-control textarea" {...field("notas")} data-testid="textarea-competitor-notes" /></Field></div>;
}

function KeywordsTab({ keywords, setKeywords, adding, setAdding }) {
  const [draft, setDraft] = useState(emptyKeyword());
  const save = () => { if (!draft.termino.trim()) return; setKeywords([...keywords, draft]); setDraft(emptyKeyword()); setAdding(false); };
  const update = (id, patch) => setKeywords(keywords.map((keyword) => keyword.id === id ? { ...keyword, ...patch } : keyword));
  return (
    <>
      <PageIntro eyebrow="03 / lenguaje de mercado" title="Keywords estratégicas" description="Términos que ayudan a leer la demanda y establecer una posición manual de partida." action={!adding && <AddButton onClick={() => setAdding(true)} label="Añadir keyword" />} />
      {adding && <Panel><SectionHead index="NUEVA KEYWORD" title="Añadir término" description="Captura el volumen percibido y la posición base para mantener una referencia." /><div className="rdo-form-grid three"><Field label="Palabra clave"><input autoFocus className="rdo-control" placeholder="Ej. casa modular" value={draft.termino} onChange={(event) => setDraft({ ...draft, termino: event.target.value })} data-testid="input-keyword-term" /></Field><Field label="Volumen"><select className="rdo-control" value={draft.volumen} onChange={(event) => setDraft({ ...draft, volumen: event.target.value })} data-testid="select-keyword-volume">{VOLUMENES.map((volume) => <option key={volume}>{volume}</option>)}</select></Field><Field label="Posición base"><input className="rdo-control" placeholder="Ej. 12" value={draft.posicion} onChange={(event) => setDraft({ ...draft, posicion: event.target.value })} data-testid="input-keyword-position" /></Field></div><FormActions onCancel={() => setAdding(false)} onSave={save} /></Panel>}
      <div style={{ marginTop: adding ? 14 : 0 }}>{keywords.length === 0 && !adding ? <EmptyState title="Aún no hay keywords" text="Añade el primer término estratégico para crear una línea base." /> : keywords.length > 0 && <div className="rdo-table-wrap"><table className="rdo-table"><thead><tr><th>Palabra clave</th><th>Volumen</th><th>Posición base</th><th style={{ width: 55 }} /></tr></thead><tbody>{keywords.map((keyword) => <tr key={keyword.id}><td><strong>{keyword.termino}</strong>{keyword.notas && <div className="rdo-row-note">{keyword.notas}</div>}</td><td><Badge tone={keyword.volumen === "Alto" ? "red" : keyword.volumen === "Medio" ? "amber" : "teal"}>{keyword.volumen}</Badge></td><td><input className="rdo-control rdo-inline-input" value={keyword.posicion} placeholder="—" onChange={(event) => update(keyword.id, { posicion: event.target.value })} data-testid={`input-keyword-position-${keyword.id}`} /></td><td><IconButton title="Eliminar keyword" testId={`button-delete-keyword-${keyword.id}`} onClick={() => window.confirm("¿Eliminar esta keyword?") && setKeywords(keywords.filter((item) => item.id !== keyword.id))}><Trash2 size={15} /></IconButton></td></tr>)}</tbody></table></div>}</div>
    </>
  );
}

function PlanTab({ plan, setPlan, newPlanText, setNewPlanText }) {
  const addItem = (horizon) => { const text = newPlanText[horizon].trim(); if (!text) return; setPlan({ ...plan, [horizon]: [...(plan[horizon] || []), { id: uid(), text, done: false }] }); setNewPlanText({ ...newPlanText, [horizon]: "" }); };
  const toggle = (horizon, id) => setPlan({ ...plan, [horizon]: (plan[horizon] || []).map((item) => item.id === id ? { ...item, done: !item.done } : item) });
  const remove = (horizon, id) => setPlan({ ...plan, [horizon]: (plan[horizon] || []).filter((item) => item.id !== id) });
  return (
    <>
      <PageIntro eyebrow="04 / ejecución" title="Plan 30–60–90" description="El diagnóstico se convierte en un ritmo de trabajo: qué hacer primero, qué validar después y qué consolidar al final del ciclo." />
      <div className="rdo-plan-grid">{HORIZONTES.map((horizon) => <Panel key={horizon} className="rdo-plan-card"><div className="rdo-plan-number">Horizonte {horizon}</div><h3 className="rdo-plan-title">Día {horizon}</h3><div className="rdo-plan-subtitle">{HORIZONTE_LABEL[horizon]}</div><div className="rdo-task-list">{(plan[horizon] || []).length === 0 && <div className="rdo-task-empty">Sin tareas todavía.</div>}{(plan[horizon] || []).map((item) => <div className="rdo-task" key={item.id}><input type="checkbox" checked={item.done} onChange={() => toggle(horizon, item.id)} aria-label={`Completar ${item.text}`} data-testid={`checkbox-plan-${item.id}`} /><span className={`rdo-task-text ${item.done ? "done" : ""}`}>{item.text}</span><IconButton title="Eliminar tarea" testId={`button-delete-plan-${item.id}`} onClick={() => remove(horizon, item.id)}><X size={13} /></IconButton></div>)}</div><div className="rdo-task-add"><input className="rdo-control" placeholder="Nueva tarea" value={newPlanText[horizon]} onChange={(event) => setNewPlanText({ ...newPlanText, [horizon]: event.target.value })} onKeyDown={(event) => event.key === "Enter" && addItem(horizon)} data-testid={`input-plan-${horizon}`} /><button className="rdo-button primary" onClick={() => addItem(horizon)} aria-label={`Añadir tarea a día ${horizon}`} data-testid={`button-add-plan-${horizon}`}><Plus size={15} /></button></div></Panel>)}</div>
    </>
  );
}

function InsightsTab({ status, loading, error, onRun, running }) {
  if (loading && !status) return <div className="rdo-monitor-loading"><div className="rdo-loading-mark" /> Cargando insights...</div>;
  if (error) return <div className="rdo-monitor-error"><AlertTriangle size={15} /><div><strong>Error al cargar insights</strong><p style={{ margin: "4px 0 0" }}>{error}</p></div></div>;

  const analysis = status?.latest_analysis;

  return (
    <>
      <PageIntro eyebrow="INTELIGENCIA ARTIFICIAL" title="Insights IA" description="Síntesis automática de señales competitivas. Detecta oportunidades, riesgos y tendencias ocultas en el ruido del mercado." action={<button className="rdo-button primary" onClick={() => onRun()} disabled={running} data-testid="button-run-ai"><Sparkles size={14} /> {running ? "Analizando..." : "Ejecutar análisis"}</button>} />

      {!analysis ? (
        <EmptyState title="Sin análisis reciente" text="Ejecuta el primer análisis para descubrir patrones y oportunidades basadas en las últimas señales." />
      ) : (
        <>
          <div className="rdo-stat-grid" style={{ marginBottom: 24 }}>
            <Stat label="Hallazgos" value={analysis.findings?.length || 0} meta="detectados" icon={Sparkles} />
            <Stat label="Señales evaluadas" value={analysis.event_count || 0} meta="eventos recientes" icon={Activity} />
            <Stat label="Fuentes" value={analysis.source_evidence_count || 0} meta="con evidencia" icon={Search} />
            <Stat label="Estado" value={analysis.status === "success" ? "Completado" : analysis.status} meta={analysis.completed_at ? new Date(analysis.completed_at).toLocaleDateString() : ""} icon={CheckCircle2} />
          </div>

          <Panel style={{ marginBottom: 24 }}>
            <SectionHead index="RESUMEN" title="Lectura de IA" />
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "hsl(var(--ink))", margin: 0 }}>{analysis.summary}</p>
          </Panel>

          {analysis.findings && analysis.findings.length > 0 && (
            <div>
              <SectionHead index="HALLAZGOS" title="Descubrimientos clave" description="Evidencias con mayor impacto potencial." />
              {analysis.findings.map((finding) => (
                <div key={finding.id} className="rdo-ai-finding" data-testid={`finding-${finding.id}`}>
                  <div className="rdo-ai-finding-head">
                    <div>
                      <h4 className="rdo-ai-finding-title">{finding.title}</h4>
                      <div className="rdo-ai-finding-meta">
                        <Badge tone={finding.importance === "critical" ? "red" : finding.importance === "high" ? "amber" : finding.importance === "medium" ? "teal" : ""}>
                          Importancia {finding.importance}
                        </Badge>
                        <Badge>Confianza {finding.confidence}%</Badge>
                        <Badge>Relevancia {finding.relevance}%</Badge>
                        {finding.trend && <Badge tone="signal">Tendencia: {finding.trend}</Badge>}
                      </div>
                    </div>
                  </div>

                  <p style={{ fontSize: 12, margin: 0, color: "hsl(var(--ink-muted))", paddingBottom: 6 }}>{finding.summary}</p>

                  <div className="rdo-ai-finding-body">
                    <div className="rdo-ai-section">
                      <h5 className="rdo-ai-section-title">Razonamiento</h5>
                      <p className="rdo-ai-section-content">{finding.rationale}</p>
                    </div>
                    {finding.opportunity && (
                      <div className="rdo-ai-section" style={{ borderColor: "hsl(var(--teal-soft))", backgroundColor: "hsl(var(--teal) / .03)" }}>
                        <h5 className="rdo-ai-section-title" style={{ color: "hsl(var(--teal))" }}>Oportunidad</h5>
                        <p className="rdo-ai-section-content">{finding.opportunity}</p>
                      </div>
                    )}
                    {finding.risk && (
                      <div className="rdo-ai-section" style={{ borderColor: "hsl(7 65% 94%)", backgroundColor: "hsl(var(--red) / .03)" }}>
                        <h5 className="rdo-ai-section-title" style={{ color: "hsl(var(--red))" }}>Riesgo</h5>
                        <p className="rdo-ai-section-content">{finding.risk}</p>
                      </div>
                    )}
                  </div>

                  {finding.suggested_updates && finding.suggested_updates.length > 0 && (
                    <div className="rdo-ai-suggestions">
                      <span className="rdo-ai-section-title" style={{ display: "block", marginBottom: 8 }}>Actualizaciones propuestas (contexto)</span>
                      {finding.suggested_updates.map((update, idx) => (
                        <span key={idx} className="rdo-ai-suggestion-item">
                          {Object.entries(update).map(([k, v]) => `${k}: ${v}`).join(" | ")}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function AlertasTab({ alerts, loading, error, onMark, onRefresh }) {
  if (loading && !alerts.length) return <div className="rdo-monitor-loading"><div className="rdo-loading-mark" /> Cargando alertas...</div>;
  if (error) return <div className="rdo-monitor-error"><AlertTriangle size={15} /><div><strong>Error al cargar alertas</strong><p style={{ margin: "4px 0 0" }}>{error}</p></div></div>;

  const unreadCount = alerts.filter(a => a.status === "unread").length;

  return (
    <>
      <PageIntro eyebrow="VIGILANCIA ACTIVA" title="Alertas de mercado" description="Notificaciones críticas generadas por cambios bruscos en la actividad de competidores o nuevas tendencias." action={<button className="rdo-button secondary" onClick={onRefresh} data-testid="button-refresh-alerts"><RefreshCw size={14} /> Refrescar</button>} />

      <div className="rdo-history-toolbar">
        <div className="rdo-history-count"><strong>{unreadCount}</strong> alertas sin leer</div>
      </div>

      {!alerts.length ? (
        <EmptyState title="Todo despejado" text="No hay alertas registradas en el sistema en este momento." />
      ) : (
        <div style={{ marginTop: 16 }}>
          <div className="rdo-panel" style={{ padding: 0, overflow: "hidden" }}>
            {alerts.map((alert) => (
              <div key={alert.id} className={`rdo-ai-alert ${alert.status === "unread" ? "rdo-ai-alert-unread" : ""}`} data-testid={`alert-${alert.id}`}>
                <div className="rdo-ai-alert-content">
                  <h4 className="rdo-ai-alert-title">{alert.title}</h4>
                  <p className="rdo-ai-alert-desc">{alert.description}</p>
                  <div className="rdo-ai-alert-meta">
                    <span style={{ color: alert.importance === "critical" ? "hsl(var(--red))" : alert.importance === "high" ? "hsl(var(--amber))" : "inherit", fontWeight: 700 }}>
                      Importancia: {alert.importance}
                    </span>
                    <span>·</span>
                    <span>{new Date(alert.created_at).toLocaleString()}</span>
                    {alert.competitor_name && (
                      <>
                        <span>·</span>
                        <span>Competidor: {alert.competitor_name}</span>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  {alert.status === "unread" ? (
                    <button className="rdo-button secondary" style={{ fontSize: 11, minHeight: 28 }} onClick={() => onMark(alert.id, "read")} data-testid={`button-mark-read-${alert.id}`}>Marcar leída</button>
                  ) : (
                    <button className="rdo-button ghost" style={{ fontSize: 11, minHeight: 28 }} onClick={() => onMark(alert.id, "unread")} data-testid={`button-mark-unread-${alert.id}`}>Marcar no leída</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function HistorialIATab({ analyses, loading, error, onRefresh }) {
  if (loading && !analyses.length) return <div className="rdo-monitor-loading"><div className="rdo-loading-mark" /> Cargando historial...</div>;
  if (error) return <div className="rdo-monitor-error"><AlertTriangle size={15} /><div><strong>Error al cargar historial</strong><p style={{ margin: "4px 0 0" }}>{error}</p></div></div>;

  return (
    <>
      <PageIntro eyebrow="REGISTRO IA" title="Historial de análisis" description="Registro histórico de evaluaciones de inteligencia competitiva." action={<button className="rdo-button secondary" onClick={onRefresh} data-testid="button-refresh-ai-history"><RefreshCw size={14} /> Refrescar</button>} />

      {!analyses.length ? (
        <EmptyState title="Sin historial" text="Aún no se ha completado ningún análisis." />
      ) : (
        <div style={{ marginTop: 24 }}>
          {analyses.map((analysis) => (
            <div key={analysis.id} className="rdo-ai-history-card" data-testid={`analysis-${analysis.id}`}>
              <div className="rdo-ai-history-head">
                <h4 className="rdo-ai-history-title">Análisis {new Date(analysis.started_at).toLocaleDateString()}</h4>
                <Badge tone={analysis.status === "success" ? "teal" : analysis.status === "error" ? "red" : "amber"}>{analysis.status}</Badge>
              </div>
              <div className="rdo-ai-history-stats">
                <span><strong>Modelo:</strong> {analysis.model}</span>
                <span><strong>Gatillo:</strong> {analysis.trigger}</span>
                <span><strong>Eventos evaluados:</strong> {analysis.event_count}</span>
                <span><strong>Fuentes:</strong> {analysis.source_evidence_count}</span>
              </div>
              {analysis.summary && (
                <div className="rdo-ai-history-summary">
                  {analysis.summary}
                </div>
              )}
              {analysis.error_message && (
                <div className="rdo-ai-history-summary" style={{ backgroundColor: "hsl(var(--red) / .05)", color: "hsl(var(--red))" }}>
                  {analysis.error_message}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}