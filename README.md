# HealthHub — BTS Skytrain Fleet Health Monitoring System

> **Portfolio project** — Designed to demonstrate distributed systems, real-time IoT telemetry, and modern web architecture for the **Alstom Thailand Software Architect** position.

---

## Concept

BTS Skytrain operates **3 depots** across Bangkok:

| Depot | Code | Line | Trains |
|-------|------|------|--------|
| Mo Chit Depot | `MOC` | Sukhumvit (North) | 12 |
| Bearing Depot | `BEA` | Sukhumvit (South) | 10 |
| Wutthakat Depot | `WUT` | Silom | 8 |

Each depot continuously sends **train telemetry** to a central **Control Room** web dashboard. HealthHub simulates this entire pipeline using Docker containers.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Network                           │
│                                                                 │
│  ┌─────────────┐                                                │
│  │ Depot Agent │──┐                                             │
│  │   (MOC)     │  │                                             │
│  └─────────────┘  │   MQTT publish                             │
│  ┌─────────────┐  ├──► ┌──────────────┐    WebSocket / REST    │
│  │ Depot Agent │──┤    │ Mosquitto    │───► ┌──────────────┐   │
│  │   (BEA)     │  │    │ MQTT Broker  │     │  Backend     │◄──┼── Browser
│  └─────────────┘  │    │ port 1883    │     │  Node.js     │   │
│  ┌─────────────┐  │    └──────────────┘     │  port 3001   │   │
│  │ Depot Agent │──┘                         └──────┬───────┘   │
│  │   (WUT)     │                                   │           │
│  └─────────────┘                            ┌──────▼───────┐   │
│                                             │  Frontend    │   │
│                                             │  React/Nginx │   │
│                                             │  port 8080   │   │
│                                             └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Depot Agent  ──MQTT──►  Mosquitto  ──MQTT──►  Backend  ──Socket.io──►  Dashboard
(simulate)              (broker)              (Node.js)                (React)
```

### MQTT Topic Structure

```
healthhub/depot/{DEPOT_ID}/status          # Depot registration (retained)
healthhub/depot/{DEPOT_ID}/train/{TRAIN_ID} # Train telemetry (QoS 1)
```

---

## Train Telemetry Payload

Each train publishes a JSON payload every 3 seconds:

```json
{
  "trainId": "MOC-001",
  "depotId": "MOC",
  "depotName": "Mo Chit Depot",
  "line": "Sukhumvit",
  "timestamp": "2026-02-18T10:23:45.000Z",
  "status": "IN_SERVICE",
  "speed": 62.5,
  "currentStation": "Asok",
  "odometer": 312847,
  "healthScore": 95,
  "components": {
    "doors":      { "state": "NORMAL", "faultCars": [] },
    "brakes":     { "state": "NORMAL", "pressure": 98.2 },
    "hvac":       { "state": "NORMAL", "cabinTemp": 24.1 },
    "pantograph": { "state": "NORMAL" },
    "traction":   { "state": "WARNING", "motorTemp": 108 },
    "battery":    { "state": "NORMAL", "voltage": 77.3 },
    "cctv":       { "state": "NORMAL", "activeCams": 24 },
    "signalling": { "state": "NORMAL" }
  },
  "alerts": [
    {
      "code": "TRACTION_OVERHEAT",
      "severity": "HIGH",
      "message": "Motor temp 108°C"
    }
  ]
}
```

### Train Status Values

| Status | Meaning |
|--------|---------|
| `IN_SERVICE` | Running on line |
| `STANDBY` | Ready, waiting at platform |
| `IN_DEPOT` | Parked at depot |
| `MAINTENANCE` | Undergoing scheduled maintenance |
| `FAULT` | Out of service — fault condition |

### Alert Severity Levels

| Level | Color | Action |
|-------|-------|--------|
| `CRITICAL` | 🔴 Red | Immediate intervention required |
| `HIGH` | 🟠 Orange | Urgent attention — dispatch crew |
| `MEDIUM` | 🟡 Amber | Monitor closely |
| `LOW` | 🔵 Blue | Log and schedule |

---

## Quick Start — Docker (Recommended)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### Run

```bash
# Clone / open workspace
cd e:\HealthHub

# Build and start all services
docker compose up --build

# Open dashboard
start http://localhost:8080
```

### Stop

```bash
docker compose down
```

---

## Quick Start — Without Docker (Local Dev)

Requires: **Node.js 18+** and a running **Mosquitto** MQTT broker.

### 1 — Start Mosquitto

```bash
# Windows (if Mosquitto is installed)
mosquitto -c mosquitto\config\mosquitto.conf

# Or via Docker (single broker only)
docker run -p 1883:1883 -v ${PWD}/mosquitto/config:/mosquitto/config eclipse-mosquitto:2.0
```

### 2 — Start Backend

```bash
cd backend
npm install
npm start
# → API: http://localhost:3001/api
```

### 3 — Start Frontend (dev mode)

```bash
cd frontend
npm install
npm run dev
# → Dashboard: http://localhost:5173
```

### 4 — Run Simulator

```bash
# From project root
npm install
node simulate.js

# Or with custom broker
MQTT_BROKER=mqtt://localhost:1883 node simulate.js
```

---

## REST API Reference

Base URL: `http://localhost:3001/api`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health check |
| `GET` | `/summary` | Fleet-wide KPIs |
| `GET` | `/depots` | All registered depots |
| `GET` | `/trains` | All trains (supports `?depot=MOC&status=IN_SERVICE`) |
| `GET` | `/trains/:trainId` | Single train detail |
| `GET` | `/alerts?limit=50` | Rolling alert log |

### Example

```bash
curl http://localhost:3001/api/summary
curl http://localhost:3001/api/trains?depot=MOC
curl http://localhost:3001/api/alerts?limit=10
```

---

## Project Structure

```
HealthHub/
├── docker-compose.yml          # Orchestrates all 5 services
├── simulate.js                 # Standalone simulator (no Docker needed)
├── package.json                # Root — simulator dependencies
│
├── mosquitto/
│   └── config/mosquitto.conf  # MQTT broker config
│
├── depot-agent/               # Depot IoT agent (runs ×3 with different env)
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js           # Entry — MQTT publisher loop
│       ├── trainSimulator.js  # Stateful train telemetry engine
│       └── trainData.js       # Station lists & fleet builder
│
├── backend/                   # Central API server
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js           # Express + Socket.io bootstrap
│       ├── mqttClient.js      # MQTT subscriber → store → WebSocket relay
│       ├── store.js           # In-memory state cache
│       └── routes/api.js      # REST endpoints
│
└── frontend/                  # React dashboard
    ├── Dockerfile             # Multi-stage: Vite build → Nginx
    ├── nginx.conf
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── App.jsx            # Main layout
        ├── hooks/useSocket.js # Socket.io state management
        └── components/
            ├── KpiBar.jsx     # Fleet summary strip
            ├── DepotPanel.jsx # Per-depot column
            ├── TrainCard.jsx  # Individual train tile
            ├── AlertFeed.jsx  # Real-time alert sidebar
            ├── HealthBar.jsx  # Health score progress bar
            └── StatusBadge.jsx # Status pill component
```

---

## Key Engineering Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Message broker | **MQTT (Mosquitto)** | Industry standard for rail IoT telemetry — lightweight, pub/sub, QoS support |
| Real-time to browser | **Socket.io** | Bidirectional WS with fallback; widely supported |
| State management | **In-memory store** | Sufficient for demo; swap for Redis/TimescaleDB in production |
| Containerisation | **Docker Compose** | Single-command deployment; each depot is a separate container |
| Frontend | **React + Vite + Tailwind** | Fast dev, small bundle, utility-first dark theme |

---

## Production Considerations

For a production HealthHub deployment, the following enhancements would be added:

- **TimescaleDB** or **InfluxDB** for time-series telemetry storage
- **Redis** for distributed train state cache
- **MQTT TLS + authentication** for secure depot communication
- **Kubernetes** for multi-node depot agent scaling
- **Grafana** dashboards for historical trend analysis
- **PagerDuty / SMS gateway** for CRITICAL alert escalation
- **JWT authentication** for CCR operator access control

---

*Built for the Alstom Thailand Software Architect portfolio submission — February 2026*
