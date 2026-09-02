import { useState, useEffect } from "react";
import { fetchRadarAlertPreferences, saveRadarAlertPreferences } from "../data/radarApi";
import { Settings, Check, Bell, RefreshCw } from "lucide-react";
import type { RadarAlertPreferences, RadarAlertPreferencesUpdate, RadarAlertPreferencesMinimumImportance } from "@workspace/api-client-react";

export default function AlertasPreferences() {
  const [prefs, setPrefs] = useState<RadarAlertPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchRadarAlertPreferences();
      setPrefs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando preferencias");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!prefs) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const data = await saveRadarAlertPreferences({
        enabled: prefs.enabled,
        minimum_importance: prefs.minimum_importance as unknown as RadarAlertPreferencesUpdate['minimum_importance'],
        minimum_relevance: prefs.minimum_relevance,
        minimum_confidence: prefs.minimum_confidence,
        internal_enabled: prefs.internal_enabled
      });
      setPrefs(data);
      setMessage("Preferencias guardadas");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando preferencias");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-500 py-4">Cargando preferencias...</div>;
  if (!prefs) return null;

  return (
    <div className="rdo-panel rdo-panel-pad" style={{ marginBottom: "24px" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="rdo-section-title flex items-center gap-2">
          <Settings size={16} className="text-gray-500" /> Preferencias de Alertas
        </h3>
        {message && <span className="text-xs text-green-600 font-bold flex items-center gap-1"><Check size={12}/> {message}</span>}
      </div>

      <div className="rdo-form-grid three">
        <label className="rdo-field">
          <span className="rdo-field-label">Alertas de IA</span>
          <div className="flex items-center gap-2 mt-2">
            <input 
              type="checkbox" 
              checked={prefs.enabled} 
              onChange={(e) => setPrefs({...prefs, enabled: e.target.checked})}
              className="w-4 h-4 text-blue-600 bg-gray-100 rounded border-gray-300 focus:ring-blue-500"
            />
            <span className="text-sm">Activar generación</span>
          </div>
        </label>
        <label className="rdo-field">
          <span className="rdo-field-label">Notificaciones Internas</span>
          <div className="flex items-center gap-2 mt-2">
            <input 
              type="checkbox" 
              checked={prefs.internal_enabled} 
              onChange={(e) => setPrefs({...prefs, internal_enabled: e.target.checked})}
              className="w-4 h-4 text-blue-600 bg-gray-100 rounded border-gray-300 focus:ring-blue-500"
            />
            <span className="text-sm">Enviar alertas</span>
          </div>
        </label>
        <label className="rdo-field">
          <span className="rdo-field-label">Importancia mínima</span>
          <select 
            className="rdo-control"
            value={prefs.minimum_importance}
            onChange={(e) => setPrefs({...prefs, minimum_importance: e.target.value as RadarAlertPreferencesMinimumImportance})}
          >
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
        </label>
        <label className="rdo-field">
          <span className="rdo-field-label">Relevancia mínima (%)</span>
          <input 
            type="number" 
            className="rdo-control" 
            min="0" max="100"
            value={prefs.minimum_relevance}
            onChange={(e) => setPrefs({...prefs, minimum_relevance: parseInt(e.target.value, 10) || 0})}
          />
        </label>
        <label className="rdo-field">
          <span className="rdo-field-label">Confianza mínima (%)</span>
          <input 
            type="number" 
            className="rdo-control" 
            min="0" max="100"
            value={prefs.minimum_confidence}
            onChange={(e) => setPrefs({...prefs, minimum_confidence: parseInt(e.target.value, 10) || 0})}
          />
        </label>
      </div>
      
      {error && <div className="rdo-monitor-error mt-4">{error}</div>}
      
      <div className="rdo-form-actions mt-4 border-t pt-4 border-gray-100">
        <button className="rdo-button primary" onClick={() => void handleSave()} disabled={saving}>
          {saving ? <RefreshCw size={14} className="rdo-spin" /> : <Check size={14} />} Guardar configuración
        </button>
      </div>
    </div>
  );
}

