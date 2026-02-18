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
const STATUS_W = { IN_SERVICE:0.72, STANDBY:0.10, IN_DEPOT:0.10, MAINTENANCE:0.05, FAULT:0.03 };
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
  const status   = wPick(STATUS_W);
  // Spread trains across the line at startup — random phase so they don't all leave at once
  const PHASES   = ["DWELL","ACCEL","CRUISE","BRAKE"];
  const phase    = status==="IN_SERVICE" ? PHASES[randInt(0,3)] : "DWELL";
  states[id]={
    status, speed: phase==="CRUISE"?randInt(60,80):phase==="ACCEL"?randInt(10,50):phase==="BRAKE"?randInt(5,40):0,
    stIdx:randInt(0,stations.length-1), dir:Math.random()>0.5?1:-1,
    phase, dwellTimer:randInt(8,20), segProgress:phase==="DWELL"?0:rand(0.05,phase==="BRAKE"?0.95:0.6),
    odo:randInt(50000,500000), lastMaintKm:randInt(0,49999),
    c:{ doors:{s:"NORMAL",fc:[]}, brakes:{s:"NORMAL",p:100},
        hvac:{s:"NORMAL",t:24}, powerRail:{s:"NORMAL"},
        traction:{s:"NORMAL",mT:50}, battery:{s:"NORMAL",v:77.5},
        cctv:{s:"NORMAL",cams:24} },
    stations,
  };
}
function evo(cur){ return Math.random()<0.95 ? cur : wPick(COMP_W); }

function tick(id){
  const s=states[id]; const alerts=[];
  // ─── Operational status change ─────────────────────────────────────────────
  if(Math.random()<0.03){
    const prev=s.status;
    s.status=wPick(STATUS_W);
    // When coming back into service, start fresh at a station
    if(s.status==="IN_SERVICE"&&prev!=="IN_SERVICE"){
      s.phase="DWELL"; s.dwellTimer=randInt(10,20); s.segProgress=0; s.speed=0;
    }
    if(s.status!=="IN_SERVICE"){ s.speed=0; s.phase="DWELL"; }
  }

  // ─── Speed / phase — trapezoidal profile ─────────────────────────────────────
  // Each tick = 2 s. Segment progress: speed(km/h) / 1800 ≈ distance / avg 1 km station gap.
  if(s.status==="IN_SERVICE"){
    const ACCEL_RATE = rand(4,6);   // km/h per tick (~3.5 km/h/s ≈ 1 m/s²)
    const BRAKE_RATE = rand(6,9);   // km/h per tick (slightly harder)
    const MAX_SPEED  = 80;

    if(s.phase==="DWELL"){
      s.speed=0;
      s.dwellTimer--;
      if(s.dwellTimer<=0){ s.phase="ACCEL"; s.segProgress=0; }

    } else if(s.phase==="ACCEL"){
      s.speed=clamp(s.speed+ACCEL_RATE,0,MAX_SPEED);
      s.segProgress+=s.speed/1800;
      // Switch to cruise once near max, or brake early on short segments
      if(s.speed>=MAX_SPEED*0.92) s.phase="CRUISE";
      if(s.segProgress>=0.68)     s.phase="BRAKE";

    } else if(s.phase==="CRUISE"){
      s.speed=clamp(s.speed+rand(-2,2),MAX_SPEED*0.88,MAX_SPEED);
      s.segProgress+=s.speed/1800;
      if(s.segProgress>=0.68) s.phase="BRAKE";

    } else if(s.phase==="BRAKE"){
      s.speed=clamp(s.speed-BRAKE_RATE,0,MAX_SPEED);
      s.segProgress+=Math.max(s.speed,0)/1800;
      if(s.speed<=0){
        // Arrived — advance to next station
        s.stIdx+=s.dir;
        if(s.stIdx>=s.stations.length){s.stIdx=s.stations.length-2;s.dir=-1;}
        else if(s.stIdx<0){s.stIdx=1;s.dir=1;}
        s.phase="DWELL"; s.dwellTimer=randInt(8,20); s.segProgress=0;
      }
    }
  } else if(s.status==="STANDBY"){
    s.speed=clamp(s.speed+rand(-3,0),0,15);
  } else {
    s.speed=0;
  }
  s.speed=Math.round(s.speed*10)/10;

  // Odometer advances proportional to actual speed (2 s tick → km = speed/3600*2)
  if(s.speed>0) s.odo+=Math.round(s.speed/1800*100)/100;

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

  const kmSince=s.odo-s.lastMaintKm;
  if(kmSince>40000) alerts.push({code:"SCHEDULED_MAINTENANCE",severity:"LOW",message:`Maint due (${Math.round(kmSince).toLocaleString()} km)`});

  const faults=Object.values(c).filter(x=>x.s==="FAULT").length;
  const warns =Object.values(c).filter(x=>x.s==="WARNING").length;
  const health=Math.max(0,100-faults*20-warns*5);

  return {
    trainId:id,
    status:s.status, speed:s.speed, phase:s.phase,
    currentStation:s.stations[s.stIdx],
    nextStation: s.phase!=="DWELL"
      ? s.stations[Math.max(0,Math.min(s.stations.length-1,s.stIdx+s.dir))]
      : null,
    odometer:Math.round(s.odo), healthScore:health,
    components:{
      doors:    {state:c.doors.s,    faultCars:c.doors.fc},
      brakes:   {state:c.brakes.s,   pressure:c.brakes.p},
      hvac:     {state:c.hvac.s,     cabinTemp:c.hvac.t},
      powerRail:{state:c.powerRail.s},
      traction: {state:c.traction.s, motorTemp:c.traction.mT},
      battery:  {state:c.battery.s,  voltage:c.battery.v},
      cctv:     {state:c.cctv.s,     activeCams:c.cctv.cams},
    },
    alerts,
    timestamp:new Date().toISOString(),
  };
}
// ─── Point Machine Simulator (wayside, fixed to track) ───────────────────────────

const DEPOT_POINT_MACHINES = {
  MOC: ["A1","A2","A3","B1","B2","C1","C2","D1"],
  KHU: ["A1","A2","B1","B2","C1"],
  KHA: ["A1","A2","B1","B2","C1","C2"],
};
const PM_W = { NORMAL:0.90, WARNING:0.07, FAULT:0.03 };
const pmStates = {};

function initPM(pmId){
  pmStates[pmId]={ s:"NORMAL", motorCurrent:rand(2.0,2.8), voltage:randInt(109,113),
    strokeTime:randInt(3100,3400), position:Math.random()>0.5?"NORMAL":"REVERSE", opCount:randInt(0,200) };
}

function tickPM(depotId){
  const ids = DEPOT_POINT_MACHINES[depotId]||[];
  return ids.map(localId=>{
    const pmId=`${depotId}-PM-${localId}`;
    if(!pmStates[pmId]) initPM(pmId);
    const p=pmStates[pmId];
    if(Math.random()>=0.95) p.s=wPick(PM_W);
    p.opCount+=randInt(0,2);
    let alertObj=null;
    if(p.s==="FAULT"){
      p.motorCurrent=clamp(p.motorCurrent+rand(0.5,2.0),6.0,12.0);
      p.voltage=clamp(p.voltage+rand(-8,-2),85,110);
      p.strokeTime=clamp(p.strokeTime+rand(500,2000),3000,12000);
      p.position="INTERMEDIATE";
      alertObj={code:"POINT_FAULT",severity:"CRITICAL",message:`PM ${localId}: stuck throw (${Math.round(p.strokeTime)} ms, ${Math.round(p.motorCurrent*10)/10} A)`};
    } else if(p.s==="WARNING"){
      p.motorCurrent=clamp(p.motorCurrent+rand(0.1,0.5),2.0,6.0);
      p.voltage=clamp(p.voltage+rand(-3,1),100,115);
      p.strokeTime=clamp(p.strokeTime+rand(200,800),3000,6500);
      p.position=Math.random()>0.5?"NORMAL":"REVERSE";
      alertObj={code:"POINT_SLOW",severity:"HIGH",message:`PM ${localId}: slow operation (${Math.round(p.strokeTime)} ms)`};
    } else {
      p.motorCurrent=clamp(p.motorCurrent+rand(-0.2,0.2),1.8,3.0);
      p.voltage=clamp(p.voltage+rand(-1,1),108,115);
      p.strokeTime=clamp(p.strokeTime+rand(-100,100),3000,3500);
      p.position=Math.random()>0.5?"NORMAL":"REVERSE";
    }
    p.motorCurrent=Math.round(p.motorCurrent*10)/10;
    p.voltage=Math.round(p.voltage);
    p.strokeTime=Math.round(p.strokeTime);
    return { pmId, localId, depotId, state:p.s, motorCurrent:p.motorCurrent,
      voltage:p.voltage, strokeTime:p.strokeTime, position:p.position,
      opCount:p.opCount, alert:alertObj, timestamp:new Date().toISOString() };
  });
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

  // Register depots & publish initial PM states
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

  // Point machine publish loop — every 3 ticks (6 s) per depot
  let pmTick = 0;
  // Round-robin publish loop — one train from each depot per tick
  const counters = {};
  for (const d of DEPOTS) counters[d.id] = 0;

  setInterval(() => {
    pmTick++;
    for (const d of DEPOTS) {
      // Train telemetry
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

      // Publish all point machines for this depot every 3rd tick
      if(pmTick % 3 === 0){
        const pms = tickPM(d.id);
        for(const pm of pms){
          client.publish(
            `healthhub/depot/${d.id}/pointmachine/${pm.pmId}`,
            JSON.stringify(pm), { qos:1 }
          );
        }
      }
    }
  }, INTERVAL);
});

client.on("error",     (e) => console.error("MQTT error:", e.message));
client.on("reconnect", ()  => console.log("Reconnecting…"));

process.on("SIGINT", () => { console.log("\nStopping…"); client.end(true, ()=>process.exit(0)); });
