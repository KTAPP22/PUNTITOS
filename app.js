// 1. Vinculación de Librerías Globales Preact & HTM (Soporte file:// y http://)
const { h, render } = window.preact;
const { useState, useEffect, useRef } = window.preactHooks;
const html = window.htm.bind(h);

// 2. Auxiliares de formato de tiempo
function formatLapTime(ms) {
  if (!ms || isNaN(ms)) return '--.--';
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(3);
  return minutes > 0 ? `${minutes}:${seconds.padStart(6, '0')}` : seconds;
}

// Rangos de tiempos configurados en base al rendimiento (Tier) en español
const TIER_RANGES = {
  'Rápido': { min: 45000, max: 46800 },
  'Medio': { min: 47000, max: 49500 },
  'Lento': { min: 50000, max: 54000 }
};

// 3. Servicio de Simulación Live Timing (Filas y slots dinámicos con idioma español)
class ApexService {
  constructor() {
    this.subscribers = new Set();
    this.session = {
      id: "session-2026-07-21",
      trackName: "Henakart Live",
      trackLength: "1,120m",
      sessionType: "Prácticas Libres",
      timeRemaining: 900,
      weather: "SECO",
      status: "GREEN"
    };

    this.drivers = [
      { id: "1", name: "Marc Gené Jr", kart: "4", tier: "Rápido", bestLap: 45210, lastLap: 45430, currentLapNum: 8, sector: 1, s1: 15020, s2: 15110, s3: 15300, currentLapStart: Date.now(), speed: 78, gap: 0, status: "TRACK" },
      { id: "2", name: "Carlos Sainz III", kart: "1", tier: "Rápido", bestLap: 45450, lastLap: 45670, currentLapNum: 8, sector: 2, s1: 15150, s2: 15200, s3: 0, currentLapStart: Date.now() - 15000, speed: 82, gap: 240, status: "TRACK" },
      { id: "3", name: "A. Albon (Sim)", kart: "2", tier: "Medio", bestLap: 47210, lastLap: 47550, currentLapNum: 7, sector: 3, s1: 15800, s2: 15900, s3: 0, currentLapStart: Date.now() - 31000, speed: 65, gap: 2000, status: "TRACK" },
      { id: "4", name: "L. Hamilton (Sim)", kart: "3", tier: "Lento", bestLap: 50920, lastLap: 51220, currentLapNum: 6, sector: 1, s1: 17200, s2: 0, s3: 0, currentLapStart: Date.now() - 5000, speed: 58, gap: 5710, status: "TRACK" },
      { id: "5", name: "M. Verstappen (Sim)", kart: "8", tier: "Medio", bestLap: 47890, lastLap: 48100, currentLapNum: 7, sector: 2, s1: 16100, s2: 16200, s3: 0, currentLapStart: Date.now() - 20000, speed: 70, gap: 2680, status: "TRACK" }
    ];

    // Cantidad inicial de filas (Lanes) y karts por fila
    this.numLanes = 2;
    this.numSlots = 4;

    this.pitLanes = {
      L1: [
        { kart: "1", tier: "Rápido" },
        { kart: "2", tier: "Medio" },
        { kart: "3", tier: "Lento" },
        { kart: "4", tier: "Rápido" }
      ],
      L2: [
        { kart: "1", tier: "Medio" },
        { kart: "2", tier: "Lento" },
        { kart: "3", tier: "Medio" },
        { kart: "4", tier: "Medio" }
      ]
    };

    this.timerId = null;
    this.startSimulation();
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    callback(this.getPayload());
    return () => this.subscribers.delete(callback);
  }

  emit() {
    const payload = this.getPayload();
    this.subscribers.forEach(cb => cb(payload));
  }

  getPayload() {
    return {
      session: { ...this.session },
      drivers: JSON.parse(JSON.stringify(this.drivers)),
      pitLanes: JSON.parse(JSON.stringify(this.pitLanes)),
      numLanes: this.numLanes,
      numSlots: this.numSlots
    };
  }

  setPitLaneLayout(numLanes, numSlots) {
    this.numLanes = Math.max(1, Math.min(6, numLanes)); // Límite seguro para pantallas móviles (1-6)
    this.numSlots = Math.max(1, Math.min(8, numSlots)); // Límite seguro para pantallas móviles (1-8)
    
    const newPitLanes = {};
    for (let i = 1; i <= this.numLanes; i++) {
      const laneKey = `L${i}`;
      const oldLane = this.pitLanes[laneKey] || [];
      const newLane = [];
      for (let j = 0; j < this.numSlots; j++) {
        newLane.push(oldLane[j] !== undefined ? oldLane[j] : null);
      }
      newPitLanes[laneKey] = newLane;
    }
    
    this.pitLanes = newPitLanes;
    this.emit();
  }

  updateKartTier(kartNumber, newTier) {
    const driver = this.drivers.find(d => d.kart === kartNumber);
    if (driver) driver.tier = newTier;
    
    for (let lane of Object.keys(this.pitLanes)) {
      const idx = this.pitLanes[lane].findIndex(k => k && k.kart === kartNumber);
      if (idx !== -1) {
        this.pitLanes[lane][idx].tier = newTier;
      }
    }
    this.emit();
  }

  addKartToPitLane(lane, kartNumber, tier, slot = null) {
    this.removeKartFromPitLane(kartNumber);
    
    const newKart = { kart: kartNumber, tier: tier };
    if (slot !== null && slot >= 0 && slot < this.numSlots) {
      this.pitLanes[lane][slot] = newKart;
    } else {
      this.pitLanes[lane].push(newKart);
      if (this.pitLanes[lane].length > this.numSlots) {
        this.pitLanes[lane].shift();
      }
    }
    
    const driver = this.drivers.find(d => d.kart === kartNumber);
    if (driver) {
      driver.status = "PIT";
      driver.speed = 0;
    }
    this.emit();
  }

  removeKartFromPitLane(kartNumber) {
    for (let lane of Object.keys(this.pitLanes)) {
      const idx = this.pitLanes[lane].findIndex(k => k && k.kart === kartNumber);
      if (idx !== -1) {
        this.pitLanes[lane][idx] = null;
      }
    }
    this.emit();
  }

  releaseKartToTrack(kartNumber, driverName) {
    let tier = "Medio";
    for (let lane of Object.keys(this.pitLanes)) {
      const kartObj = this.pitLanes[lane].find(k => k && k.kart === kartNumber);
      if (kartObj) {
        tier = kartObj.tier;
        break;
      }
    }
    
    this.removeKartFromPitLane(kartNumber);
    
    let driver = this.drivers.find(d => d.kart === kartNumber);
    if (driver) {
      driver.status = "TRACK";
      driver.currentLapStart = Date.now();
      driver.sector = 1;
      driver.s1 = 0;
      driver.s2 = 0;
      driver.s3 = 0;
    } else {
      const id = String(this.drivers.length + 1);
      this.drivers.push({
        id,
        name: driverName,
        kart: kartNumber,
        tier: tier,
        bestLap: 0,
        lastLap: 0,
        currentLapNum: 1,
        sector: 1,
        s1: 0,
        s2: 0,
        s3: 0,
        currentLapStart: Date.now(),
        speed: 40,
        gap: 0,
        status: "TRACK"
      });
    }
    this.emit();
  }

  startSimulation() {
    this.timerId = setInterval(() => {
      if (this.session.timeRemaining > 0) {
        this.session.timeRemaining--;
      } else {
        this.session.status = "CHECKERED";
      }

      this.drivers.forEach(driver => {
        if (driver.status === "PIT") return;

        driver.speed = Math.floor(55 + Math.random() * 35);
        const elapsed = Date.now() - driver.currentLapStart;
        const range = TIER_RANGES[driver.tier];
        const estimatedLapTime = range.min + (range.max - range.min) * 0.5;
        const secDuration = estimatedLapTime / 3;

        if (driver.sector === 1 && elapsed >= secDuration) {
          driver.s1 = Math.floor(secDuration + (Math.random() - 0.5) * 800);
          driver.sector = 2;
        } else if (driver.sector === 2 && elapsed >= secDuration * 2) {
          driver.s2 = Math.floor(secDuration + (Math.random() - 0.5) * 800);
          driver.sector = 3;
        } else if (driver.sector === 3 && elapsed >= estimatedLapTime) {
          driver.s3 = Math.floor(secDuration + (Math.random() - 0.5) * 800);
          const totalLapTime = driver.s1 + driver.s2 + driver.s3;
          
          driver.lastLap = totalLapTime;
          driver.currentLapNum++;
          
          if (driver.bestLap === 0 || totalLapTime < driver.bestLap) {
            driver.bestLap = totalLapTime;
          }

          driver.sector = 1;
          driver.s1 = 0;
          driver.s2 = 0;
          driver.s3 = 0;
          driver.currentLapStart = Date.now();
        }
      });

      this.recalculateStandings();
      this.emit();
    }, 1000);
  }

  recalculateStandings() {
    const rankedDrivers = this.drivers
      .filter(d => d.bestLap > 0)
      .sort((a, b) => a.bestLap - b.bestLap);

    rankedDrivers.forEach((driver, index) => {
      const origDriver = this.drivers.find(d => d.id === driver.id);
      if (origDriver) {
        origDriver.gap = index === 0 ? 0 : driver.bestLap - rankedDrivers[0].bestLap;
      }
    });
  }
}

const apexService = new ApexService();

// 4. Componente Navigation (Totalmente en español)
function Navigation({ sessionData }) {
  const formatSeconds = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'GREEN':
        return html`<span class="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 text-[9px] font-extrabold animate-pulse">EN VIVO</span>`;
      case 'YELLOW':
        return html`<span class="px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-[9px] font-extrabold">BANDERA AMARILLA</span>`;
      case 'RED':
        return html`<span class="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] font-extrabold">SESIÓN DETENIDA</span>`;
      case 'CHECKERED':
        return html`<span class="px-1.5 py-0.5 rounded bg-white/10 text-white border border-white/20 text-[9px] font-extrabold">FINALIZADO</span>`;
      default:
        return null;
    }
  };

  return html`
    <header class="bg-[#000000] border-b border-[#111111] px-4 py-3 flex items-center justify-between flex-shrink-0 safe-top">
      <div class="flex items-center space-x-2">
        <span class="text-neonYellow font-extrabold text-base tracking-tighter">PITGUIDE</span>
        <span class="text-[9px] font-bold text-gray-500 tracking-wider bg-[#0E0E10] border border-gray-800 rounded px-1.5 py-0.5">${sessionData.trackName}</span>
      </div>
      
      <div class="flex items-center space-x-3">
        <div class="text-right">
          <span class="text-[8px] font-bold text-gray-500 block uppercase">Tiempo</span>
          <span class="text-sm font-bold font-mono text-white tracking-tight mono-num">${formatSeconds(sessionData.timeRemaining)}</span>
        </div>
        ${getStatusBadge(sessionData.status)}
      </div>
    </header>
  `;
}

// 5. Componente PitLanes (Españolizado y con colores Verde/Naranja/Rojo)
function PitLanes({ data }) {
  const { pitLanes, numLanes, numSlots } = data;
  const [selectedKart, setSelectedKart] = useState(null);
  const [newKartNum, setNewKartNum] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModeLane, setAddModeLane] = useState("L1");
  const [addModeSlot, setAddModeSlot] = useState(0);

  // Paleta de colores solicitada: Rápido = Verde, Medio = Naranja, Lento = Rojo
  const tierColors = {
    'Rápido': {
      bg: 'bg-[#39FF14] shadow-[0_0_12px_rgba(57,255,20,0.4)]',
      text: 'text-black font-extrabold'
    },
    'Medio': {
      bg: 'bg-[#FF8C00] shadow-[0_0_12px_rgba(255,140,0,0.4)]',
      text: 'text-black font-extrabold'
    },
    'Lento': {
      bg: 'bg-[#FF3131] shadow-[0_0_12px_rgba(255,49,49,0.4)]',
      text: 'text-black font-extrabold'
    }
  };

  const handleSlotClick = (lane, slotIndex, kartObj) => {
    if (kartObj) {
      setSelectedKart({
        lane,
        slotIndex,
        kartNumber: kartObj.kart,
        tier: kartObj.tier
      });
    } else {
      setAddModeLane(lane);
      setAddModeSlot(slotIndex);
      setNewKartNum("");
      setShowAddModal(true);
    }
  };

  const handleAddKartSubmit = (e) => {
    e.preventDefault();
    if (!newKartNum.trim()) return;
    
    const defaultTier = selectedKart ? selectedKart.tier : "Medio";
    apexService.addKartToPitLane(addModeLane, newKartNum.trim(), defaultTier, addModeSlot);
    
    setSelectedKart({
      lane: addModeLane,
      slotIndex: addModeSlot,
      kartNumber: newKartNum.trim(),
      tier: defaultTier
    });
    
    setShowAddModal(false);
  };

  const handleTierChange = (newTier) => {
    if (!selectedKart) return;
    apexService.updateKartTier(selectedKart.kartNumber, newTier);
    setSelectedKart(prev => ({ ...prev, tier: newTier }));
  };

  const handleManualExit = () => {
    if (!selectedKart) return;
    const driverName = prompt("Nombre del piloto (opcional):", `Piloto Kart ${selectedKart.kartNumber}`) || `Piloto ${selectedKart.kartNumber}`;
    apexService.releaseKartToTrack(selectedKart.kartNumber, driverName);
    setSelectedKart(null);
  };

  const moveSelectedToLane = (lane) => {
    if (!selectedKart) return;
    const currentKart = selectedKart.kartNumber;
    const currentTier = selectedKart.tier;
    
    let emptySlotIdx = pitLanes[lane].findIndex(slot => slot === null);
    if (emptySlotIdx === -1) emptySlotIdx = null;
    
    apexService.addKartToPitLane(lane, currentKart, currentTier, emptySlotIdx);
    
    const newLaneData = apexService.pitLanes[lane];
    const newIdx = newLaneData.findIndex(k => k && k.kart === currentKart);
    setSelectedKart({
      lane,
      slotIndex: newIdx !== -1 ? newIdx : 0,
      kartNumber: currentKart,
      tier: currentTier
    });
  };

  const adjustLanes = (delta) => {
    apexService.setPitLaneLayout(numLanes + delta, numSlots);
    setSelectedKart(null);
  };

  const adjustSlots = (delta) => {
    apexService.setPitLaneLayout(numLanes, numSlots + delta);
    setSelectedKart(null);
  };

  const slotIndices = Array.from({ length: numSlots }, (_, i) => i);
  const laneBoxHeight = numSlots * 52 + 20;

  return html`
    <div class="flex-1 flex flex-col h-full bg-[#000000] p-4 text-white overflow-y-auto no-scrollbar justify-between">
      
      <!-- HEADER SECCIÓN -->
      <div class="flex items-center justify-between border-b border-[#111] pb-3 mb-2 flex-shrink-0">
        <div>
          <span class="text-[10px] uppercase tracking-widest text-[#555] font-bold">Configuración</span>
          <h2 class="text-lg font-extrabold text-white tracking-tight">CARRIL DE BOXES</h2>
        </div>
        
        <!-- Legend (Español y Colores Actualizados) -->
        <div class="flex items-center space-x-3 text-[10px] font-bold tracking-wider uppercase text-[#888]">
          <div class="flex items-center space-x-1">
            <span class="w-2.5 h-2.5 rounded-full bg-[#39FF14] inline-block"></span>
            <span>RÁPIDO</span>
          </div>
          <div class="flex items-center space-x-1">
            <span class="w-2.5 h-2.5 rounded-full bg-[#FF8C00] inline-block"></span>
            <span>MEDIO</span>
          </div>
          <div class="flex items-center space-x-1">
            <span class="w-2.5 h-2.5 rounded-full bg-[#FF3131] inline-block"></span>
            <span>LENTO</span>
          </div>
        </div>
      </div>

      <!-- PANEL DE CONTROL DINÁMICO DE FILAS Y KARTS -->
      <div class="bg-[#0E0E10] border border-gray-900/60 rounded-xl p-3 flex items-center justify-around mb-4 flex-shrink-0">
        <!-- Control de Filas -->
        <div class="flex flex-col items-center">
          <span class="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest mb-1.5">Filas (Carriles)</span>
          <div class="flex items-center space-x-2">
            <button 
              type="button" 
              onClick=${() => adjustLanes(-1)} 
              disabled=${numLanes <= 1}
              class="w-7 h-7 bg-black border border-gray-800 rounded-lg flex items-center justify-center text-sm font-extrabold text-neonRed disabled:opacity-30 disabled:pointer-events-none hover:bg-gray-950 transition-all"
            >
              -
            </button>
            <span class="text-base font-black font-mono w-4 text-center text-white">${numLanes}</span>
            <button 
              type="button" 
              onClick=${() => adjustLanes(1)} 
              disabled=${numLanes >= 6}
              class="w-7 h-7 bg-black border border-gray-800 rounded-lg flex items-center justify-center text-sm font-extrabold text-neonGreen disabled:opacity-30 disabled:pointer-events-none hover:bg-gray-950 transition-all"
            >
              +
            </button>
          </div>
        </div>

        <div class="h-8 w-[1px] bg-gray-900"></div>

        <!-- Control de Karts por Fila -->
        <div class="flex flex-col items-center">
          <span class="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest mb-1.5">Karts / Fila</span>
          <div class="flex items-center space-x-2">
            <button 
              type="button" 
              onClick=${() => adjustSlots(-1)} 
              disabled=${numSlots <= 1}
              class="w-7 h-7 bg-black border border-gray-800 rounded-lg flex items-center justify-center text-sm font-extrabold text-neonRed disabled:opacity-30 disabled:pointer-events-none hover:bg-gray-950 transition-all"
            >
              -
            </button>
            <span class="text-base font-black font-mono w-4 text-center text-white">${numSlots}</span>
            <button 
              type="button" 
              onClick=${() => adjustSlots(1)} 
              disabled=${numSlots >= 8}
              class="w-7 h-7 bg-black border border-gray-800 rounded-lg flex items-center justify-center text-sm font-extrabold text-neonGreen disabled:opacity-30 disabled:pointer-events-none hover:bg-gray-950 transition-all"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <!-- LANES CONTAINER DINÁMICO -->
      <div class="flex-1 flex justify-around items-center py-4 min-h-[220px] overflow-x-auto no-scrollbar gap-4">
        ${Object.keys(pitLanes).map(laneKey => {
          const laneData = pitLanes[laneKey];
          return html`
            <div class="flex flex-col items-center space-y-2 w-[76px] flex-shrink-0">
              <span class="text-xs font-bold text-gray-500 flex items-center space-x-0.5">
                <span>${laneKey}</span>
                <span class="text-[9px] text-red-500">▼ ENTRA</span>
              </span>
              
              <div 
                class="w-[66px] bg-[#0E0E10] border border-[#1a1a20] rounded-xl flex flex-col-reverse items-center justify-start p-2.5 py-3.5 space-y-3.5 space-y-reverse shadow-inner relative transition-all duration-300"
                style="height: ${laneBoxHeight}px"
              >
                ${slotIndices.map(slotIdx => {
                  const kartObj = laneData[slotIdx];
                  const isSelected = selectedKart && selectedKart.lane === laneKey && selectedKart.slotIndex === slotIdx;
                  
                  if (kartObj) {
                    const styles = tierColors[kartObj.tier];
                    return html`
                      <button 
                        type="button"
                        onClick=${() => handleSlotClick(laneKey, slotIdx, kartObj)}
                        class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-extrabold transition-all duration-200 transform hover:scale-105 active:scale-95 z-10
                          ${styles.bg} ${styles.text} 
                          ${isSelected ? 'ring-4 ring-white border border-black animate-pulse' : 'border border-transparent'}"
                      >
                        ${kartObj.kart}
                      </button>
                    `;
                  } else {
                    return html`
                      <button 
                        type="button"
                        onClick=${() => handleSlotClick(laneKey, slotIdx, null)}
                        class="w-10 h-10 rounded-full border border-dashed border-gray-800 flex items-center justify-center text-gray-600 text-xs hover:border-gray-500 hover:text-gray-400 transition-all z-10"
                      >
                        +
                      </button>
                    `;
                  }
                })}
              </div>
              <span class="text-[9px] font-bold text-red-500">▼ SALE</span>
            </div>
          `;
        })}
      </div>

      <!-- AUTO / SELECCIONAR TOGGLE -->
      <div class="grid grid-cols-2 gap-2 mb-3 mt-4 flex-shrink-0">
        <button type="button" class="flex items-center justify-center space-x-1 py-2 rounded bg-green-950/40 border border-green-800/60 text-green-400 text-xs font-bold shadow-sm">
          <span>⚡</span>
          <span>Auto</span>
        </button>
        <button type="button" class="flex items-center justify-center space-x-1 py-2 rounded bg-[#0E0E10] border border-gray-800 text-gray-400 text-xs font-bold">
          <span>👇</span>
          <span>Elegir</span>
        </button>
      </div>

      <!-- RENDIMIENTO KART (Verde / Naranja / Rojo) -->
      <div class="mb-4 flex-shrink-0">
        <span class="text-[9px] uppercase tracking-wider text-[#555] font-extrabold block mb-1">RENDIMIENTO KART</span>
        <div class="grid grid-cols-3 gap-2">
          <button 
            type="button"
            disabled=${!selectedKart}
            onClick=${() => handleTierChange('Rápido')}
            class="flex items-center justify-center space-x-1.5 py-3 rounded-lg border text-xs font-bold transition-all
              ${!selectedKart ? 'opacity-40 border-[#111] bg-black text-[#444]' : 
                selectedKart.tier === 'Rápido' ? 'border-[#39FF14] bg-[#39FF14]/10 text-[#39FF14]' : 'border-[#1A1A22] bg-[#0E0E10] text-[#888]'}"
          >
            <span class="w-2 h-2 rounded-full bg-[#39FF14]"></span>
            <span>Rápido</span>
          </button>
          
          <button 
            type="button"
            disabled=${!selectedKart}
            onClick=${() => handleTierChange('Medio')}
            class="flex items-center justify-center space-x-1.5 py-3 rounded-lg border text-xs font-bold transition-all
              ${!selectedKart ? 'opacity-40 border-[#111] bg-black text-[#444]' : 
                selectedKart.tier === 'Medio' ? 'border-[#FF8C00] bg-[#FF8C00]/10 text-[#FF8C00]' : 'border-[#1A1A22] bg-[#0E0E10] text-[#888]'}"
          >
            <span class="w-2 h-2 rounded-full bg-[#FF8C00]"></span>
            <span>Medio</span>
          </button>
          
          <button 
            type="button"
            disabled=${!selectedKart}
            onClick=${() => handleTierChange('Lento')}
            class="flex items-center justify-center space-x-1.5 py-3 rounded-lg border text-xs font-bold transition-all
              ${!selectedKart ? 'opacity-40 border-[#111] bg-black text-[#444]' : 
                selectedKart.tier === 'Lento' ? 'border-[#FF3131] bg-[#FF3131]/10 text-[#FF3131]' : 'border-[#1A1A22] bg-[#0E0E10] text-[#888]'}"
          >
            <span class="w-2 h-2 rounded-full bg-[#FF3131]"></span>
            <span>Lento</span>
          </button>
        </div>
      </div>

      <!-- CAMBIAR CARRIL -->
      <div class="mb-4 flex-shrink-0">
        <span class="text-[9px] uppercase tracking-wider text-[#555] font-extrabold block mb-1">CAMBIAR CARRIL</span>
        <div class="flex flex-wrap gap-2">
          ${Object.keys(pitLanes).map(laneKey => html`
            <button 
              type="button"
              disabled=${!selectedKart}
              onClick=${() => moveSelectedToLane(laneKey)}
              class="flex-1 min-w-[60px] py-2.5 rounded-lg border text-xs font-bold transition-all
                ${!selectedKart ? 'opacity-40 border-[#111] bg-black text-[#444]' : 
                  selectedKart.lane === laneKey ? 'border-white bg-[#1A1A22] text-white' : 'border-[#1A1A22] bg-[#0E0E10] text-[#888]'}"
            >
              ${laneKey}
            </button>
          `)}
        </div>
      </div>

      <!-- BOTTOM ACTION (Salida manual a Pista) -->
      <div class="flex items-center space-x-2 flex-shrink-0">
        <button 
          type="button"
          disabled=${!selectedKart}
          onClick=${handleManualExit}
          class="flex-1 flex items-center justify-center space-x-2 py-3.5 rounded-lg border font-bold text-sm tracking-wide transition-all duration-150
            ${!selectedKart ? 'border-[#1A1A22] bg-[#0A0A0C] text-gray-700' : 
              'border-[#FF3131]/30 bg-red-950/20 text-[#FF3131] hover:bg-red-950/40 shadow-[0_0_15px_rgba(255,49,49,0.1)] active:scale-[0.98]'}"
        >
          <span>🏎️</span>
          <span>Salida a Pista (Manual)</span>
        </button>
        ${selectedKart && html`
          <button 
            type="button"
            onClick=${() => {
              apexService.removeKartFromPitLane(selectedKart.kartNumber);
              setSelectedKart(null);
            }}
            class="px-4 py-3.5 rounded-lg border border-gray-800 bg-[#0E0E10] text-gray-400 hover:text-white"
          >
            🗑️
          </button>
        `}
      </div>

      <!-- MODAL PARA AGREGAR KART -->
      ${showAddModal && html`
        <div class="fixed inset-0 bg-black/85 flex items-center justify-center p-6 z-50 backdrop-blur-sm">
          <form onSubmit=${handleAddKartSubmit} class="w-full max-w-xs bg-[#0E0E10] border border-[#1a1a20] rounded-xl p-5 shadow-2xl">
            <h3 class="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">Agregar Kart a ${addModeLane}</h3>
            
            <div class="mb-4">
              <label class="block text-xs font-semibold text-gray-500 mb-1">NÚMERO DE KART</label>
              <input 
                type="number" 
                pattern="[0-9]*"
                inputmode="numeric"
                required
                value=${newKartNum}
                onInput=${(e) => setNewKartNum(e.target.value)}
                class="w-full bg-black border border-gray-800 rounded-lg p-3 text-center text-2xl font-extrabold text-white focus:outline-none focus:border-green-500"
                placeholder="0"
                autoFocus
              />
            </div>
            
            <div class="flex space-x-2">
              <button 
                type="button" 
                onClick=${() => setShowAddModal(false)}
                class="flex-1 py-2.5 border border-gray-800 text-gray-400 text-xs font-bold rounded-lg"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                class="flex-1 py-2.5 bg-green-500 text-black text-xs font-extrabold rounded-lg"
              >
                Agregar
              </button>
            </div>
          </form>
        </div>
      `}

    </div>
  `;
}

// 6. Componente App principal
function App() {
  const [liveData, setLiveData] = useState({
    session: { trackName: 'Cargando...', timeRemaining: 0, status: 'GREEN' },
    drivers: [],
    pitLanes: { L1: [], L2: [] },
    numLanes: 2,
    numSlots: 4
  });

  useEffect(() => {
    const unsubscribe = apexService.subscribe((newData) => {
      setLiveData(newData);
    });
    return () => unsubscribe();
  }, []);

  return html`
    <div class="h-full w-full flex flex-col justify-between bg-black overflow-hidden select-none">
      <${Navigation} sessionData=${liveData.session} />
      <main class="flex-1 overflow-hidden flex flex-col bg-black relative">
        <${PitLanes} data=${liveData} />
      </main>
    </div>
  `;
}

// 7. Montar en el DOM
render(h(App), document.getElementById('root'));
