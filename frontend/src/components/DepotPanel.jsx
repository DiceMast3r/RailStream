/**
 * DepotPanel.jsx
 * Column panel representing one depot with its full train list.
 */
import React, { useState } from "react";
import { Building2, Train, ChevronDown, ChevronUp } from "lucide-react";
import TrainCard from "./TrainCard";

const DEPOT_ACCENT = {
  MOC: "border-blue-500/40   bg-blue-500/5",
  KHU: "border-violet-500/40 bg-violet-500/5",
  KHA: "border-emerald-500/40 bg-emerald-500/5",
};

const DEPOT_HEADER = {
  MOC: "text-blue-400",
  KHU: "text-violet-400",
  KHA: "text-emerald-400",
};

export default function DepotPanel({ depotId, depotInfo, trains }) {
  const [collapsed, setCollapsed] = useState(false);
  const faultCount = trains.filter((t) => (t.alerts || []).length > 0).length;
  const inService  = trains.filter((t) => t.status === "IN_SERVICE").length;

  // Derive series breakdown from live train data
  const seriesGroups = {};
  for (const t of trains) {
    if (t.series) seriesGroups[t.series] = (seriesGroups[t.series] || 0) + 1;
  }
  const seriesStr = Object.entries(seriesGroups)
    .map(([s, c]) => `${s}×${c}`)
    .join("  ");

  return (
    <div className={`rounded-2xl border ${DEPOT_ACCENT[depotId] || "border-gray-700 bg-gray-800/20"} flex flex-col`}>
      {/* ── Depot header ── */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer select-none"
        onClick={() => setCollapsed((x) => !x)}
      >
        <Building2 size={18} className={DEPOT_HEADER[depotId] || "text-gray-400"} />
        <div className="flex-1 min-w-0">
          <h2 className={`font-bold text-sm ${DEPOT_HEADER[depotId] || "text-gray-200"}`}>
            {depotInfo?.depotName || depotId}
          </h2>
          <p className="text-[11px] text-gray-500">
            {depotInfo?.line || "—"} Line &nbsp;·&nbsp; {depotInfo?.trainCount ?? trains.length} trains
          </p>
          {seriesStr && (
            <p className="text-[10px] text-gray-600 mt-0.5">{seriesStr}</p>
          )}
        </div>

        {/* KPIs */}
        <div className="flex gap-3 text-xs shrink-0">
          <span className="text-emerald-400 font-semibold">{inService} active</span>
          {faultCount > 0 && (
            <span className="text-red-400 font-semibold">{faultCount} ⚠</span>
          )}
        </div>
        <span className="text-gray-500 ml-1">
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </span>
      </div>

      {/* ── Train list ── */}
      {!collapsed && (
        <div className="px-3 pb-3 space-y-2 overflow-y-auto max-h-[70vh]">
          {trains.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-6">
              Waiting for telemetry…
            </p>
          ) : (
            trains
              .sort((a, b) => (b.alerts?.length || 0) - (a.alerts?.length || 0))
              .map((t) => <TrainCard key={t.trainId} train={t} />)
          )}
        </div>
      )}
    </div>
  );
}
