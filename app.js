// 1. Vinculación de Librerías Globales Preact & HTM (Soporte file:// y http://)
const { h, render } = window.preact;
const { useState, useEffect, useRef } = window.preactHooks;
const html = window.htm.bind(h);

// Mapeo de Circuitos a sus enlaces de Apex Live Timing correspondientes
const TRACK_TIMINGS = {
  "Lucas Guerrero": "https://live.apex-timing.com/kartodromo-lucas-guerrero/"
  // En el futuro se pueden añadir más circuitos aquí
};

// 3. Servicio de Live Timing (Filas y slots dinámicos con encolamiento y persistencia)
class ApexService {
  constructor() {
    this.subscribers = new Set();
    this.session = {
      id: "session-2026-07-21",
      trackName: localStorage.getItem('pitguide_trackName') || "Lucas Guerrero", // Persistencia del circuito
      trackLength: "1,428m",
      sessionType: "Prácticas Libres",
      timeRemaining: 900,
      weather: "SECO",
      status: "GREEN"
    };

    // Cargar del LocalStorage o usar valores por defecto
    const savedLanes = localStorage.getItem('pitguide_lanes');
    const savedSlots = localStorage.getItem('pitguide_slots');
    const savedPitLanes = localStorage.getItem('pitguide_pitLanes');

    this.numLanes = savedLanes ? parseInt(savedLanes, 10) : 2;
    this.numSlots = savedSlots ? parseInt(savedSlots, 10) : 4;

    if (savedPitLanes) {
      try {
        this.pitLanes = JSON.parse(savedPitLanes);
      } catch (e) {
        this.pitLanes = this.getDefaultPitLanes();
      }
    } else {
      this.pitLanes = this.getDefaultPitLanes();
    }
  }

  getDefaultPitLanes() {
    return {
      L1: [
        { tier: "Rápido" },
        { tier: "Medio" },
        { tier: "Lento" },
        { tier: "Rápido" }
      ],
      L2: [
        { tier: "Medio" },
        { tier: "Lento" },
        { tier: "Medio" },
        { tier: "Medio" }
      ]
    };
  }

  // Obtiene el enlace de live timing correspondiente al circuito cargado
  getTrackTimingUrl() {
    return TRACK_TIMINGS[this.session.trackName] || "https://live.apex-timing.com/kartodromo-lucas-guerrero/";
  }

  // Guarda la configuración y estado actual en LocalStorage de forma persistente
  saveToLocalStorage() {
    localStorage.setItem('pitguide_lanes', String(this.numLanes));
    localStorage.setItem('pitguide_slots', String(this.numSlots));
    localStorage.setItem('pitguide_pitLanes', JSON.stringify(this.pitLanes));
  }

  // Modifica el circuito seleccionado y lo guarda en LocalStorage
  setTrackName(name) {
    this.session.trackName = name;
    localStorage.setItem('pitguide_trackName', name);
    this.emit();
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
      pitLanes: JSON.parse(JSON.stringify(this.pitLanes)),
      numLanes: this.numLanes,
      numSlots: this.numSlots
    };
  }

  setPitLaneLayout(numLanes, numSlots) {
    this.numLanes = Math.max(1, Math.min(6, numLanes)); // Límite de 1 a 6 filas
    this.numSlots = Math.max(1, Math.min(8, numSlots)); // Límite de 1 a 8 slots
    
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
    this.saveToLocalStorage();
    this.emit();
  }

  // Agrega un kart al final de la fila (último lugar: índice numSlots - 1) desplazando el resto un puesto adelante
  pushKartToLane(lane, tier) {
    const laneData = this.pitLanes[lane];
    
    // Desplazamos todos los karts una posición hacia adelante (hacia la salida, índice 0)
    for (let i = 0; i < this.numSlots - 1; i++) {
      laneData[i] = laneData[i + 1];
    }
    
    // Insertamos el nuevo kart en el último lugar (entrada, índice numSlots - 1)
    laneData[this.numSlots - 1] = { tier: tier };
    
    this.saveToLocalStorage();
    this.emit();
  }

  // Modifica el tier de un kart por su carril y índice de ranura
  updateKartTierAtSlot(lane, slotIndex, newTier) {
    if (this.pitLanes[lane] && this.pitLanes[lane][slotIndex]) {
      this.pitLanes[lane][slotIndex].tier = newTier;
      this.saveToLocalStorage();
      this.emit();
    }
  }

  // Elimina un kart de una posición específica
  removeKartAtSlot(lane, slotIndex) {
    if (this.pitLanes[lane]) {
      this.pitLanes[lane][slotIndex] = null;
      this.saveToLocalStorage();
      this.emit();
    }
  }
}

const apexService = new ApexService();

// 4. Componente Navigation (Cabecera con logo morado y selector de circuito interactivo en la derecha)
function Navigation({ trackName, onTrackClick }) {
  return html`
    <header class="bg-[#000000] border-b border-[#111111] px-4 py-3 flex items-center justify-between flex-shrink-0 safe-top">
      <span class="text-[#B026FF] font-extrabold text-lg tracking-tighter">PITGUIDE</span>
      <button 
        type="button"
        onClick=${onTrackClick}
        class="flex items-center space-x-1 px-2.5 py-1 rounded-md border border-gray-800 bg-[#0E0E10] text-[9.5px] font-extrabold hover:border-gray-500 text-gray-300 transition-all duration-150 active:scale-[0.97]"
      >
        <span>🏁</span>
        <span class="text-white">${trackName || 'Seleccionar Circuito'}</span>
      </button>
    </header>
  `;
}

// 5. Componente PitLanes (Enumeración del 1 al total de karts en cada carril)
function PitLanes({ data, onAddClick, selectedKart, setSelectedKart }) {
  const { pitLanes, numLanes, numSlots } = data;

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

  // Función para obtener el número de kart dinámico (de 1 al total de karts en la fila)
  const getDynamicKartNumber = (laneKey, slotIdx) => {
    const laneData = pitLanes[laneKey];
    if (!laneData || laneData[slotIdx] === null) return 0;
    
    let count = 0;
    for (let i = 0; i <= slotIdx; i++) {
      if (laneData[i] !== null) {
        count++;
      }
    }
    return count;
  };

  // Obtiene el total de karts activos en una fila específica
  const getTotalKartsInLane = (laneKey) => {
    const laneData = pitLanes[laneKey];
    if (!laneData) return 0;
    return laneData.filter(slot => slot !== null).length;
  };

  // Manejar el clic en un kart para seleccionarlo y poder editarlo
  const handleSlotClick = (lane, slotIndex, kartObj) => {
    if (kartObj) {
      setSelectedKart({
        lane,
        slotIndex,
        tier: kartObj.tier
      });
    }
  };

  // Modifica el tier de un kart existente seleccionado
  const handleTierChange = (newTier) => {
    if (!selectedKart) return;
    apexService.updateKartTierAtSlot(selectedKart.lane, selectedKart.slotIndex, newTier);
    setSelectedKart(prev => ({ ...prev, tier: newTier }));
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
        
        <!-- Legend -->
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
          const totalInLane = getTotalKartsInLane(laneKey);
          return html`
            <div class="flex flex-col items-center space-y-2 w-[76px] flex-shrink-0">
              <span class="text-xs font-bold text-gray-500 flex flex-col items-center leading-none">
                <span>${laneKey}</span>
                <span class="text-[8px] text-gray-600 mt-1 uppercase font-mono">(${totalInLane} karts)</span>
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
                    const displayNum = getDynamicKartNumber(laneKey, slotIdx);
                    
                    return html`
                      <button 
                        type="button"
                        onClick=${() => handleSlotClick(laneKey, slotIdx, kartObj)}
                        class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-extrabold transition-all duration-200 transform hover:scale-105 active:scale-95 z-10
                          ${styles.bg} ${styles.text} 
                          ${isSelected ? 'ring-4 ring-white border border-black animate-pulse' : 'border border-transparent'}"
                      >
                        ${displayNum}
                      </button>
                    `;
                  } else {
                    return html`
                      <div class="w-10 h-10 rounded-full border border-dashed border-gray-800/30 flex items-center justify-center text-gray-800 text-[10px] select-none">
                        -
                      </div>
                    `;
                  }
                })}
              </div>
              <span class="text-[9px] font-bold text-red-500">▼ SALE</span>
            </div>
          `;
        })}
      </div>

      <!-- ESPACIADOR -->
      <div class="h-4 flex-shrink-0"></div>

      <!-- PANEL: AGREGAR NUEVO KART (Siempre activo, encolamiento automático al elegir fila) -->
      <div class="mb-4 mt-4 flex-shrink-0">
        <span class="text-[9px] uppercase tracking-wider text-[#555] font-extrabold block mb-1">AGREGAR NUEVO KART</span>
        <div class="grid grid-cols-3 gap-2">
          <button 
            type="button"
            onClick=${() => onAddClick('Rápido')}
            class="flex items-center justify-center space-x-1.5 py-3 rounded-lg border border-[#39FF14]/30 bg-[#39FF14]/5 text-[#39FF14] hover:bg-[#39FF14]/15 text-xs font-bold transition-all active:scale-[0.98]"
          >
            <span class="w-2.5 h-2.5 rounded-full bg-[#39FF14]"></span>
            <span>+ Rápido</span>
          </button>
          
          <button 
            type="button"
            onClick=${() => onAddClick('Medio')}
            class="flex items-center justify-center space-x-1.5 py-3 rounded-lg border border-[#FF8C00]/30 bg-[#FF8C00]/5 text-[#FF8C00] hover:bg-[#FF8C00]/15 text-xs font-bold transition-all active:scale-[0.98]"
          >
            <span class="w-2.5 h-2.5 rounded-full bg-[#FF8C00]"></span>
            <span>+ Medio</span>
          </button>
          
          <button 
            type="button"
            onClick=${() => onAddClick('Lento')}
            class="flex items-center justify-center space-x-1.5 py-3 rounded-lg border border-[#FF3131]/30 bg-[#FF3131]/5 text-[#FF3131] hover:bg-[#FF3131]/15 text-xs font-bold transition-all active:scale-[0.98]"
          >
            <span class="w-2.5 h-2.5 rounded-full bg-[#FF3131]"></span>
            <span>+ Lento</span>
          </button>
        </div>
      </div>

      <!-- PANEL DE KART SELECCIONADO (Solo visible al hacer clic en un kart de la fila) -->
      ${selectedKart && pitLanes[selectedKart.lane] && pitLanes[selectedKart.lane][selectedKart.slotIndex] ? html`
        <div class="bg-[#0E0E10] border border-gray-900 rounded-xl p-3.5 flex flex-col space-y-2.5 mb-2 flex-shrink-0 animate-fade-in">
          <div class="flex items-center justify-between">
            <span class="text-[9px] uppercase tracking-wider text-gray-500 font-extrabold">
              EDITAR KART #${getDynamicKartNumber(selectedKart.lane, selectedKart.slotIndex)} (FILA ${selectedKart.lane})
            </span>
            <button 
              type="button"
              onClick=${() => setSelectedKart(null)}
              class="text-[10px] font-bold text-gray-500 hover:text-white"
            >
              Cancelar
            </button>
          </div>
          
          <div class="grid grid-cols-3 gap-2">
            <button 
              type="button"
              onClick=${() => handleTierChange('Rápido')}
              class="py-2.5 rounded-lg border text-xs font-bold transition-all
                ${selectedKart.tier === 'Rápido' ? 'border-[#39FF14] bg-[#39FF14]/15 text-[#39FF14]' : 'border-[#1A1A22] bg-[#000000] text-gray-500'}"
            >
              Rápido
            </button>
            <button 
              type="button"
              onClick=${() => handleTierChange('Medio')}
              class="py-2.5 rounded-lg border text-xs font-bold transition-all
                ${selectedKart.tier === 'Medio' ? 'border-[#FF8C00] bg-[#FF8C00]/15 text-[#FF8C00]' : 'border-[#1A1A22] bg-[#000000] text-gray-500'}"
            >
              Medio
            </button>
            <button 
              type="button"
              onClick=${() => handleTierChange('Lento')}
              class="py-2.5 rounded-lg border text-xs font-bold transition-all
                ${selectedKart.tier === 'Lento' ? 'border-[#FF3131] bg-[#FF3131]/15 text-[#FF3131]' : 'border-[#1A1A22] bg-[#000000] text-gray-500'}"
            >
              Lento
            </button>
          </div>

          <button 
            type="button"
            onClick=${() => {
              apexService.removeKartAtSlot(selectedKart.lane, selectedKart.slotIndex);
              setSelectedKart(null);
            }}
            class="w-full py-2.5 bg-red-950/20 hover:bg-red-950/40 text-neonRed border border-neonRed/30 rounded-lg text-xs font-bold transition-all active:scale-[0.98]"
          >
            🗑️ Eliminar Kart de la Fila
          </button>
        </div>
      ` : html`
        <div class="h-[122px] flex items-center justify-center border border-dashed border-gray-900/50 rounded-xl text-gray-700 text-xs font-bold flex-shrink-0 select-none">
          Haz clic en un kart para editar su velocidad o eliminarlo
        </div>
      `}

    </div>
  `;
}

// 6. Componente App principal (Orquesta el menú de pestañas Boxes / Live Timing e incrusta el iframe)
function App() {
  const [liveData, setLiveData] = useState({
    session: { trackName: 'Lucas Guerrero', timeRemaining: 0, status: 'GREEN' },
    drivers: [],
    pitLanes: { L1: [], L2: [] },
    numLanes: 2,
    numSlots: 4
  });

  const [selectedKart, setSelectedKart] = useState(null);
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [showLaneModal, setShowLaneModal] = useState(false);
  const [modalTier, setModalTier] = useState("Rápido");
  
  // Pestaña activa ('boxes' para los carriles o 'timing' para el Live Timing embebido)
  const [activeTab, setActiveTab] = useState('boxes');

  useEffect(() => {
    const unsubscribe = apexService.subscribe((newData) => {
      setLiveData(newData);
    });
    return () => unsubscribe();
  }, []);

  const handleAddClick = (tier) => {
    setModalTier(tier);
    setShowLaneModal(true);
  };

  const selectLaneForAdd = (laneKey) => {
    apexService.pushKartToLane(laneKey, modalTier);
    setShowLaneModal(false);
    setSelectedKart(null);
  };

  // Obtiene el enlace actual de Apex Timing del circuito cargado
  const activeTimingUrl = apexService.getTrackTimingUrl();

  return html`
    <div class="h-full w-full flex flex-col justify-between bg-black overflow-hidden select-none">
      
      <!-- Cabecera -->
      <${Navigation} 
        trackName=${liveData.session.trackName} 
        onTrackClick=${() => setShowTrackModal(true)} 
      />

      <!-- Segmented Control de Pestañas (Boxes / Live Timing) -->
      <div class="px-3 py-1.5 bg-[#0E0E10] border-b border-[#111111]/80 flex space-x-1.5 flex-shrink-0">
        <button 
          type="button"
          onClick=${() => setActiveTab('boxes')}
          class="flex-1 py-1 text-center text-[10px] font-bold rounded-md transition-all active:scale-[0.98]
            ${activeTab === 'boxes' ? 'bg-[#B026FF] text-white shadow-sm' : 'bg-[#000000] text-gray-500 border border-gray-900/50 hover:text-gray-300'}"
        >
          Carril de Boxes
        </button>
        <button 
          type="button"
          onClick=${() => setActiveTab('timing')}
          class="flex-1 py-1 text-center text-[10px] font-bold rounded-md transition-all active:scale-[0.98]
            ${activeTab === 'timing' ? 'bg-[#B026FF] text-white shadow-sm' : 'bg-[#000000] text-gray-500 border border-gray-900/50 hover:text-gray-300'}"
        >
          Tiempos en Vivo
        </button>
      </div>
      
      <!-- Contenedor Principal Adaptativo -->
      <main class="flex-1 overflow-hidden flex flex-col bg-black relative">
        ${activeTab === 'boxes' 
          ? html`
              <${PitLanes} 
                data=${liveData} 
                onAddClick=${handleAddClick} 
                selectedKart=${selectedKart}
                setSelectedKart=${setSelectedKart}
              />
            `
          : html`
              <div class="flex-1 w-full h-full bg-black relative">
                <!-- Iframe del Live Timing de Apex del circuito elegido -->
                <iframe 
                  src="${activeTimingUrl}" 
                  class="w-full h-full border-0 bg-black" 
                  allow="fullscreen"
                  title="Live Timing"
                ></iframe>
              </div>
            `
        }
      </main>

      <!-- MODAL SELECTOR DE CIRCUITO -->
      ${showTrackModal && html`
        <div class="fixed inset-0 bg-black/85 flex items-center justify-center p-6 z-50 backdrop-blur-sm">
          <div class="w-full max-w-xs bg-[#0E0E10] border border-[#1a1a20] rounded-xl p-5 shadow-2xl">
            <h3 class="text-sm font-bold uppercase tracking-wider text-gray-400 mb-1 text-center">Seleccionar Circuito</h3>
            <p class="text-[10px] text-gray-600 mb-4 text-center">Elige el circuito de karting activo</p>
            
            <div class="space-y-2 mb-4">
              <button 
                type="button" 
                onClick=${() => {
                  apexService.setTrackName("Lucas Guerrero");
                  setShowTrackModal(false);
                }}
                class="w-full py-3 bg-black border border-gray-800 rounded-lg hover:border-[#B026FF] hover:text-[#B026FF] text-xs font-extrabold text-white text-left px-4 flex items-center justify-between transition-all"
              >
                <span>Lucas Guerrero</span>
                <span class="text-[10px] text-gray-500 font-normal">Chiva, Valencia</span>
              </button>
            </div>
            
            <button 
              type="button" 
              onClick=${() => setShowTrackModal(false)}
              class="w-full py-2.5 border border-gray-800 text-gray-500 text-xs font-bold rounded-lg hover:text-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      `}

      <!-- MODAL SELECTOR DE FILA (Para agregar Karts) -->
      ${showLaneModal && html`
        <div class="fixed inset-0 bg-black/85 flex items-center justify-center p-6 z-50 backdrop-blur-sm">
          <div class="w-full max-w-xs bg-[#0E0E10] border border-[#1a1a20] rounded-xl p-5 shadow-2xl">
            <h3 class="text-sm font-bold uppercase tracking-wider text-gray-400 mb-1 text-center">Seleccionar Fila</h3>
            <p class="text-[10px] text-gray-600 mb-4 text-center">¿En qué fila deseas encolar el Kart?</p>
            
            <div class="grid grid-cols-2 gap-2 mb-4">
              ${Object.keys(liveData.pitLanes).map(laneKey => html`
                <button 
                  type="button" 
                  onClick=${() => selectLaneForAdd(laneKey)}
                  class="py-3 bg-black border border-gray-800 rounded-lg hover:border-neonGreen hover:text-neonGreen text-sm font-extrabold text-white transition-all active:scale-[0.96]"
                >
                  ${laneKey}
                </button>
              `)}
            </div>
            
            <button 
              type="button" 
              onClick=${() => setShowLaneModal(false)}
              class="w-full py-2.5 border border-gray-800 text-gray-500 text-xs font-bold rounded-lg hover:text-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      `}
    </div>
  `;
}

// 7. Montar en el DOM
render(h(App), document.getElementById('root'));
