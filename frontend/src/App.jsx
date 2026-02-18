/**
 * App.jsx  —  HealthHub Central Control Room Dashboard
 *
 * Layout:
 *  ┌──────────────────────────────────────────────────┐
 *  │  Header: logo + connection status                │
 *  ├──────────────────────────────────────────────────┤
 *  │  KPI Bar                                         │
 *  ├──────────────────────────────────┬───────────────┤
 *  │  Depot columns (3 panels)        │  Alert Feed   │
 *  └──────────────────────────────────┴───────────────┘
 */

import React, { useMemo, useState } from "react";
import { Wifi, WifiOff, Train } from "lucide-react";
import { useSocket }        from "./hooks/useSocket";
import KpiBar              from "./components/KpiBar";
import DepotPanel          from "./components/DepotPanel";
import AlertFeed           from "./components/AlertFeed";
import AlertDetailModal    from "./components/AlertDetailModal";

// Real BTS depot order: Mo Chit (52 trains) · Khukhot (22 trains) · Kheha (24 trains)
const DEPOT_ORDER = ["MOC", "KHU", "KHA"];
const ALLOWED_DEPOTS = new Set(DEPOT_ORDER);

export default function App() {
  const { connected, trains, depots, pointMachines, summary, alerts } = useSocket();
  const [selectedAlert, setSelectedAlert] = useState(null);

  // Group trains by depotId
  const trainsByDepot = useMemo(() => {
    const groups = {};
    for (const t of Object.values(trains)) {
      if (!groups[t.depotId]) groups[t.depotId] = [];
      groups[t.depotId].push(t);
    }
    return groups;
  }, [trains]);

  // Group point machines by depotId
  const pmsByDepot = useMemo(() => {
    const groups = {};
    for (const pm of Object.values(pointMachines)) {
      if (!groups[pm.depotId]) groups[pm.depotId] = [];
      groups[pm.depotId].push(pm);
    }
    return groups;
  }, [pointMachines]);

  // All known depot IDs — restricted to the three real BTS depots
  const depotIds = useMemo(() => {
    return DEPOT_ORDER.filter((id) => ALLOWED_DEPOTS.has(id));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex items-center gap-4 px-6 py-3 border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Train size={22} className="text-sky-400" />
          <span className="font-extrabold text-lg tracking-tight text-white">
            Health<span className="text-sky-400">Hub</span>
          </span>
        </div>
        <span className="text-xs text-gray-500 font-medium">
          BTS Skytrain Central Control Room
        </span>

        <div className="ml-auto flex items-center gap-2 text-xs">
          {connected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 font-medium">LIVE</span>
              <Wifi size={14} className="text-emerald-400" />
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-red-400 font-medium">OFFLINE</span>
              <WifiOff size={14} className="text-red-400" />
            </>
          )}
          <span className="text-gray-500 ml-2">
            {new Date().toLocaleDateString("en-TH", {
              year: "numeric", month: "short", day: "numeric",
            })}
          </span>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col gap-4 p-4 overflow-hidden">

        {/* KPI Summary */}
        <KpiBar summary={summary} />

        {/* Depot columns + Alert feed */}
        <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">

          {/* Depot panel columns */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-y-auto">
            {depotIds.map((depotId) => (
              <DepotPanel
                key={depotId}
                depotId={depotId}
                depotInfo={depots[depotId]}
                trains={trainsByDepot[depotId] || []}
                pointMachines={pmsByDepot[depotId] || []}
              />
            ))}
          </div>

          {/* Alert feed sidebar */}
          <div className="w-72 shrink-0 rounded-2xl border border-gray-700/60 bg-gray-800/30 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700/50">
              <span className="font-bold text-sm text-gray-200">Alert Feed</span>
              {alerts.length > 0 && (
                <span className="ml-auto text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-semibold">
                  {alerts.length}
                </span>
              )}
            </div>
            <div className="flex-1 p-3 overflow-y-auto">
              <AlertFeed alerts={alerts} onSelect={setSelectedAlert} />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-[11px] text-gray-700 py-2 border-t border-gray-800">
        HealthHub v1.0 — Portfolio Demo — BTS Skytrain Fleet Monitoring
      </footer>

      {/* ── Alert Detail Modal ── */}
      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          train={trains[selectedAlert.trainId] || null}
          onClose={() => setSelectedAlert(null)}
        />
      )}
    </div>
  );
}
