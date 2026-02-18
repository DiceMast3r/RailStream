/**
 * AlertDetailModal.jsx
 * Full-screen overlay with detailed information about a CRITICAL or HIGH alert.
 * Shown when an operator clicks an actionable alert in the AlertFeed.
 */
import React, { useEffect } from "react";
import {
  X, AlertTriangle, Train, Building2, MapPin,
  Clock, Activity, Gauge, Thermometer, Battery,
  Wind, Camera, Radio, ChevronRight,
} from "lucide-react";
import StatusBadge from "./StatusBadge";

// ─── Severity config ──────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  CRITICAL: {
    border:  "border-red-500",
    header:  "bg-red-950/70 border-b border-red-500/40",
    icon:    "text-red-400",
    badge:   "bg-red-600",
    glow:    "shadow-[0_0_40px_rgba(239,68,68,0.25)]",
    action:  "bg-red-600 hover:bg-red-500",
    label:   "CRITICAL ALERT",
  },
  HIGH: {
    border:  "border-orange-500",
    header:  "bg-orange-950/60 border-b border-orange-500/40",
    icon:    "text-orange-400",
    badge:   "bg-orange-500",
    glow:    "shadow-[0_0_40px_rgba(249,115,22,0.20)]",
    action:  "bg-orange-600 hover:bg-orange-500",
    label:   "HIGH PRIORITY ALERT",
  },
};

// ─── Component health icons ───────────────────────────────────────────────────

const COMP_ICONS = {
  doors:      <Activity size={14} />,
  brakes:     <Gauge    size={14} />,
  hvac:       <Wind     size={14} />,
  pantograph: <Activity size={14} />,
  traction:   <Activity size={14} />,
  battery:    <Battery  size={14} />,
  cctv:       <Camera   size={14} />,
  signalling: <Radio    size={14} />,
};

function compStateColor(state) {
  return state === "FAULT"   ? "text-red-400   bg-red-950/40   border-red-500/30"
       : state === "WARNING" ? "text-amber-400 bg-amber-950/30 border-amber-500/30"
       :                       "text-emerald-400 bg-emerald-950/20 border-emerald-500/20";
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AlertDetailModal({ alert, train, onClose }) {
  const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.HIGH;

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal panel */}
      <div
        className={`w-full max-w-lg rounded-2xl border ${cfg.border} ${cfg.glow}
          bg-gray-900 flex flex-col overflow-hidden animate-in`}
        style={{ maxHeight: "90vh" }}
      >

        {/* ── Header ── */}
        <div className={`flex items-start gap-3 px-5 py-4 ${cfg.header}`}>
          <AlertTriangle size={20} className={`${cfg.icon} mt-0.5 shrink-0 animate-pulse`} />
          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-extrabold tracking-widest ${cfg.icon} uppercase mb-0.5`}>
              {cfg.label}
            </p>
            <p className="text-white font-bold text-base leading-tight">{alert.message}</p>
            <p className="text-gray-400 text-xs mt-1">
              Code: <span className="font-mono text-gray-300">{alert.code}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors shrink-0 mt-0.5"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Train identity */}
          <Section title="Train Information">
            <InfoRow icon={<Train size={14} />}    label="Train ID"      value={alert.trainId} mono />
            {train?.series       && <InfoRow icon={<ChevronRight size={14} />} label="Series"       value={train.series} />}
            {train?.manufacturer && <InfoRow icon={<ChevronRight size={14} />} label="Manufacturer" value={train.manufacturer} />}
            <InfoRow icon={<Building2 size={14} />} label="Depot"        value={alert.depotName || alert.depotId} />
            {train?.currentStation && (
              <InfoRow icon={<MapPin size={14} />}  label="Last Station"  value={train.currentStation} />
            )}
            {train?.status && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 w-28 shrink-0">Operational Status</span>
                <StatusBadge status={train.status} small />
              </div>
            )}
            {train?.speed !== undefined && (
              <InfoRow icon={<Gauge size={14} />}   label="Speed"         value={`${train.speed} km/h`} />
            )}
          </Section>

          {/* Timing */}
          <Section title="Timing">
            <InfoRow
              icon={<Clock size={14} />}
              label="Alert Time"
              value={alert.timestamp
                ? new Date(alert.timestamp).toLocaleString("en-TH", {
                    hour: "2-digit", minute: "2-digit", second: "2-digit",
                    day: "2-digit",  month: "short",    year: "numeric",
                  })
                : "—"}
            />
          </Section>

          {/* Health overview */}
          {train?.healthScore !== undefined && (
            <Section title="Health Score">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2.5 rounded-full bg-gray-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      train.healthScore >= 80 ? "bg-emerald-500"
                      : train.healthScore >= 60 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${train.healthScore}%` }}
                  />
                </div>
                <span className={`text-sm font-bold ${
                  train.healthScore >= 80 ? "text-emerald-400"
                  : train.healthScore >= 60 ? "text-amber-400" : "text-red-400"
                }`}>
                  {train.healthScore}%
                </span>
              </div>
            </Section>
          )}

          {/* Component status */}
          {train?.components && (
            <Section title="Subsystem Status">
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(train.components).map(([name, comp]) => (
                  <div
                    key={name}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 border text-xs ${compStateColor(comp.state)}`}
                  >
                    <span className="shrink-0">{COMP_ICONS[name] || <Activity size={14} />}</span>
                    <span className="capitalize font-medium text-gray-300">{name}</span>
                    <span className="ml-auto font-semibold">{comp.state}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* All active alerts on this train */}
          {train?.alerts?.length > 0 && (
            <Section title={`All Active Alerts on ${alert.trainId}`}>
              <div className="space-y-1.5">
                {train.alerts.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-gray-800/60 px-2.5 py-2">
                    <AlertTriangle size={12} className={
                      a.severity === "CRITICAL" ? "text-red-400"
                      : a.severity === "HIGH"   ? "text-orange-400"
                      : "text-amber-400"
                    } />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusBadge status={a.severity} small />
                        <span className="font-mono text-[10px] text-gray-500">{a.code}</span>
                      </div>
                      <p className="text-xs text-gray-300 mt-0.5">{a.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Recommended actions */}
          <Section title="Recommended Action">
            <RecommendedAction code={alert.code} severity={alert.severity} />
          </Section>
        </div>

        {/* ── Footer actions ── */}
        <div className="px-5 py-3 border-t border-gray-800 flex gap-2">
          <button
            className={`flex-1 text-xs font-bold text-white py-2 rounded-lg transition-colors ${cfg.action}`}
            onClick={onClose}
          >
            Acknowledge Alert
          </button>
          <button
            className="px-4 text-xs font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            onClick={onClose}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helper sub-components ────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold tracking-widest text-gray-500 uppercase mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function InfoRow({ icon, label, value, mono = false }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-600 shrink-0">{icon}</span>
      <span className="text-gray-500 w-28 shrink-0">{label}</span>
      <span className={`text-gray-200 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// Maps alert codes to operator guidance
function RecommendedAction({ code, severity }) {
  const ACTIONS = {
    BRAKE_FAULT:          "Immediately withdraw train from service. Dispatch maintenance crew to inspect brake system. Do not allow passenger boarding.",
    PANTO_FAULT:          "Halt train at nearest station. Inspect pantograph contact strip and overhead line clearance. Require engineering sign-off before resuming.",
    ATP_FAULT:            "Switch to manual driving mode. Notify signalling control room. Reduce speed to 25 km/h maximum pending investigation.",
    DOOR_FAULT:           "Stop at next station. Inspect faulty car doors. Cordon off affected car if unable to resolve. Notify passengers.",
    TRACTION_OVERHEAT:    "Reduce speed. Increase inter-station dwell time to allow cooling. If temperature exceeds 130°C, withdraw from service.",
    HVAC_FAULT:           "Notify passengers of reduced comfort. Monitor cabin temperature. Withdraw from service if temperature exceeds 35°C.",
    BATTERY_LOW:          "Monitor voltage closely. Avoid depot shunting moves until battery is recharged or replaced.",
    CCTV_PARTIAL:         "Log incident. Dispatch technician at next maintenance window. Ensure security coverage from adjacent cameras.",
    SCHEDULED_MAINTENANCE:"Schedule depot entry at next available slot. Coordinate with depot controller for bay allocation.",
  };

  const text = ACTIONS[code] || (
    severity === "CRITICAL"
      ? "Withdraw train from service immediately. Contact duty engineer."
      : "Investigate at next maintenance opportunity. Log in CMMS."
  );

  return (
    <p className="text-xs text-gray-300 leading-relaxed bg-gray-800/50 rounded-lg px-3 py-2.5 border border-gray-700/50">
      {text}
    </p>
  );
}
