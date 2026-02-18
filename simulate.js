/**
 * simulate.js  —  HealthHub Standalone Train Simulator
 *
 * Runs all 3 depots locally WITHOUT Docker.
 * Requires: npm install mqtt  (in this folder or globally)
 *
 * Usage:
 *   node simulate.js                          # connect to localhost:1883
 *   MQTT_BROKER=mqtt://192.168.1.10 node simulate.js
 *
 * Each depot publishes every INTERVAL ms (default 2000 ms).
 * Run the backend separately: cd backend && node src/index.js
 */

const mqtt = require("mqtt");
const path = require("path");

// ─── Reuse simulator logic from depot-agent ───────────────────────────────────
// (copy/paste friendly — no require path tricks needed)

/* ── trainData (inline) ── */
const SUKHUMVIT_STATIONS = [
  "Mo Chit","Saphan Khwai","Sena Nikhom","Ari","Sanam Pao",
  "Victory Monument","Phaya Thai","Ratchathewi","Siam",
  "Chit Lom","Phloen Chit","Nana","Asok","Phrom Phong",
  "Thong Lo","Ekkamai","Phra Khanong","On Nut","Bang Chak",
  "Punnawithi","Udom Suk","Bang Na","Bearing","Samrong",
  "Pu Chao","Chang Erawan","Kheha",
];

function getStations(line) {
  return SUKHUMVIT_STATIONS; // All BTS lines share operational stations in this sim
}

/**
 * Real BTS fleet — 98 trains across 3 depots.
 * Returns [{trainId, series, manufacturer, line}] for a given depotId.
 */
function buildFleetForDepot(depotId) {
  const SERIES = [
    { series:"EMU-A1", mfg:"Siemens Mobility",  start:1,  end:35, depot:"MOC", line:"Sukhumvit" },
    { series:"EMU-B1", mfg:"CNR",               start:36, end:47, depot:"MOC", line:"Sukhumvit" },
    { series:"EMU-B2", mfg:"CNR",               start:48, end:52, depot:"MOC", line:"Sukhumvit" },
    { series:"EMU-A2", mfg:"Siemens-Bozankaya", start:53, end:74, depot:"KHU", line:"Sukhumvit" },
    { series:"EMU-B3", mfg:"CRRC",              start:75, end:98, depot:"KHA", line:"Sukhumvit" },
  ];
  const trains = [];
  for (const s of SERIES.filter(s => s.depot === depotId)) {
    for (let id = s.start; id <= s.end; id++) {
      trains.push({
        trainId: `${s.series}-${String(id).padStart(3,"0")}`,
        series: s.series, manufacturer: s.mfg, line: s.line,
      });
    }
  }
  return trains;
}

/* ── simulator (inline) ── */
const STATUS_W = { IN_SERVICE:0.55, STANDBY:0.2, IN_DEPOT:0.15, MAINTENANCE:0.07, FAULT:0.03 };
const COMP_W   = { NORMAL:0.88, WARNING:0.09, FAULT:0.03 };

function rand(a,b){ return Math.random()*(b-a)+a; }
function randInt(a,b){ return Math.floor(rand(a,b+1)); }
function clamp(v,a,b){ return Math.min(Math.max(v,a),b); }
function wPick(w){
  let r=Math.random()*Object.values(w).reduce((a,b)=>a+b,0);
  for(const[k,v] of Object.entries(w)){ r-=v; if(r<=0) return k; }
  return Object.keys(w)[0];
}

const states = {};
function initState(id, line){
  const stations = getStations(line);
  states[id]={
    status:wPick(STATUS_W), speed:0,
    stIdx:randInt(0,stations.length-1), dir:1,
    odo:randInt(50000,500000), lastMaintKm:randInt(0,49999),
    c:{ doors:{s:"NORMAL",fc:[]}, brakes:{s:"NORMAL",p:100},
        hvac:{s:"NORMAL",t:24}, powerRail:{s:"NORMAL"},
        traction:{s:"NORMAL",mT:50}, battery:{s:"NORMAL",v:77.5},
        cctv:{s:"NORMAL",cams:24}, signalling:{s:"NORMAL"} },
    stations,
  };
}
function evo(cur){ return Math.random()<0.95 ? cur : wPick(COMP_W); }

function tick(id){
  const s=states[id]; const alerts=[];
  if(Math.random()<0.05) s.status=wPick(STATUS_W);

  // speed
  if(s.status==="IN_SERVICE")      s.speed=clamp(s.speed+rand(-5,8),0,90);
  else if(s.status==="STANDBY")    s.speed=clamp(s.speed+rand(-3,0),0,15);
  else                              s.speed=0;
  s.speed=Math.round(s.speed*10)/10;

  // station
  if(s.status==="IN_SERVICE"&&Math.random()<0.3){
    s.stIdx+=s.dir;
    if(s.stIdx>=s.stations.length){s.stIdx=s.stations.length-2;s.dir=-1;}
    else if(s.stIdx<0){s.stIdx=1;s.dir=1;}
  }
  if(s.status==="IN_SERVICE") s.odo+=Math.round(rand(0.1,0.5)*100)/100;

  const c=s.c;
  // doors
  c.doors.s=evo(c.doors.s);
  if(c.doors.s==="FAULT"){c.doors.fc=[randInt(1,6)];alerts.push({code:"DOOR_FAULT",severity:"HIGH",message:`Door fault Car ${c.doors.fc[0]}`});}
  else c.doors.fc=[];

  // brakes
  c.brakes.s=evo(c.brakes.s);
  c.brakes.p=clamp(c.brakes.p+rand(-2,2),c.brakes.s==="FAULT"?55:80,100);
  c.brakes.p=Math.round(c.brakes.p*10)/10;
  if(c.brakes.s==="FAULT") alerts.push({code:"BRAKE_FAULT",severity:"CRITICAL",message:"Brake pressure below threshold"});
  else if(c.brakes.s==="WARNING") alerts.push({code:"BRAKE_WARN",severity:"MEDIUM",message:`Brake pressure ${c.brakes.p}%`});

  // hvac
  c.hvac.s=evo(c.hvac.s);
  c.hvac.t=clamp(c.hvac.t+rand(-0.5,0.5),c.hvac.s==="FAULT"?30:20,c.hvac.s==="FAULT"?38:27);
  c.hvac.t=Math.round(c.hvac.t*10)/10;
  if(c.hvac.s==="FAULT") alerts.push({code:"HVAC_FAULT",severity:"MEDIUM",message:`Cabin temp ${c.hvac.t}°C`});

  // power rail (third rail)
  c.powerRail.s=evo(c.powerRail.s);
  if(c.powerRail.s==="FAULT") alerts.push({code:"POWER_FAULT",severity:"CRITICAL",message:"Third rail power loss"});

  // traction
  c.traction.s=evo(c.traction.s);
  c.traction.mT=clamp(c.traction.mT+rand(-2,3),40,c.traction.s==="FAULT"?140:110);
  c.traction.mT=Math.round(c.traction.mT);
  if(c.traction.mT>120) alerts.push({code:"TRACTION_OVERHEAT",severity:"HIGH",message:`Motor ${c.traction.mT}°C`});

  // battery
  c.battery.s=evo(c.battery.s);
  c.battery.v=clamp(c.battery.v+rand(-0.2,0.2),c.battery.s==="FAULT"?65:72,80);
  c.battery.v=Math.round(c.battery.v*10)/10;
  if(c.battery.v<72) alerts.push({code:"BATTERY_LOW",severity:"MEDIUM",message:`Battery ${c.battery.v}V`});

  // cctv
  c.cctv.s=evo(c.cctv.s);
  c.cctv.cams=c.cctv.s==="FAULT"?randInt(16,22):24;
  if(c.cctv.s==="FAULT") alerts.push({code:"CCTV_PARTIAL",severity:"LOW",message:`${24-c.cctv.cams} cam(s) offline`});

  // signalling
  c.signalling.s=evo(c.signalling.s);
  if(c.signalling.s==="FAULT") alerts.push({code:"ATP_FAULT",severity:"CRITICAL",message:"ATP/ATO fault"});

  const kmSince=s.odo-s.lastMaintKm;
  if(kmSince>40000) alerts.push({code:"SCHEDULED_MAINTENANCE",severity:"LOW",message:`Maint due (${Math.round(kmSince).toLocaleString()} km)`});

  const faults=Object.values(c).filter(x=>x.s==="FAULT").length;
  const warns =Object.values(c).filter(x=>x.s==="WARNING").length;
  const health=Math.max(0,100-faults*20-warns*5);

  return {
    trainId:id,
    status:s.status, speed:s.speed,
    currentStation:s.stations[s.stIdx],
    odometer:Math.round(s.odo), healthScore:health,
    components:{
      doors:    {state:c.doors.s,    faultCars:c.doors.fc},
      brakes:   {state:c.brakes.s,   pressure:c.brakes.p},
      hvac:     {state:c.hvac.s,     cabinTemp:c.hvac.t},
      powerRail:{state:c.powerRail.s},
      traction: {state:c.traction.s, motorTemp:c.traction.mT},
      battery:  {state:c.battery.s,  voltage:c.battery.v},
      cctv:     {state:c.cctv.s,     activeCams:c.cctv.cams},
      signalling:{state:c.signalling.s},
    },
    alerts,
    timestamp:new Date().toISOString(),
  };
}

// ─── Depot config ─────────────────────────────────────────────────────────────

// Real BTS depots
const DEPOTS = [
  { id:"MOC", name:"Mo Chit Depot",  line:"Sukhumvit" },
  { id:"KHU", name:"Khukhot Depot",  line:"Sukhumvit" },
  { id:"KHA", name:"Kheha Depot",    line:"Sukhumvit" },
];

const BROKER   = process.env.MQTT_BROKER || "mqtt://localhost:1883";
const INTERVAL = parseInt(process.env.PUBLISH_INTERVAL || "2000", 10);

// ─── Build fleets (real BTS composition) ───────────────────────────────────────

const fleets = {};  // depotId → [{trainId, series, manufacturer, line}]
for (const d of DEPOTS) {
  fleets[d.id] = buildFleetForDepot(d.id);
  for (const t of fleets[d.id]) initState(t.trainId, t.line);
}

// ─── Connect & publish ────────────────────────────────────────────────────────

console.log("\n╔══════════════════════════════════════════════╗");
console.log("║   HealthHub — Standalone Train Simulator     ║");
console.log("╚══════════════════════════════════════════════╝");
console.log(`Broker  : ${BROKER}`);
const totalTrains = Object.values(fleets).reduce((a, f) => a + f.length, 0);
for (const d of DEPOTS) {
  const seriesGroups = {};
  for (const t of fleets[d.id]) seriesGroups[t.series] = (seriesGroups[t.series]||0)+1;
  const seriesStr = Object.entries(seriesGroups).map(([s,c])=>`${s}×${c}`).join(", ");
  console.log(`  ${d.id} — ${d.name}: ${fleets[d.id].length} trains (${seriesStr})`);
}
console.log(`Total   : ${totalTrains} trains`);
console.log(`Interval: ${INTERVAL} ms\n`);

const client = mqtt.connect(BROKER, { reconnectPeriod:5000 });

client.on("connect", () => {
  console.log("✅ Connected to MQTT broker\n");

  // Register depots
  for (const d of DEPOTS) {
    const trainIds = fleets[d.id].map(t => t.trainId);
    client.publish(
      `healthhub/depot/${d.id}/status`,
      JSON.stringify({ depotId:d.id, depotName:d.name, line:d.line,
        trainCount:fleets[d.id].length, trains:trainIds, fleet:fleets[d.id],
        agentVersion:"standalone", connectedAt:new Date().toISOString() }),
      { retain:true }
    );
  }

  // Round-robin publish loop — one train from each depot per tick
  const counters = {};
  for (const d of DEPOTS) counters[d.id] = 0;

  setInterval(() => {
    for (const d of DEPOTS) {
      const idx  = counters[d.id] % fleets[d.id].length;
      const meta = fleets[d.id][idx];
      counters[d.id]++;

      const payload = {
        ...tick(meta.trainId),
        depotId:d.id, depotName:d.name, line:meta.line,
        series:meta.series, manufacturer:meta.manufacturer,
      };
      client.publish(
        `healthhub/depot/${d.id}/train/${meta.trainId}`,
        JSON.stringify(payload), { qos:1 }
      );

      const alertTag = payload.alerts.length > 0 ? ` ⚠ ${payload.alerts.length}` : "";
      console.log(
        `[${d.id}] ${meta.trainId.padEnd(12)} | ${payload.status.padEnd(11)} | ` +
        `${String(payload.speed).padStart(4)} km/h | Health:${payload.healthScore}% | ` +
        payload.currentStation + alertTag
      );
    }
  }, INTERVAL);
});

client.on("error",     (e) => console.error("MQTT error:", e.message));
client.on("reconnect", ()  => console.log("Reconnecting…"));

process.on("SIGINT", () => { console.log("\nStopping…"); client.end(true, ()=>process.exit(0)); });
