/**
 * index.js  —  HealthHub Backend
 *
 * Bootstraps Express + Socket.io, then connects the MQTT subscriber.
 * All real-time train data flows: MQTT → store → Socket.io → browser.
 */

const express    = require("express");
const http       = require("http");
const cors       = require("cors");
const { Server } = require("socket.io");
const apiRouter  = require("./routes/api");
const mqttClient = require("./mqttClient");
const store      = require("./store");

const PORT = parseInt(process.env.PORT || "3001", 10);

// ─── Express ──────────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use("/api", apiRouter);

// ─── HTTP + Socket.io ─────────────────────────────────────────────────────────

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});

io.on("connection", (socket) => {
  console.log(`[WS] Client connected  — ${socket.id}`);

  // Send current snapshot so the dashboard is immediately populated
  socket.emit("snapshot", {
    trains:  store.getAllTrains(),
    depots:  store.getAllDepots(),
    summary: store.getFleetSummary(),
    alerts:  store.getAlertLog(50),
  });

  socket.on("disconnect", () => {
    console.log(`[WS] Client disconnected — ${socket.id}`);
  });
});

// ─── MQTT subscriber ──────────────────────────────────────────────────────────

mqttClient.start(io);

// Push updated summary every 5 s so the KPI bar stays fresh
setInterval(() => {
  io.emit("summary:update", store.getFleetSummary());
}, 5000);

// ─── Start server ─────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[API] ✅ HealthHub backend listening on port ${PORT}`);
  console.log(`[API]    REST  → http://localhost:${PORT}/api`);
  console.log(`[API]    WS    → ws://localhost:${PORT}`);
});
