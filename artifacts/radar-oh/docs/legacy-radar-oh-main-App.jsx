import { useState, useEffect, useMemo } from "react";
import {
  Radar,
  Search,
  Building2,
  Tags,
  ListChecks,
  Plus,
  Trash2,
  X,
  Loader2,
  MapPin,
  Globe,
  ChevronDown,
} from "lucide-react";

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

const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

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
  } catch (e) {
    console.error("No se pudo guardar", key, e);
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
const emptySource = () => ({ id: uid(), termino: "", tipo: TIPOS_FUENTE[0], frecuencia: FRECUENCIAS[0], notas: "" });
const emptyKeyword = () => ({ id: uid(), termino: "", volumen: "Medio", posicion: "", notas: "" });

export default function RadarOH() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("resumen");
  const [sources, setSources] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [plan, setPlan] = useState({ "30": [], "60": [], "90": [] });
  const [expandedCompetitor, setExpandedCompetitor] = useState(null);
  const [addingSource, setAddingSource] = useState(false);
  const [addingKeyword, setAddingKeyword] = useState(false);
  const [newPlanText, setNewPlanText] = useState({ "30": "", "60": "", "90": "" });

  useEffect(() => {
    (async () => {
      const [s, c, k, p] = await Promise.all([
        loadKey(KEYS.sources),
        loadKey(KEYS.competitors),
        loadKey(KEYS.keywords),
        loadKey(KEYS.plan),
      ]);
      if (s) setSources(s);
      if (c) setCompetitors(c);
      if (k) setKeywords(k);
      if (p) setPlan(p);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!loading) saveKey(KEYS.sources, sources);
  }, [sources, loading]);
  useEffect(() => {
    if (!loading) saveKey(KEYS.competitors, competitors);
  }, [competitors, loading]);
  useEffect(() => {
    if (!loading) saveKey(KEYS.keywords, keywords);
  }, [keywords, loading]);
  useEffect(() => {
    if (!loading) saveKey(KEYS.plan, plan);
  }, [plan, loading]);

  const planTotal = HORIZONTES.reduce((n, h) => n + plan[h].length, 0);
  const planDone = HORIZONTES.reduce((n, h) => n + plan[h].filter((i) => i.done).length, 0);
  const revisados = competitors.filter((c) => c.estado === "revisado").length;

  const today = useMemo(
    () => new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }),
    []
  );

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <FontImport />
        <Loader2 className="animate-spin" size={28} color="#7FA5C9" />
        <span style={{ fontFamily: "'Public Sans', sans-serif", color: "#B9CEE0", marginTop: 12 }}>
          Cargando RADAR OH…
        </span>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <FontImport />
      <div style={styles.gridOverlay} />

      <header style={styles.titleBlock}>
        <div style={styles.titleBlockLeft}>
          <div style={styles.eyebrowRow}>
            <Radar size={18} color="#E2622B" strokeWidth={2.2} />
            <span style={styles.projectLabel}>OH CASAS MODULARES</span>
          </div>
          <h1 style={styles.h1}>RADAR OH</h1>
          <p style={styles.subtitle}>Vigilancia de competencia e inteligencia de sector</p>
        </div>
        <div style={styles.titleBlockRight}>
          <TitleField label="Hoja" value="Día 3 · v1" />
          <TitleField label="Fecha" value={today} />
          <TitleField label="Responsable" value="Ainhoa López Perelló" />
        </div>
      </header>

      <nav style={styles.nav}>
        <TabButton icon={Radar} label="Resumen" active={tab === "resumen"} onClick={() => setTab("resumen")} />
        <TabButton icon={Search} label="Fuentes" active={tab === "fuentes"} onClick={() => setTab("fuentes")} />
        <TabButton
          icon={Building2}
          label="Competidores"
          active={tab === "competidores"}
          onClick={() => setTab("competidores")}
        />
        <TabButton icon={Tags} label="Keywords" active={tab === "keywords"} onClick={() => setTab("keywords")} />
        <TabButton icon={ListChecks} label="Plan 30-60-90" active={tab === "plan"} onClick={() => setTab("plan")} />
      </nav>

      <main style={styles.sheet}>
        {tab === "resumen" && (
          <ResumenTab
            sources={sources}
            competitors={competitors}
            keywords={keywords}
            revisados={revisados}
            planDone={planDone}
            planTotal={planTotal}
            onJump={(id) => {
              setTab("competidores");
              setExpandedCompetitor(id);
            }}
          />
        )}

        {tab === "fuentes" && (
          <FuentesTab
            sources={sources}
            setSources={setSources}
            adding={addingSource}
            setAdding={setAddingSource}
          />
        )}

        {tab === "competidores" && (
          <CompetidoresTab
            competitors={competitors}
            setCompetitors={setCompetitors}
            expandedId={expandedCompetitor}
            setExpandedId={setExpandedCompetitor}
          />
        )}

        {tab === "keywords" && (
          <KeywordsTab
            keywords={keywords}
            setKeywords={setKeywords}
            adding={addingKeyword}
            setAdding={setAddingKeyword}
          />
        )}

        {tab === "plan" && (
          <PlanTab plan={plan} setPlan={setPlan} newPlanText={newPlanText} setNewPlanText={setNewPlanText} />
        )}
      </main>
    </div>
  );
}

/* ---------- piezas compartidas ---------- */

function FontImport() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Public+Sans:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }
      @keyframes sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) {
        .radar-sweep { animation: none !important; }
      }
      .rdo-input {
        font-family: 'Public Sans', sans-serif;
        background: #FFFFFF;
        border: 1px solid rgba(23,36,47,0.25);
        border-radius: 3px;
        padding: 8px 10px;
        font-size: 13.5px;
        color: #17242F;
        width: 100%;
      }
      .rdo-input:focus { outline: 2px solid #E2622B; outline-offset: 1px; }
      .rdo-select {
        font-family: 'Public Sans', sans-serif;
        background: #FFFFFF;
        border: 1px solid rgba(23,36,47,0.25);
        border-radius: 3px;
        padding: 8px 10px;
        font-size: 13.5px;
        color: #17242F;
      }
      .rdo-textarea {
        font-family: 'Public Sans', sans-serif;
        background: #FFFFFF;
        border: 1px solid rgba(23,36,47,0.25);
        border-radius: 3px;
        padding: 8px 10px;
        font-size: 13.5px;
        color: #17242F;
        width: 100%;
        min-height: 56px;
        resize: vertical;
      }
      .rdo-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
      .rdo-scroll::-webkit-scrollbar-thumb { background: rgba(23,36,47,0.2); border-radius: 3px; }
    `}</style>
  );
}

function TitleField({ label, value }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: 10.5, letterSpacing: "0.03em", color: "#7FA5C9" }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: 13, color: "#EDEEF0", fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}

function TabButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "10px 16px",
        border: "none",
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
        background: active ? "#F3EFE4" : "transparent",
        color: active ? "#17242F" : "#9FB8CE",
        fontFamily: "'Public Sans', sans-serif",
        fontSize: 13.5,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <Icon size={15} strokeWidth={2.2} />
      {label}
    </button>
  );
}

function Sheet({ children, style }) {
  return (
    <div
      style={{
        position: "relative",
        background: "#FFFFFF",
        border: "1px solid rgba(23,36,47,0.14)",
        borderRadius: 4,
        padding: 16,
        ...style,
      }}
    >
      <CornerTicks />
      {children}
    </div>
  );
}

function CornerTicks() {
  const base = { position: "absolute", width: 9, height: 9, borderColor: "#E2622B" };
  return (
    <>
      <span style={{ ...base, top: -1, left: -1, borderTop: "2px solid #E2622B", borderLeft: "2px solid #E2622B" }} />
      <span
        style={{ ...base, bottom: -1, right: -1, borderBottom: "2px solid #E2622B", borderRight: "2px solid #E2622B" }}
      />
    </>
  );
}

function SectionHeading({ title, description, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
      <div>
        <h2 style={styles.h2}>{title}</h2>
        {description && <p style={styles.sectionDesc}>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function AddButton({ onClick, label }) {
  return (
    <button onClick={onClick} style={styles.addButton}>
      <Plus size={15} strokeWidth={2.4} />
      {label}
    </button>
  );
}

function IconGhostButton({ onClick, children, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        border: "none",
        background: "transparent",
        color: "#8A5A46",
        cursor: "pointer",
        padding: 4,
        display: "flex",
        alignItems: "center",
      }}
    >
      {children}
    </button>
  );
}

/* ---------- Resumen ---------- */

function ResumenTab({ sources, competitors, keywords, revisados, planDone, planTotal, onJump }) {
  const maxR = 118;
  const cx = 140;
  const cy = 140;
  const radiusFor = (p) => (p === "alta" ? maxR * 0.32 : p === "media" ? maxR * 0.62 : maxR * 0.92);
  const colorFor = (p) => (p === "alta" ? "#C1462F" : p === "media" ? "#D8A23D" : "#5C8A66");

  const points = competitors.map((c, i) => {
    const angle = (i / Math.max(competitors.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const r = radiusFor(c.prioridad);
    return {
      ...c,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      color: colorFor(c.prioridad),
    };
  });

  return (
    <div>
      <SectionHeading
        title="Objetivo del día 3"
        description="Configurar el primer listado de vigilancia, mapear 10–15 competidores de casas modulares, definir palabras clave y dejar lista una base para el informe 30-60-90."
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 300px) 1fr", gap: 20 }} className="rdo-grid-resumen">
        <style>{`
          @media (max-width: 720px) {
            .rdo-grid-resumen { grid-template-columns: 1fr !important; }
          }
        `}</style>

        <Sheet style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 20 }}>
          <div style={{ position: "relative", width: 280, height: 280, maxWidth: "100%" }}>
            <svg viewBox="0 0 280 280" width="100%" height="100%">
              {[0.32, 0.62, 0.92].map((f) => (
                <circle key={f} cx={cx} cy={cy} r={maxR * f} fill="none" stroke="rgba(23,36,47,0.14)" strokeWidth="1" />
              ))}
              <line x1={cx} y1={20} x2={cx} y2={260} stroke="rgba(23,36,47,0.08)" strokeWidth="1" />
              <line x1={20} y1={cy} x2={260} y2={cy} stroke="rgba(23,36,47,0.08)" strokeWidth="1" />
              {points.map((p) => (
                <circle
                  key={p.id}
                  cx={p.x}
                  cy={p.y}
                  r={5}
                  fill={p.color}
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                  style={{ cursor: "pointer" }}
                  onClick={() => onJump(p.id)}
                >
                  <title>{p.nombre || "Sin nombre"}</title>
                </circle>
              ))}
            </svg>
            <div
              className="radar-sweep"
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: "conic-gradient(from 0deg, rgba(226,98,43,0.28), transparent 28%)",
                animation: "sweep 6s linear infinite",
                pointerEvents: "none",
                mixBlendMode: "multiply",
              }}
            />
          </div>
          <p style={{ fontFamily: "'Public Sans', sans-serif", fontSize: 12, color: "#5B6A73", textAlign: "center", marginTop: 6 }}>
            Cada punto es un competidor, situado por prioridad de vigilancia. Toca uno para abrir su ficha.
          </p>
          <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <Legend color="#C1462F" label="Prioridad alta" />
            <Legend color="#D8A23D" label="Prioridad media" />
            <Legend color="#5C8A66" label="Prioridad baja" />
          </div>
        </Sheet>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <StatCard label="Fuentes configuradas" value={sources.length} hint="búsquedas y canales a vigilar" />
          <StatCard
            label="Competidores mapeados"
            value={`${competitors.length} / ${TARGET_COMPETITORS}`}
            hint={`${revisados} con ficha revisada`}
          />
          <StatCard label="Keywords con línea base" value={keywords.filter((k) => k.posicion !== "").length} hint={`de ${keywords.length} definidas`} />
          <StatCard label="Plan 30-60-90" value={planTotal ? `${planDone}/${planTotal}` : "—"} hint="tareas completadas" />
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: 11.5, color: "#5B6A73" }}>{label}</span>
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <Sheet style={{ padding: 16 }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, color: "#17242F" }}>{value}</div>
      <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: 12.5, color: "#3A4A54", fontWeight: 600, marginTop: 2 }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: 11.5, color: "#8A9AA4", marginTop: 2 }}>{hint}</div>
    </Sheet>
  );
}

/* ---------- Fuentes ---------- */

function FuentesTab({ sources, setSources, adding, setAdding }) {
  const [draft, setDraft] = useState(emptySource());

  const save = () => {
    if (!draft.termino.trim()) return;
    setSources([...sources, draft]);
    setDraft(emptySource());
    setAdding(false);
  };

  const grouped = TIPOS_FUENTE.map((tipo) => ({ tipo, items: sources.filter((s) => s.tipo === tipo) }));

  return (
    <div>
      <SectionHeading
        title="Fuentes y búsquedas a vigilar"
        description="El listado inicial de términos, canales y frecuencia con los que se seguirá a OH Casas y a la competencia."
        action={!adding && <AddButton onClick={() => setAdding(true)} label="Añadir fuente" />}
      />

      {adding && (
        <Sheet style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }} className="rdo-form-3col">
            <style>{`@media (max-width:640px){ .rdo-form-3col{ grid-template-columns:1fr !important; } }`}</style>
            <input
              className="rdo-input"
              placeholder="Término o búsqueda a vigilar"
              value={draft.termino}
              onChange={(e) => setDraft({ ...draft, termino: e.target.value })}
              autoFocus
            />
            <select className="rdo-select" value={draft.tipo} onChange={(e) => setDraft({ ...draft, tipo: e.target.value })}>
              {TIPOS_FUENTE.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select className="rdo-select" value={draft.frecuencia} onChange={(e) => setDraft({ ...draft, frecuencia: e.target.value })}>
              {FRECUENCIAS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
          <textarea
            className="rdo-textarea"
            placeholder="Notas (opcional)"
            style={{ marginTop: 10 }}
            value={draft.notas}
            onChange={(e) => setDraft({ ...draft, notas: e.target.value })}
          />
          <FormActions
            onCancel={() => {
              setAdding(false);
              setDraft(emptySource());
            }}
            onSave={save}
          />
        </Sheet>
      )}

      {sources.length === 0 && !adding && (
        <EmptyState text="Todavía no hay fuentes configuradas. Añade la primera búsqueda o canal que quieras vigilar." />
      )}

      {grouped
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <div key={g.tipo} style={{ marginBottom: 18 }}>
            <div style={styles.groupLabel}>{g.tipo}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {g.items.map((s) => (
                <div key={s.id} style={styles.row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: 13.5, color: "#17242F", fontWeight: 600 }}>
                      {s.termino}
                    </div>
                    {s.notas && <div style={styles.rowNote}>{s.notas}</div>}
                  </div>
                  <span style={styles.pill}>{s.frecuencia}</span>
                  <IconGhostButton title="Eliminar" onClick={() => setSources(sources.filter((x) => x.id !== s.id))}>
                    <Trash2 size={15} />
                  </IconGhostButton>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

function FormActions({ onCancel, onSave, saveLabel = "Guardar" }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
      <button onClick={onCancel} style={styles.ghostAction}>
        Cancelar
      </button>
      <button onClick={onSave} style={styles.primaryAction}>
        {saveLabel}
      </button>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div
      style={{
        border: "1px dashed rgba(23,36,47,0.25)",
        borderRadius: 4,
        padding: "26px 18px",
        textAlign: "center",
        fontFamily: "'Public Sans', sans-serif",
        fontSize: 13,
        color: "#6D7B84",
      }}
    >
      {text}
    </div>
  );
}

/* ---------- Competidores ---------- */

function CompetidoresTab({ competitors, setCompetitors, expandedId, setExpandedId }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyCompetitor());

  const startAdd = () => {
    setDraft(emptyCompetitor());
    setAdding(true);
  };
  const saveNew = () => {
    if (!draft.nombre.trim()) return;
    setCompetitors([...competitors, draft]);
    setAdding(false);
  };
  const update = (id, patch) => setCompetitors(competitors.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id) => {
    setCompetitors(competitors.filter((c) => c.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  return (
    <div>
      <SectionHeading
        title="Ficha de competidores"
        description={`Empresas de casas modulares a seguir. Objetivo inicial: ${TARGET_COMPETITORS} fichas.`}
        action={!adding && <AddButton onClick={startAdd} label="Añadir competidor" />}
      />

      {adding && (
        <Sheet style={{ marginBottom: 16 }}>
          <CompetitorForm draft={draft} setDraft={setDraft} />
          <FormActions onCancel={() => setAdding(false)} onSave={saveNew} saveLabel="Añadir a RADAR OH" />
        </Sheet>
      )}

      {competitors.length === 0 && !adding && (
        <EmptyState text="Aún no hay competidores mapeados. Añade la primera empresa de casas modulares a seguir." />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="rdo-comp-grid">
        <style>{`@media (max-width:760px){ .rdo-comp-grid{ grid-template-columns:1fr !important; } }`}</style>
        {competitors.map((c) => (
          <CompetitorCard
            key={c.id}
            c={c}
            expanded={expandedId === c.id}
            onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
            onUpdate={(patch) => update(c.id, patch)}
            onRemove={() => remove(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CompetitorCard({ c, expanded, onToggle, onUpdate, onRemove }) {
  const prioColor = c.prioridad === "alta" ? "#C1462F" : c.prioridad === "media" ? "#D8A23D" : "#5C8A66";
  return (
    <Sheet style={{ padding: 0, overflow: "hidden" }}>
      <div
        onClick={onToggle}
        style={{ padding: 14, cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10 }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: prioColor, marginTop: 6, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15.5, fontWeight: 600, color: "#17242F" }}>
              {c.nombre || "Sin nombre"}
            </span>
            <span style={{ ...styles.pill, background: c.estado === "revisado" ? "#E6EEE4" : "#F3EAD9", color: c.estado === "revisado" ? "#4A6B4F" : "#8A5A22" }}>
              {c.estado === "revisado" ? "Revisado" : "Pendiente"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
            {c.ubicacion && (
              <span style={styles.metaLine}>
                <MapPin size={12} /> {c.ubicacion}
              </span>
            )}
            {c.especialidad && <span style={styles.metaLine}>{c.especialidad}</span>}
          </div>
        </div>
        <ChevronDown size={17} color="#8A9AA4" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
      </div>

      {expanded && (
        <div style={{ padding: 14, borderTop: "1px solid rgba(23,36,47,0.1)" }}>
          <CompetitorForm draft={c} setDraft={(next) => onUpdate(typeof next === "function" ? next(c) : next)} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <button onClick={onRemove} style={{ ...styles.ghostAction, color: "#B14A2E" }}>
              <Trash2 size={14} style={{ marginRight: 5, verticalAlign: -2 }} />
              Eliminar
            </button>
            <button
              onClick={() => onUpdate({ estado: c.estado === "revisado" ? "pendiente" : "revisado" })}
              style={styles.primaryAction}
            >
              {c.estado === "revisado" ? "Marcar como pendiente" : "Marcar como revisado"}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function CompetitorForm({ draft, setDraft }) {
  const field = (key) => ({
    value: draft[key],
    onChange: (e) => setDraft({ ...draft, [key]: e.target.value }),
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }} className="rdo-form-2col">
        <style>{`@media (max-width:520px){ .rdo-form-2col{ grid-template-columns:1fr !important; } }`}</style>
        <input className="rdo-input" placeholder="Nombre de la empresa" {...field("nombre")} />
        <select className="rdo-select" value={draft.prioridad} onChange={(e) => setDraft({ ...draft, prioridad: e.target.value })}>
          {PRIORIDADES.map((p) => (
            <option key={p} value={p}>
              Prioridad {p}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="rdo-form-2col-b">
        <style>{`@media (max-width:520px){ .rdo-form-2col-b{ grid-template-columns:1fr !important; } }`}</style>
        <input className="rdo-input" placeholder="Ubicación" {...field("ubicacion")} />
        <input className="rdo-input" placeholder="Especialidad / tipología" {...field("especialidad")} />
        <input className="rdo-input" placeholder="Rango de precio orientativo" {...field("rango_precio")} />
        <input className="rdo-input" placeholder="Web" {...field("web")} />
      </div>
      <input className="rdo-input" placeholder="Redes sociales (perfiles principales)" {...field("redes")} />
      <textarea className="rdo-textarea" placeholder="Fortalezas" {...field("fortalezas")} />
      <textarea className="rdo-textarea" placeholder="Debilidades" {...field("debilidades")} />
      <textarea className="rdo-textarea" placeholder="Notas" {...field("notas")} />
    </div>
  );
}

/* ---------- Keywords ---------- */

function KeywordsTab({ keywords, setKeywords, adding, setAdding }) {
  const [draft, setDraft] = useState(emptyKeyword());

  const save = () => {
    if (!draft.termino.trim()) return;
    setKeywords([...keywords, draft]);
    setDraft(emptyKeyword());
    setAdding(false);
  };
  const update = (id, patch) => setKeywords(keywords.map((k) => (k.id === id ? { ...k, ...patch } : k)));

  return (
    <div>
      <SectionHeading
        title="Palabras clave y línea base"
        description="Términos estratégicos a vigilar, con la posición comprobada manualmente como punto de partida."
        action={!adding && <AddButton onClick={() => setAdding(true)} label="Añadir keyword" />}
      />

      {adding && (
        <Sheet style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }} className="rdo-form-3col">
            <style>{`@media (max-width:640px){ .rdo-form-3col{ grid-template-columns:1fr !important; } }`}</style>
            <input
              className="rdo-input"
              placeholder="Palabra clave"
              value={draft.termino}
              onChange={(e) => setDraft({ ...draft, termino: e.target.value })}
              autoFocus
            />
            <select className="rdo-select" value={draft.volumen} onChange={(e) => setDraft({ ...draft, volumen: e.target.value })}>
              {VOLUMENES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <input
              className="rdo-input"
              placeholder="Posición base"
              value={draft.posicion}
              onChange={(e) => setDraft({ ...draft, posicion: e.target.value })}
            />
          </div>
          <FormActions onCancel={() => setAdding(false)} onSave={save} />
        </Sheet>
      )}

      {keywords.length === 0 && !adding && (
        <EmptyState text="Todavía no hay keywords definidas. Añade la primera palabra clave estratégica." />
      )}

      {keywords.length > 0 && (
        <div className="rdo-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
            <thead>
              <tr>
                {["Palabra clave", "Volumen", "Posición base", ""].map((h) => (
                  <th key={h} style={styles.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keywords.map((k) => (
                <tr key={k.id} style={{ borderTop: "1px solid rgba(23,36,47,0.08)" }}>
                  <td style={styles.td}>{k.termino}</td>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.pill,
                        background: k.volumen === "Alto" ? "#F3E4DE" : k.volumen === "Medio" ? "#F3EAD9" : "#EAEEE9",
                        color: k.volumen === "Alto" ? "#B14A2E" : k.volumen === "Medio" ? "#8A5A22" : "#5B6A73",
                      }}
                    >
                      {k.volumen}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <input
                      className="rdo-input"
                      style={{ width: 64, padding: "5px 8px" }}
                      value={k.posicion}
                      placeholder="—"
                      onChange={(e) => update(k.id, { posicion: e.target.value })}
                    />
                  </td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    <IconGhostButton title="Eliminar" onClick={() => setKeywords(keywords.filter((x) => x.id !== k.id))}>
                      <Trash2 size={15} />
                    </IconGhostButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- Plan 30-60-90 ---------- */

function PlanTab({ plan, setPlan, newPlanText, setNewPlanText }) {
  const addItem = (h) => {
    const text = newPlanText[h].trim();
    if (!text) return;
    setPlan({ ...plan, [h]: [...plan[h], { id: uid(), text, done: false }] });
    setNewPlanText({ ...newPlanText, [h]: "" });
  };
  const toggle = (h, id) =>
    setPlan({ ...plan, [h]: plan[h].map((i) => (i.id === id ? { ...i, done: !i.done } : i)) });
  const remove = (h, id) => setPlan({ ...plan, [h]: plan[h].filter((i) => i.id !== id) });

  return (
    <div>
      <SectionHeading
        title="Plan de situación 30-60-90"
        description="El informe entregable del día 3: qué se hará en cada horizonte de tiempo tras el diagnóstico inicial."
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }} className="rdo-plan-grid">
        <style>{`@media (max-width:760px){ .rdo-plan-grid{ grid-template-columns:1fr !important; } }`}</style>
        {HORIZONTES.map((h) => (
          <Sheet key={h}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, color: "#17242F" }}>
              Día {h}
            </div>
            <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: 12, color: "#8A9AA4", marginBottom: 12 }}>
              {HORIZONTE_LABEL[h]}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {plan[h].length === 0 && (
                <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: 12.5, color: "#A6AFB4" }}>
                  Sin tareas todavía.
                </span>
              )}
              {plan[h].map((item) => (
                <label key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={item.done} onChange={() => toggle(h, item.id)} style={{ marginTop: 3 }} />
                  <span
                    style={{
                      flex: 1,
                      fontFamily: "'Public Sans', sans-serif",
                      fontSize: 13,
                      color: item.done ? "#A6AFB4" : "#17242F",
                      textDecoration: item.done ? "line-through" : "none",
                    }}
                  >
                    {item.text}
                  </span>
                  <IconGhostButton title="Eliminar" onClick={() => remove(h, item.id)}>
                    <X size={13} />
                  </IconGhostButton>
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className="rdo-input"
                placeholder="Nueva tarea"
                value={newPlanText[h]}
                onChange={(e) => setNewPlanText({ ...newPlanText, [h]: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addItem(h)}
              />
              <button onClick={() => addItem(h)} style={{ ...styles.primaryAction, padding: "8px 10px" }}>
                <Plus size={15} />
              </button>
            </div>
          </Sheet>
        ))}
      </div>
    </div>
  );
}

/* ---------- estilos base ---------- */

const styles = {
  app: {
    position: "relative",
    minHeight: "100vh",
    background: "#14283F",
    padding: "18px 18px 40px",
    fontFamily: "'Public Sans', sans-serif",
  },
  loadingScreen: {
    minHeight: "100vh",
    background: "#14283F",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  gridOverlay: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    backgroundImage:
      "linear-gradient(rgba(127,165,201,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(127,165,201,0.07) 1px, transparent 1px)",
    backgroundSize: "28px 28px",
  },
  titleBlock: {
    position: "relative",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 16,
    borderBottom: "2px solid #E2622B",
    paddingBottom: 14,
    marginBottom: 16,
    maxWidth: 1080,
    marginLeft: "auto",
    marginRight: "auto",
  },
  titleBlockLeft: {},
  titleBlockRight: { display: "flex", gap: 22, flexWrap: "wrap" },
  eyebrowRow: { display: "flex", alignItems: "center", gap: 7, marginBottom: 4 },
  projectLabel: { fontFamily: "'Public Sans', sans-serif", fontSize: 11.5, letterSpacing: "0.04em", color: "#B9CEE0" },
  h1: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 30, fontWeight: 700, color: "#F5F6F2", margin: "2px 0" },
  subtitle: { fontFamily: "'Public Sans', sans-serif", fontSize: 13.5, color: "#8FA8BE", margin: 0 },
  h2: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 19, fontWeight: 600, color: "#17242F", margin: 0 },
  sectionDesc: { fontFamily: "'Public Sans', sans-serif", fontSize: 13, color: "#5B6A73", margin: "4px 0 0", maxWidth: 520 },
  nav: {
    display: "flex",
    gap: 2,
    maxWidth: 1080,
    margin: "0 auto",
    overflowX: "auto",
    paddingLeft: 4,
  },
  sheet: {
    position: "relative",
    background: "#F3EFE4",
    maxWidth: 1080,
    margin: "0 auto",
    borderRadius: "0 6px 6px 6px",
    padding: 22,
    boxShadow: "0 18px 40px rgba(6,14,24,0.35)",
  },
  addButton: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#E2622B",
    color: "#FFF8F2",
    border: "none",
    borderRadius: 4,
    padding: "9px 14px",
    fontFamily: "'Public Sans', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
  },
  primaryAction: {
    background: "#17242F",
    color: "#F5F6F2",
    border: "none",
    borderRadius: 3,
    padding: "8px 14px",
    fontFamily: "'Public Sans', sans-serif",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostAction: {
    background: "transparent",
    border: "1px solid rgba(23,36,47,0.25)",
    color: "#3A4A54",
    borderRadius: 3,
    padding: "8px 14px",
    fontFamily: "'Public Sans', sans-serif",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  groupLabel: {
    fontFamily: "'Public Sans', sans-serif",
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.03em",
    color: "#8A9AA4",
    marginBottom: 8,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#FFFFFF",
    border: "1px solid rgba(23,36,47,0.1)",
    borderRadius: 4,
    padding: "10px 12px",
  },
  rowNote: { fontFamily: "'Public Sans', sans-serif", fontSize: 12, color: "#8A9AA4", marginTop: 2 },
  pill: {
    fontFamily: "'Public Sans', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    background: "#EAEEE9",
    color: "#5B6A73",
    borderRadius: 20,
    padding: "3px 9px",
    whiteSpace: "nowrap",
  },
  metaLine: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontFamily: "'Public Sans', sans-serif",
    fontSize: 12,
    color: "#6D7B84",
  },
  th: {
    textAlign: "left",
    fontFamily: "'Public Sans', sans-serif",
    fontSize: 11.5,
    letterSpacing: "0.03em",
    color: "#8A9AA4",
    padding: "0 10px 8px",
  },
  td: {
    padding: "10px",
    fontFamily: "'Public Sans', sans-serif",
    fontSize: 13,
    color: "#17242F",
  },
};