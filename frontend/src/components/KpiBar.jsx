/**
 * KpiBar.jsx
 * Top summary strip: total trains, active, avg health, critical alerts.
 */
import React from "react";
import { Train, Activity, AlertTriangle, Building2, HeartPulse } from "lucide-react";

function Kpi({ icon, label, value, accent = "text-white" }) {
  return (
    <div className="flex items-center gap-3 bg-gray-800/50 rounded-xl px-4 py-3 flex-1 min-w-[130px]">
      <span className={`${accent}`}>{icon}</span>
      <div>
        <p className="text-[11px] text-gray-400">{label}</p>
        <p className={`text-xl font-bold ${accent}`}>{value ?? "—"}</p>
      </div>
    </div>
  );
}

export default function KpiBar({ summary }) {
  if (!summary) {
    return (
      <div className="flex gap-3 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex-1 h-16 rounded-xl bg-gray-800/50" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Kpi icon={<Train size={20} />}        label="Total Fleet"     value={summary.totalTrains}    accent="text-sky-400" />
      <Kpi icon={<Activity size={20} />}     label="In Service"      value={summary.activeTrains}   accent="text-emerald-400" />
      <Kpi icon={<Building2 size={20} />}    label="Depots Online"   value={summary.depotCount}     accent="text-blue-400" />
      <Kpi icon={<HeartPulse size={20} />}   label="Avg Health"      value={`${summary.avgHealthScore}%`} accent={
        summary.avgHealthScore >= 80 ? "text-emerald-400"
        : summary.avgHealthScore >= 60 ? "text-amber-400" : "text-red-400"
      } />
      <Kpi icon={<AlertTriangle size={20} />} label="Critical Alerts" value={summary.criticalAlerts} accent={
        summary.criticalAlerts > 0 ? "text-red-400" : "text-gray-400"
      } />
    </div>
  );
}
