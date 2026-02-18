/**
 * TrainCard.jsx
 * Compact card showing a single train's real-time telemetry.
 * Clicking the card expands to show component-level details.
 */
import React, { useState } from "react";
import {
  Train, Gauge, Thermometer, Battery, Wind,
  Activity, Camera, AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import StatusBadge from "./StatusBadge";
import HealthBar   from "./HealthBar";

//  ─── Component icons ─────────────────────────────────────────────────────────

const COMPONENT_ICONS = {
  doors:      <Train   size={12} />,
  brakes:     <Gauge   size={12} />,
  hvac:       <Wind    size={12} />,
  powerRail:  <Activity size={12} />,
  traction:   <Activity size={12} />,
  battery:    <Battery size={12} />,
  cctv:       <Camera  size={12} />,
};

function stateColor(state) {
  return state === "FAULT"   ? "text-red-400"
       : state === "WARNING" ? "text-amber-400"
       :                       "text-emerald-400";
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrainCard({ train }) {
  const [expanded, setExpanded] = useState(false);

  const { trainId, series, manufacturer, status, speed, phase, currentStation, nextStation,
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

        {/* Speed + phase */}
        <div className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
          <Gauge size={11} />
          <span>{speed} km/h</span>
          {phase && phase !== "DWELL" && (
            <span className={`text-[9px] font-semibold ml-0.5 ${
              phase === "ACCEL"  ? "text-emerald-400" :
              phase === "CRUISE" ? "text-sky-400" :
              phase === "BRAKE"  ? "text-amber-400" : "text-gray-500"
            }`}>{phase}</span>
          )}
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
          {nextStation
            ? <>📍 {currentStation} <span className="text-gray-600">→</span> <span className="text-gray-400">{nextStation}</span></>
            : <>📍 {currentStation}</>}
          &nbsp;|&nbsp; {odometer?.toLocaleString()} km
        </p>
        {manufacturer && (
          <p className="text-[10px] text-gray-600 truncate">⚙️ {manufacturer}</p>
        )}
      </div>

      {/* ── Expanded: component grid + alerts ── */}
      {expanded && (
        <div className="border-t border-gray-700/50 px-3 py-2 space-y-2">
          {/* Component grid */}
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(components || {}).map(([name, comp]) => (
              <div key={name}
                className="flex items-center gap-2 py-1 px-2 rounded bg-gray-900/50">
                {/* Icon + name */}
                <span className={`shrink-0 ${stateColor(comp.state)}`}>
                  {COMPONENT_ICONS[name] || <Activity size={12} />}
                </span>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9px] text-gray-400 capitalize leading-tight">{name}</span>
                    <span className={`text-[9px] font-bold leading-tight ${stateColor(comp.state)}`}>{comp.state}</span>
                  </div>
                  {/* Per-component telemetry sub-row */}
                  <span className="text-[8px] text-gray-500 font-mono leading-tight truncate">
                    {name === "brakes"     && comp.pressure   != null && `${comp.pressure}%`}
                    {name === "hvac"       && comp.cabinTemp  != null && `${comp.cabinTemp}°C`}
                    {name === "traction"   && comp.motorTemp  != null && `${comp.motorTemp}°C`}
                    {name === "battery"    && comp.voltage    != null && `${comp.voltage} V`}
                    {name === "cctv"       && comp.activeCams != null && `${comp.activeCams}/24 cams`}
                    {name === "doors"      && comp.faultCars?.length  > 0 && `Car ${comp.faultCars.join(",")}`}
                  </span>
                </div>
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
