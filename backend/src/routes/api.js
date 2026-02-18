/**
 * routes/api.js
 * REST API endpoints for the RailStream dashboard.
 */

const express = require("express");
const store   = require("../store");

const router = express.Router();

// GET /api/summary  — fleet-wide KPIs
router.get("/summary", (req, res) => {
  res.json(store.getFleetSummary());
});

// GET /api/depots  — all registered depots
router.get("/depots", (req, res) => {
  res.json(store.getAllDepots());
});

// GET /api/trains  — all known trains (latest snapshot)
router.get("/trains", (req, res) => {
  const { depot, status } = req.query;
  let trains = store.getAllTrains();
  if (depot)  trains = trains.filter((t) => t.depotId  === depot.toUpperCase());
  if (status) trains = trains.filter((t) => t.status   === status.toUpperCase());
  res.json(trains);
});

// GET /api/trains/:trainId  — single train
router.get("/trains/:trainId", (req, res) => {
  const train = store.getTrain(req.params.trainId);
  if (!train) return res.status(404).json({ error: "Train not found" });
  res.json(train);
});

// GET /api/alerts?limit=50  — recent alert log
router.get("/alerts", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
  res.json(store.getAlertLog(limit));
});

// GET /api/pointmachines  — all point machines (optionally filtered by depot)
router.get("/pointmachines", (req, res) => {
  const { depot } = req.query;
  let pms = store.getAllPointMachines();
  if (depot) pms = pms.filter((pm) => pm.depotId === depot.toUpperCase());
  res.json(pms);
});

// GET /api/health  — service health check
router.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), ts: new Date().toISOString() });
});

module.exports = router;
