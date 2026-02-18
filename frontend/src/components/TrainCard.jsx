/**
 * TrainCard.jsx
 * Compact card showing a single train's real-time telemetry.
 * Clicking the card expands to show component-level details.
 */
import React, { useState } from "react";
import {
  Train, Gauge, Thermometer, Battery, Wind,
  Activity, Radio, Camera, AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import StatusBadge from "./StatusBadge";
import HealthBar   from "./HealthBar";

//  ─── Component icons ─────────────────────────────────────────────────────────

const COMPONENT_ICONS = {
  doors:      <Train   size={12} />,
  brakes:     <Gauge   size={12} />,
  hvac:       <Wind    size={12} />,
  pantograph: <Activity size={12} />,
  traction:   <Activity size={12} />,
  battery:    <Battery size={12} />,
  cctv:       <Camera  size={12} />,
  signalling: <Radio   size={12} />,
};

function stateColor(state) {
  return state === "FAULT"   ? "text-red-400"
       : state === "WARNING" ? "text-amber-400"
       :                       "text-emerald-400";
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrainCard({ train }) {
  const [expanded, setExpanded] = useState(false);

  const { trainId, series, manufacturer, status, speed, currentStation,
          healthScore, components, alerts, odometer } = train;
  const hasAlerts = alerts && alerts.length > 0;

  return (
    <div
      className={`rounded-xl border transition-all duration-200 cursor-pointer
        ${hasAlerts
          ? "border-red-500/50 bg-red-950/20 hover:bg-red-950/30"
          : "border-gray-700/60 bg-gray-800/40 hover:bg-gray-800/70"
        }`}
      onClick={() => setExpanded((x) => !x)}
    >
      {/* ── Header row ── */}
      <div className="flex items-center gap-3 p-3">
        {/* Train ID + series */}
        <div className="flex flex-col min-w-[6rem]">
          <span className="font-mono font-bold text-sm text-white leading-tight">{trainId}</span>
          {series && (
            <span className="text-[10px] text-gray-500 leading-tight">{series}</span>
          )}
        </div>

        {/* Status */}
        <StatusBadge status={status} small />

        {/* Speed */}
        <div className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
          <Gauge size={11} />
          <span>{speed} km/h</span>
        </div>

        {/* Alerts badge */}
        {hasAlerts && (
          <span className="flex items-center gap-1 text-xs text-red-400">
            <AlertTriangle size={11} />
            {alerts.length}
          </span>
        )}

        {/* Expand toggle */}
        <span className="text-gray-500 ml-1">
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </div>

      {/* ── Health bar + station ── */}
      <div className="px-3 pb-2 space-y-1">
        <HealthBar score={healthScore} />
        <p className="text-[11px] text-gray-500 truncate">
          📍 {currentStation} &nbsp;|&nbsp; {odometer?.toLocaleString()} km
        </p>
        {manufacturer && (
          <p className="text-[10px] text-gray-600 truncate">⚙️ {manufacturer}</p>
        )}
      </div>

      {/* ── Expanded: component grid + alerts ── */}
      {expanded && (
        <div className="border-t border-gray-700/50 px-3 py-2 space-y-2">
          {/* Component grid */}
          <div className="grid grid-cols-4 gap-1">
            {Object.entries(components || {}).map(([name, comp]) => (
              <div key={name}
                className="flex flex-col items-center gap-0.5 py-1 px-0.5 rounded bg-gray-900/50">
                <span className={stateColor(comp.state)}>
                  {COMPONENT_ICONS[name] || <Activity size={12} />}
                </span>
                <span className="text-[9px] text-gray-500 capitalize">{name}</span>
                <span className={`text-[9px] font-semibold ${stateColor(comp.state)}`}>
                  {comp.state}
                </span>
              </div>
            ))}
          </div>

          {/* Active alerts list */}
          {hasAlerts && (
            <div className="space-y-1">
              {alerts.map((a, i) => (
                <div key={i}
                  className="flex items-start gap-2 rounded bg-red-950/40 px-2 py-1.5">
                  <AlertTriangle size={11} className="text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] font-semibold text-red-300">[{a.severity}] </span>
                    <span className="text-[10px] text-gray-300">{a.message}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
