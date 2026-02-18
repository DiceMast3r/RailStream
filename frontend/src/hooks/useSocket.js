/**
 * useSocket.js
 * Custom hook — connects to the backend via Socket.io and keeps
 * the component state in sync with live train telemetry.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

const WS_URL = import.meta.env.VITE_WS_URL || "http://localhost:3001";

export function useSocket() {
  const socketRef  = useRef(null);
  const [connected, setConnected]   = useState(false);
  const [trains,    setTrains]       = useState({});   // trainId → payload
  const [depots,    setDepots]       = useState({});   // depotId → payload
  const [summary,   setSummary]      = useState(null);
  const [alerts,    setAlerts]       = useState([]);   // rolling alert log

  const addAlerts = useCallback((newAlerts) => {
    setAlerts((prev) => {
      const combined = [...newAlerts, ...prev];
      return combined.slice(0, 100); // keep last 100
    });
  }, []);

  useEffect(() => {
    const socket = io(WS_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect",    () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // Initial full snapshot
    socket.on("snapshot", ({ trains: ts, depots: ds, summary: s, alerts: a }) => {
      const trainMap = {};
      for (const t of ts) trainMap[t.trainId] = t;
      setTrains(trainMap);

      const depotMap = {};
      for (const d of ds) depotMap[d.depotId] = d;
      setDepots(depotMap);

      setSummary(s);
      setAlerts(a || []);
    });

    // Live train telemetry
    socket.on("train:update", (payload) => {
      setTrains((prev) => ({ ...prev, [payload.trainId]: payload }));
    });

    // Depot registration / heartbeat
    socket.on("depot:update", (payload) => {
      setDepots((prev) => ({ ...prev, [payload.depotId]: payload }));
    });

    // KPI summary refresh
    socket.on("summary:update", (s) => setSummary(s));

    // Critical alert broadcast
    socket.on("alert:critical", (payload) => {
      addAlerts(
        payload.alerts.map((a) => ({
          ...a,
          trainId:   payload.trainId,
          depotId:   payload.depotId,
          depotName: payload.depotName,
          timestamp: payload.timestamp,
        }))
      );
    });

    return () => socket.disconnect();
  }, [addAlerts]);

  return { connected, trains, depots, summary, alerts };
}
