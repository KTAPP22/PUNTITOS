// 1. Configuración de Supabase (Reemplaza con tus credenciales para conectar en la nube)
const SUPABASE_URL = "TU_SUPABASE_URL";
const SUPABASE_ANON_KEY = "TU_SUPABASE_ANON_KEY";

// Vinculación de Librerías Globales Preact & HTM (Soporte file:// y http://)
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

const TIER_RANGES = {
  'Rápido': { min: 45000, max: 46800 },
  'Medio': { min: 47000, max: 49500 },
  'Lento': { min: 50000, max: 54000 }
};

const TRACK_TIMINGS = {
  "Lucas Guerrero": "https://live.apex-timing.com/kartodromo-lucas-guerrero/"
};

// 3. Mock de Base de Datos Supabase (Simulador Local con LocalStorage)
function createMockDb() {
  if (!localStorage.getItem('mock_users')) {
    const defaultUsers = [
      { id: "admin-1", email: "admin@.com", name: "Administrador Principal", role: "admin", is_active: true, password: "1234" },
      { id: "viewer-1", email: "piloto1@pitguide.com", name: "Marc Gené Jr", role: "viewer", is_active: true, password: "123" }
    ];
    localStorage.setItem('mock_users', JSON.stringify(defaultUsers));
  }

  const getUsers = () => JSON.parse(localStorage.getItem('mock_users'));
  const setUsers = (users) => localStorage.setItem('mock_users', JSON.stringify(users));

  return {
    isMock: true,
    auth: {
      listeners: [],
      async signUp({ email, password, options }) {
        const users = getUsers();
        if (users.find(u => u.email === email)) {
          return { data: null, error: { message: "El correo ya está registrado." } };
        }
        const name = options?.data?.name || "Usuario";
        // Si el correo es el admin, entra activo; si no, inactivo esperando aprobación
        const isAdminEmail = email.toLowerCase() === "admin@.com";
        const role = isAdminEmail ? "admin" : "viewer";
        const is_active = isAdminEmail ? true : false;
        
        const newUser = { id: 'u-' + Date.now(), email, password, name, role, is_active };
        users.push(newUser);
        setUsers(users);

        return { data: { user: newUser }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const users = getUsers();
        const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
        if (!user) {
          return { data: null, error: { message: "Credenciales incorrectas o contraseña errónea." } };
        }
        localStorage.setItem('mock_session_user', JSON.stringify(user));
        this.notify(user);
        return { data: { session: { user } }, error: null };
      },
      async signOut() {
        localStorage.removeItem('mock_session_user');
        this.notify(null);
        return { error: null };
      },
      async getSession() {
        const user = JSON.parse(localStorage.getItem('mock_session_user'));
        return { data: { session: user ? { user } : null } };
      },
      onAuthStateChange(callback) {
        this.listeners.push(callback);
        const user = JSON.parse(localStorage.getItem('mock_session_user'));
        callback(user ? 'SIGNED_IN' : 'SIGNED_OUT', user ? { user } : null);
        return { data: { subscription: { unsubscribe: () => {
          this.listeners = this.listeners.filter(l => l !== callback);
        }}}};
      },
      notify(user) {
        this.listeners.forEach(l => l(user ? 'SIGNED_IN' : 'SIGNED_OUT', user ? { user } : null));
      }
    },
    from(table) {
      return {
        select(fields = "*") {
          return {
            async eq(field, value) {
              if (table === 'profiles') {
                const users = getUsers();
                const user = users.find(u => u[field] === value);
                return { data: user ? [user] : [], error: null };
              }
              if (table === 'pit_lanes_state') {
                const state = JSON.parse(localStorage.getItem('mock_pit_lanes_state'));
                return { data: state ? [state] : [], error: null };
              }
              return { data: [], error: null };
            },
            async order(field, { ascending } = {}) {
              if (table === 'profiles') {
                let users = getUsers();
                users.sort((a, b) => ascending ? a[field] > b[field] : a[field] < b[field]);
                return { data: users, error: null };
              }
              return { data: [], error: null };
            },
            async single() {
              if (table === 'pit_lanes_state') {
                const state = JSON.parse(localStorage.getItem('mock_pit_lanes_state'));
                return { data: state || null, error: null };
              }
              return { data: null, error: null };
            }
          };
        },
        update(values) {
          return {
            async eq(field, value) {
              if (table === 'profiles') {
                const users = getUsers();
                const index = users.findIndex(u => u[field] === value);
                if (index !== -1) {
                  users[index] = { ...users[index], ...values };
                  setUsers(users);
                  
                  // Actualizar la sesión si es el usuario logueado en esta pestaña
                  const currentSessionUser = JSON.parse(localStorage.getItem('mock_session_user'));
                  if (currentSessionUser && currentSessionUser[field] === value) {
                    localStorage.setItem('mock_session_user', JSON.stringify(users[index]));
                    if (window.mockAuthListenerExecutor) {
                      window.mockAuthListenerExecutor('SIGNED_IN', { user: users[index] });
                    }
                  }

                  // Notificar a los listeners en tiempo real
                  if (window.mockRealtimeListeners) {
                    window.mockRealtimeListeners.forEach(listener => {
                      if (listener.table === 'profiles') {
                        listener.callback({
                          eventType: 'UPDATE',
                          new: users[index]
                        });
                      }
                    });
                  }
                }
                return { data: users[index], error: null };
              }
              return { data: null, error: null };
            }
          };
        },
        async insert(values) {
          if (table === 'profiles') {
            const users = getUsers();
            users.push(values);
            setUsers(users);
            return { data: values, error: null };
          }
          return { data: null, error: null };
        },
        async upsert(values) {
          if (table === 'pit_lanes_state') {
            localStorage.setItem('mock_pit_lanes_state', JSON.stringify(values));
            if (window.mockRealtimeListeners) {
              window.mockRealtimeListeners.forEach(listener => {
                if (listener.table === 'pit_lanes_state') {
                  listener.callback({
                    eventType: 'UPDATE',
                    new: values
                  });
                }
              });
            }
            return { data: values, error: null };
          }
          return { data: null, error: null };
        }
      };
    },
    channel(name) {
      return {
        on(event, filter, callback) {
          if (!window.mockRealtimeListeners) window.mockRealtimeListeners = [];
          window.mockRealtimeListeners.push({ name, event, table: filter.table, callback });
          return this;
        },
        subscribe() {
          return this;
        }
      };
    }
  };
}

// Inicialización del cliente de base de datos (Supabase o Simulador Local)
const isSupabaseConfigured = SUPABASE_URL !== "TU_SUPABASE_URL" && SUPABASE_ANON_KEY !== "TU_SUPABASE_ANON_KEY";
const db = isSupabaseConfigured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : createMockDb();

// 4. Servicio de Simulación Live Timing
class ApexService {
  constructor() {
    this.subscribers = new Set();
    this.session = {
      id: "session-2026-07-21",
      trackName: "Lucas Guerrero",
      trackLength: "1,428m",
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

    this.timerId = null;
    this.startSimulation();
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

  subscribe(callback) {
    this.subscribers.add(callback);
    callback(this.getData());
    return () => this.subscribers.delete(callback);
  }

  emit() {
    const data = this.getData();
    this.subscribers.forEach(callback => callback(data));
  }

  getData() {
    return {
      session: { ...this.session },
      drivers: [...this.drivers]
    };
  }

  startSimulation() {
    if (this.timerId) return;

    this.timerId = setInterval(() => {
      // Decrementar tiempo restante
      if (this.session.timeRemaining > 0) {
        this.session.timeRemaining--;
      }

      // Simular vueltas de pilotos en pista
      this.drivers = this.drivers.map(d => {
        if (d.status !== "TRACK") return d;

        const now = Date.now();
        const elapsed = now - d.currentLapStart;
        const range = TIER_RANGES[d.tier] || TIER_RANGES['Medio'];
        const targetLapTime = (range.min + range.max) / 2;

        let nextSector = d.sector;
        let nextS1 = d.s1;
        let nextS2 = d.s2;
        let nextS3 = d.s3;
        let nextLastLap = d.lastLap;
        let nextBestLap = d.bestLap;
        let nextLapNum = d.currentLapNum;
        let nextLapStart = d.currentLapStart;

        // Simular progresión de sectores en base al tiempo
        if (d.sector === 1 && elapsed > targetLapTime / 3) {
          nextSector = 2;
          nextS1 = Math.floor(targetLapTime / 3 + (Math.random() - 0.5) * 500);
        } else if (d.sector === 2 && elapsed > (targetLapTime / 3) * 2) {
          nextSector = 3;
          nextS2 = Math.floor(targetLapTime / 3 + (Math.random() - 0.5) * 500);
        } else if (d.sector === 3 && elapsed > targetLapTime) {
          // Vuelta completada
          nextSector = 1;
          nextS3 = Math.floor(targetLapTime / 3 + (Math.random() - 0.5) * 500);
          const totalLapTime = nextS1 + nextS2 + nextS3;
          
          nextLastLap = totalLapTime;
          if (nextBestLap === 0 || totalLapTime < nextBestLap) {
            nextBestLap = totalLapTime;
          }
          nextLapNum++;
          nextLapStart = now;
          nextS1 = 0;
          nextS2 = 0;
          nextS3 = 0;
        }

        // Variar velocidad ligeramente
        const speedBase = d.tier === 'Rápido' ? 80 : d.tier === 'Medio' ? 70 : 60;
        const nextSpeed = Math.floor(speedBase + (Math.random() - 0.5) * 6);

        return {
          ...d,
          sector: nextSector,
          s1: nextS1,
          s2: nextS2,
          s3: nextS3,
          lastLap: nextLastLap,
          bestLap: nextBestLap,
          currentLapNum: nextLapNum,
          currentLapStart: nextLapStart,
          speed: nextSpeed
        };
      });

      this.emit();
    }, 1000);
  }
}

const apexService = new ApexService();

// 5. Componente Navigation (Cabecera)
function Navigation({ trackName, onTrackClick, onLogout, onAccessClick, userRole }) {
  const isAdmin = userRole === 'admin';
  
  return html`
    <header class="bg-[#000000] border-b border-[#111111] px-4 py-3 flex items-center justify-between flex-shrink-0 safe-top">
      <div class="flex items-center space-x-2">
        <span class="text-[#B026FF] font-extrabold text-lg tracking-tighter">PITGUIDE</span>
        ${db.isMock && html`
          <span class="text-[8px] bg-yellow-950/40 text-yellow-500 border border-yellow-800/40 px-1 py-0.5 rounded uppercase font-bold tracking-wider">Simulando</span>
        `}
      </div>
      <div class="flex items-center space-x-2">
        <!-- Botón de Circuito -->
        <button 
          type="button"
          onClick=${onTrackClick}
          class="flex items-center space-x-1 px-2.5 py-1 rounded-md border border-gray-800 bg-[#0E0E10] text-[9.5px] font-extrabold hover:border-gray-500 text-gray-300 transition-all duration-150 active:scale-[0.97]"
        >
          <span>🏁</span>
          <span class="text-white">${trackName || 'Seleccionar Circuito'}</span>
        </button>

        <!-- Botón de Control de Acceso (Solo visible para Admin) -->
        ${isAdmin && html`
          <button 
            type="button"
            onClick=${onAccessClick}
            class="flex items-center space-x-1 px-2.5 py-1 rounded-md border border-red-950 bg-red-950/20 text-[9.5px] font-extrabold hover:border-red-500 text-neonRed transition-all duration-150 active:scale-[0.97]"
            title="Gestionar Usuarios"
          >
            <span>🔑</span>
            <span>Acceso</span>
          </button>
        `}

        <!-- Cerrar Sesión -->
        <button 
          type="button"
          onClick=${onLogout}
          class="flex items-center justify-center p-1.5 rounded-md border border-gray-800 bg-[#0E0E10] hover:border-red-500 text-[10px] text-gray-400 hover:text-red-500 transition-all active:scale-[0.95]"
          title="Cerrar Sesión"
        >
          🚪
        </button>
      </div>
    </header>
  `;
}

// 6. Componente PitLanes
function PitLanes({ data, onAddClick, selectedKart, setSelectedKart, userRole, onUpdateLayout }) {
  const { pitLanes, numLanes, numSlots } = data;
  const isAdmin = userRole === 'admin';

  const tierColors = {
    'Rápido': {
      bg: 'bg-[#39FF14] shadow-[0_0_12px_rgba(57,255,20,0.4)]',
      text: 'text-black font-extrabold font-mono'
    },
    'Medio': {
      bg: 'bg-[#FF8C00] shadow-[0_0_12px_rgba(255,140,0,0.4)]',
      text: 'text-black font-extrabold font-mono'
    },
    'Lento': {
      bg: 'bg-[#FF3131] shadow-[0_0_12px_rgba(255,49,49,0.4)]',
      text: 'text-black font-extrabold font-mono'
    }
  };

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

  const getTotalKartsInLane = (laneKey) => {
    const laneData = pitLanes[laneKey];
    if (!laneData) return 0;
    return laneData.filter(slot => slot !== null).length;
  };

  const handleSlotClick = (lane, slotIndex, kartObj) => {
    // Tanto admins como espectadores pueden clickar karts ahora (para que la app funcione normalmente)
    // Pero solo los administradores o usuarios normales de forma completa
    if (kartObj) {
      setSelectedKart({ lane, slotIndex, tier: kartObj.tier });
    }
  };

  const handleTierChange = (newTier) => {
    if (!selectedKart) return;
    
    const updatedLanes = JSON.parse(JSON.stringify(pitLanes));
    updatedLanes[selectedKart.lane][selectedKart.slotIndex].tier = newTier;
    
    onUpdateLayout(numLanes, numSlots, updatedLanes);
    setSelectedKart(prev => ({ ...prev, tier: newTier }));
  };

  const adjustLanes = (delta) => {
    const newLanesCount = Math.max(1, Math.min(6, numLanes + delta));
    
    const updatedLanes = {};
    for (let i = 1; i <= newLanesCount; i++) {
      const laneKey = `L${i}`;
      const oldLane = pitLanes[laneKey] || [];
      const newLane = [];
      for (let j = 0; j < numSlots; j++) {
        newLane.push(oldLane[j] !== undefined ? oldLane[j] : null);
      }
      updatedLanes[laneKey] = newLane;
    }
    
    onUpdateLayout(newLanesCount, numSlots, updatedLanes);
    setSelectedKart(null);
  };

  const adjustSlots = (delta) => {
    const newSlotsCount = Math.max(1, Math.min(8, numSlots + delta));
    
    const updatedLanes = {};
    for (let i = 1; i <= numLanes; i++) {
      const laneKey = `L${i}`;
      const oldLane = pitLanes[laneKey] || [];
      const newLane = [];
      for (let j = 0; j < newSlotsCount; j++) {
        newLane.push(oldLane[j] !== undefined ? oldLane[j] : null);
      }
      updatedLanes[laneKey] = newLane;
    }
    
    onUpdateLayout(numLanes, newSlotsCount, updatedLanes);
    setSelectedKart(null);
  };

  const slotIndices = Array.from({ length: numSlots }, (_, i) => i);
  const laneBoxHeight = numSlots * 52 + 20;

  return html`
    <div class="flex-1 flex flex-col h-full bg-[#000000] p-4 text-white overflow-y-auto no-scrollbar justify-between">
      
      <!-- HEADER SECCIÓN -->
      <div class="flex items-center justify-between border-b border-[#111] pb-3 mb-2 flex-shrink-0">
        <div>
          <span class="text-[10px] uppercase tracking-widest text-[#555] font-bold">Boxes</span>
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
              class="w-7 h-7 bg-black border border-gray-800 rounded-lg flex items-center justify-center text-sm font-extrabold text-neonRed disabled:opacity-20 disabled:pointer-events-none hover:bg-gray-950 transition-all"
            >
              -
            </button>
            <span class="text-base font-black font-mono w-4 text-center text-white">${numLanes}</span>
            <button 
              type="button" 
              onClick=${() => adjustLanes(1)} 
              disabled=${numLanes >= 6}
              class="w-7 h-7 bg-black border border-gray-800 rounded-lg flex items-center justify-center text-sm font-extrabold text-neonGreen disabled:opacity-20 disabled:pointer-events-none hover:bg-gray-950 transition-all"
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
              class="w-7 h-7 bg-black border border-gray-800 rounded-lg flex items-center justify-center text-sm font-extrabold text-neonRed disabled:opacity-20 disabled:pointer-events-none hover:bg-gray-950 transition-all"
            >
              -
            </button>
            <span class="text-base font-black font-mono w-4 text-center text-white">${numSlots}</span>
            <button 
              type="button" 
              onClick=${() => adjustSlots(1)} 
              disabled=${numSlots >= 8}
              class="w-7 h-7 bg-black border border-gray-800 rounded-lg flex items-center justify-center text-sm font-extrabold text-neonGreen disabled:opacity-20 disabled:pointer-events-none hover:bg-gray-950 transition-all"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <!-- LANES CONTAINER DINÁMICO -->
      <div class="flex-1 flex justify-around items-center py-4 min-h-[220px] overflow-x-auto no-scrollbar gap-4">
        ${Object.keys(pitLanes).map(laneKey => {
          const laneData = pitLanes[laneKey] || [];
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
                    const styles = tierColors[kartObj.tier] || { bg: 'bg-gray-600', text: 'text-white font-mono' };
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

      <!-- PANEL: AGREGAR NUEVO KART -->
      <div class="mb-4 mt-2 flex-shrink-0">
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

      <!-- PANEL DE KART SELECCIONADO (Visible para cualquier usuario al hacer clic en un kart) -->
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
              const updatedLanes = JSON.parse(JSON.stringify(pitLanes));
              updatedLanes[selectedKart.lane][selectedKart.slotIndex] = null;
              onUpdateLayout(numLanes, numSlots, updatedLanes);
              setSelectedKart(null);
            }}
            class="w-full py-2.5 bg-red-950/20 hover:bg-red-950/40 text-neonRed border border-neonRed/30 rounded-lg text-xs font-bold transition-all active:scale-[0.98]"
          >
            🗑️ Eliminar Kart de la Fila
          </button>
        </div>
      ` : html`
        <div class="h-[80px] flex items-center justify-center border border-dashed border-gray-900/50 rounded-xl text-gray-700 text-[10px] font-bold flex-shrink-0 select-none">
          Haz clic en un kart para cambiar su velocidad o eliminarlo
        </div>
      `}

    </div>
  `;
}

// 7. Vista del Panel de Acceso (Modalizado para Administradores)
function AccessControlModal({ currentUser, onClose }) {
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await db.from('profiles').select('*').order('name', { ascending: true });
    if (!error && data) {
      setUsersList(data.filter(u => u.id !== currentUser.id));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();

    const channel = db.channel('realtime_profiles')
      .on('postgres_changes', { event: '*', table: 'profiles' }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      db.from('profiles').select('*'); // Desuscribir
    };
  }, []);

  const handleToggleAccess = async (userId, currentStatus) => {
    const { error } = await db.from('profiles').update({ is_active: !currentStatus }).eq('id', userId);
    if (!error) {
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentStatus } : u));
    }
  };

  const handleRoleChange = async (userId, currentRole) => {
    const newRole = currentRole === 'admin' ? 'viewer' : 'admin';
    const { error } = await db.from('profiles').update({ role: newRole }).eq('id', userId);
    if (!error) {
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    }
  };

  return html`
    <div class="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-md">
      <div class="w-full max-w-sm bg-[#0E0E10] border border-[#1a1a20] rounded-xl p-5 shadow-2xl flex flex-col h-[85vh] justify-between">
        
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-gray-900 pb-3 mb-4 flex-shrink-0">
          <div>
            <span class="text-[9px] uppercase tracking-widest text-gray-500 font-bold">Configuración</span>
            <h3 class="text-sm font-extrabold text-white">CONTROL DE ACCESOS</h3>
          </div>
          <button 
            type="button" 
            onClick=${onClose}
            class="text-xs text-gray-500 hover:text-white px-2 py-1 font-bold"
          >
            Cerrar
          </button>
        </div>
        
        <!-- Contenido de Lista -->
        <div class="flex-1 overflow-y-auto no-scrollbar space-y-3 mb-4">
          ${loading 
            ? html`<div class="flex items-center justify-center h-32 text-xs text-gray-500 font-bold">Cargando usuarios...</div>`
            : usersList.length === 0
              ? html`<div class="flex items-center justify-center h-32 text-xs text-gray-600 font-bold">No hay otros usuarios registrados todavía.</div>`
              : usersList.map(u => html`
                  <div class="bg-black border border-gray-900 rounded-xl p-3 flex flex-col space-y-2">
                    <div class="flex items-center justify-between">
                      <div>
                        <span class="font-extrabold text-xs text-white block leading-tight">${u.name}</span>
                        <span class="text-[9px] text-gray-600 block font-mono mt-0.5">${u.email}</span>
                      </div>
                      
                      <!-- Toggle de Aprobación -->
                      <button 
                        type="button"
                        onClick=${() => handleToggleAccess(u.id, u.is_active)}
                        class="px-2.5 py-1 rounded-md border text-[10px] font-black transition-all active:scale-[0.96]
                          ${u.is_active 
                            ? 'border-green-500/20 bg-green-500/10 text-green-400' 
                            : 'border-red-500/20 bg-red-500/10 text-neonRed'}"
                      >
                        ${u.is_active ? 'PERMITIDO' : 'BLOQUEADO'}
                      </button>
                    </div>

                    <div class="h-[1px] bg-gray-900/60 my-1"></div>

                    <div class="flex items-center justify-between text-[11px]">
                      <span class="text-gray-500 font-semibold">Rol del Usuario:</span>
                      <button 
                        type="button"
                        onClick=${() => handleRoleChange(u.id, u.role)}
                        class="px-2 py-0.5 rounded bg-black border border-gray-800 text-[9px] uppercase font-bold text-gray-300 hover:text-white"
                      >
                        ${u.role === 'admin' ? '👮 Admin' : '👀 Espectador'}
                      </button>
                    </div>
                  </div>
                `)
          }
        </div>
        
        <!-- Botón inferior -->
        <button 
          type="button" 
          onClick=${onClose}
          class="w-full py-2.5 border border-gray-800 text-gray-400 text-xs font-bold rounded-lg hover:text-white flex-shrink-0"
        >
          Volver a Boxes
        </button>
      </div>
    </div>
  `;
}

// 8. Componente App principal
function App() {
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Estados de Boxes y Layout
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
  
  // Modales
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [activeTab, setActiveTab] = useState('boxes');
  
  // Vista de Auth ('login' o 'signup')
  const [authView, setAuthView] = useState('login');
  
  // Formulario Auth
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authRole, setAuthRole] = useState("viewer");
  const [authError, setAuthError] = useState("");

  // Sincronizar sesión de usuario al iniciar
  useEffect(() => {
    const checkSession = async () => {
      setLoading(true);
      const { data } = await db.auth.getSession();
      if (data?.session) {
        setSession(data.session);
        await fetchProfile(data.session.user.id);
      }
      setLoading(false);
    };

    checkSession();

    // Suscripción al AuthStateChange
    const { data: { subscription } } = db.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        await fetchProfile(newSession.user.id);
      } else {
        setCurrentUser(null);
      }
    });

    if (db.isMock) {
      window.mockAuthListenerExecutor = async (event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          await fetchProfile(newSession.user.id);
        }
      };
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Cargar estado de boxes y telemetría de Supabase o simularlo en tiempo real
  useEffect(() => {
    if (!currentUser || !currentUser.is_active) return;

    // 1. Obtener estado inicial de boxes
    const fetchLayout = async () => {
      const { data, error } = await db.from('pit_lanes_state').select('*').single();
      if (!error && data) {
        setLiveData(prev => ({
          ...prev,
          numLanes: data.num_lanes,
          numSlots: data.num_slots,
          pitLanes: data.pit_lanes,
          session: { ...prev.session, trackName: data.track_name }
        }));
      } else {
        const defaultState = {
          id: 'current_layout',
          num_lanes: 2,
          num_slots: 4,
          track_name: 'Lucas Guerrero',
          pit_lanes: apexService.getDefaultPitLanes()
        };
        await db.from('pit_lanes_state').upsert(defaultState);
        setLiveData(prev => ({
          ...prev,
          numLanes: defaultState.num_lanes,
          numSlots: defaultState.num_slots,
          pitLanes: defaultState.pit_lanes,
          session: { ...prev.session, trackName: defaultState.track_name }
        }));
      }
    };

    fetchLayout();

    // 2. Suscribirse a cambios en tiempo real
    const channel = db.channel('realtime_pit_lanes')
      .on('postgres_changes', { event: '*', table: 'pit_lanes_state' }, (payload) => {
        if (payload.new) {
          setLiveData(prev => ({
            ...prev,
            numLanes: payload.new.num_lanes,
            numSlots: payload.new.num_slots,
            pitLanes: payload.new.pit_lanes,
            session: { ...prev.session, trackName: payload.new.track_name }
          }));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', table: 'profiles' }, (payload) => {
        if (payload.new && payload.new.id === currentUser.id) {
          setCurrentUser(payload.new);
        }
      })
      .subscribe();

    const unsubscribeLocal = apexService.subscribe((newData) => {
      setLiveData(prev => ({
        ...prev,
        drivers: newData.drivers
      }));
    });

    return () => {
      unsubscribeLocal();
      db.from('pit_lanes_state').select('*'); // Desuscribir
    };
  }, [currentUser]);

  // Chequeo de suspensión de usuario para simulador local
  useEffect(() => {
    if (!currentUser || isSupabaseConfigured) return;
    
    const interval = setInterval(async () => {
      const mockUsers = JSON.parse(localStorage.getItem('mock_users') || "[]");
      const me = mockUsers.find(u => u.id === currentUser.id);
      if (me && me.is_active !== currentUser.is_active) {
        setCurrentUser(me);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [currentUser]);

  const fetchProfile = async (uid) => {
    const { data, error } = await db.from('profiles').select('*').eq('id', uid);
    if (!error && data && data.length > 0) {
      setCurrentUser(data[0]);
    } else {
      // Si estamos en Supabase real y el perfil no existe, crearlo automáticamente
      if (isSupabaseConfigured && session?.user) {
        const isUserAdmin = session.user.email.toLowerCase() === "admin@.com";
        const newProfile = {
          id: uid,
          name: session.user.user_metadata?.name || session.user.email.split('@')[0],
          role: isUserAdmin ? 'admin' : (session.user.user_metadata?.role || 'viewer'),
          is_active: isUserAdmin ? true : false,
          updated_at: new Date().toISOString()
        };
        const { error: insertError } = await db.from('profiles').insert(newProfile);
        if (!insertError) {
          setCurrentUser(newProfile);
          return;
        }
      }
      
      const sessionUser = JSON.parse(localStorage.getItem('mock_session_user'));
      if (sessionUser) {
        setCurrentUser(sessionUser);
      }
    }
  };

  const handleUpdateLayout = async (numLanes, numSlots, pitLanes) => {
    const values = {
      id: 'current_layout',
      num_lanes: numLanes,
      num_slots: numSlots,
      pit_lanes: pitLanes,
      track_name: liveData.session.trackName,
      updated_at: new Date().toISOString()
    };

    const { error } = await db.from('pit_lanes_state').upsert(values);
    if (!error) {
      setLiveData(prev => ({
        ...prev,
        numLanes,
        numSlots,
        pitLanes
      }));
    }
  };

  const handleAddClick = (tier) => {
    setModalTier(tier);
    setShowLaneModal(true);
  };

  const selectLaneForAdd = (laneKey) => {
    const updatedLanes = JSON.parse(JSON.stringify(liveData.pitLanes));
    const laneData = updatedLanes[laneKey] || [];
    
    // Desplazamiento progresivo
    for (let i = 0; i < liveData.numSlots - 1; i++) {
      laneData[i] = laneData[i + 1] !== undefined ? laneData[i + 1] : null;
    }
    
    // Insertar nuevo kart
    laneData[liveData.numSlots - 1] = { tier: modalTier };
    updatedLanes[laneKey] = laneData;

    handleUpdateLayout(liveData.numLanes, liveData.numSlots, updatedLanes);
    setShowLaneModal(false);
    setSelectedKart(null);
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");

    if (authView === 'login') {
      const { data, error } = await db.auth.signInWithPassword({
        email: authEmail,
        password: authPassword
      });
      if (error) {
        setAuthError(error.message);
      } else if (data?.session) {
        setSession(data.session);
        await fetchProfile(data.session.user.id);
      }
    } else {
      if (!authName.trim()) {
        setAuthError("Por favor escribe tu nombre.");
        return;
      }
      const { data, error } = await db.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: {
          data: {
            name: authName,
            role: authRole
          }
        }
      });
      if (error) {
        setAuthError(error.message);
      } else {
        alert("Cuenta creada con éxito. " + (authEmail.toLowerCase() === 'admin@.com' ? "Inicia sesión ahora." : "Espera a que el Administrador te autorice el acceso."));
        setAuthView('login');
      }
    }
  };

  const handleLogout = async () => {
    await db.auth.signOut();
    setSession(null);
    setCurrentUser(null);
  };

  const activeTimingUrl = liveData.session.trackName === "Lucas Guerrero" 
    ? "https://live.apex-timing.com/kartodromo-lucas-guerrero/"
    : "https://live.apex-timing.com/kartodromo-lucas-guerrero/";

  // 1. Cargando
  if (loading) {
    return html`
      <div class="h-full w-full bg-black flex items-center justify-center text-xs text-gray-500 font-bold">
        Iniciando PITGUIDE...
      </div>
    `;
  }

  // 2. Vista de Autenticación (Login/Sign up obligatorio para todos)
  if (!session || !currentUser) {
    return html`
      <div class="h-full w-full bg-black flex items-center justify-center p-6 text-white select-none">
        <div class="w-full max-w-sm bg-[#0E0E10] border border-gray-900 rounded-xl p-6 shadow-2xl flex flex-col justify-between">
          <div class="text-center mb-6">
            <h1 class="text-[#B026FF] font-extrabold text-2xl tracking-tighter">PITGUIDE</h1>
            <p class="text-[10px] text-gray-500 uppercase tracking-widest font-mono mt-1">Karting Pit Lane Manager</p>
          </div>

          <form onSubmit=${handleAuthSubmit} class="space-y-4">
            ${authError && html`
              <div class="bg-red-500/10 border border-red-500/20 text-neonRed text-[11px] p-3 rounded-lg font-bold text-center">
                ⚠️ ${authError}
              </div>
            `}

            ${authView === 'signup' && html`
              <div>
                <label class="block text-[10px] uppercase font-bold text-gray-500 mb-1">Nombre Completo</label>
                <input 
                  type="text" 
                  required
                  value=${authName}
                  onInput=${(e) => setAuthName(e.target.value)}
                  class="w-full bg-black border border-gray-800 focus:border-[#B026FF] rounded-lg p-3 text-sm text-white focus:outline-none"
                  placeholder="Ej. Marc Gené"
                />
              </div>
            `}

            <div>
              <label class="block text-[10px] uppercase font-bold text-gray-500 mb-1">Correo Electrónico</label>
              <input 
                type="email" 
                required
                value=${authEmail}
                onInput=${(e) => setAuthEmail(e.target.value)}
                class="w-full bg-black border border-gray-800 focus:border-[#B026FF] rounded-lg p-3 text-sm text-white focus:outline-none"
                placeholder="ejemplo@correo.com"
              />
            </div>

            <div>
              <label class="block text-[10px] uppercase font-bold text-gray-500 mb-1">Contraseña</label>
              <input 
                type="password" 
                required
                value=${authPassword}
                onInput=${(e) => setAuthPassword(e.target.value)}
                class="w-full bg-black border border-gray-800 focus:border-[#B026FF] rounded-lg p-3 text-sm text-white focus:outline-none"
                placeholder="******"
              />
            </div>

            <button 
              type="submit"
              class="w-full py-3 bg-[#B026FF] hover:bg-[#9B10EF] text-white text-sm font-extrabold rounded-lg transition-all active:scale-[0.98]"
            >
              ${authView === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
            </button>
          </form>

          <div class="text-center mt-6">
            ${authView === 'login' 
              ? html`
                  <button 
                    type="button" 
                    onClick=${() => { setAuthView('signup'); setAuthError(""); }}
                    class="text-xs text-gray-500 hover:text-white"
                  >
                    ¿No tienes cuenta? <span class="text-[#B026FF] font-bold">Regístrate</span>
                  </button>
                `
              : html`
                  <button 
                    type="button" 
                    onClick=${() => { setAuthView('login'); setAuthError(""); }}
                    class="text-xs text-gray-500 hover:text-white"
                  >
                    ¿Ya tienes cuenta? <span class="text-[#B026FF] font-bold">Inicia sesión</span>
                  </button>
                `
            }
          </div>
        </div>
      </div>
    `;
  }

  // 3. Vista de Acceso Denegado / En espera de Aprobación
  if (currentUser && !currentUser.is_active) {
    return html`
      <div class="h-full w-full bg-black flex items-center justify-center p-6 text-white select-none">
        <div class="w-full max-w-sm bg-[#0E0E10] border border-red-500/20 rounded-xl p-6 shadow-2xl text-center space-y-4">
          <div class="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <span class="text-3xl text-neonRed">🔑</span>
          </div>
          <h1 class="text-neonRed font-black text-lg tracking-tight uppercase">ESPERANDO APROBACIÓN</h1>
          <p class="text-xs text-gray-400 leading-relaxed">
            Tu cuenta ha sido creada con éxito, pero requiere que el **Administrador** autorice tu acceso en la base de datos antes de poder visualizar el pit lane.
          </p>
          <div class="bg-black border border-gray-900 rounded-lg p-3 text-left">
            <span class="text-[9px] uppercase tracking-wider text-gray-600 block">Registrado como:</span>
            <span class="text-sm font-extrabold text-white block mt-0.5">${currentUser.name}</span>
            <span class="text-[10px] text-gray-500 block font-mono">${currentUser.email}</span>
          </div>
          <div class="pt-2">
            <button 
              type="button"
              onClick=${handleLogout}
              class="w-full py-2.5 bg-black border border-gray-800 hover:border-red-500 text-xs font-bold rounded-lg text-gray-400 hover:text-neonRed transition-all"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // 4. Vista de la App Principal (Boxes / Timing)
  return html`
    <div class="h-full w-full flex flex-col justify-between bg-black overflow-hidden select-none">
      
      <!-- Cabecera -->
      <${Navigation} 
        trackName=${liveData.session.trackName} 
        onTrackClick=${() => setShowTrackModal(true)} 
        onLogout=${handleLogout}
        onAccessClick=${() => setShowAccessModal(true)}
        userRole=${currentUser.role}
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
                userRole=${currentUser.role}
                onUpdateLayout=${handleUpdateLayout}
              />
            `
          : html`
              <div class="flex-1 w-full h-full bg-black relative">
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

      <!-- MODAL CONTROL DE ACCESOS (Abre con el botón "Acceso" en el Header) -->
      ${showAccessModal && html`
        <${AccessControlModal} 
          currentUser=${currentUser} 
          onClose=${() => setShowAccessModal(false)} 
        />
      `}

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
                  db.from('pit_lanes_state').upsert({
                    id: 'current_layout',
                    num_lanes: liveData.numLanes,
                    num_slots: liveData.numSlots,
                    pit_lanes: liveData.pitLanes,
                    track_name: "Lucas Guerrero",
                    updated_at: new Date().toISOString()
                  }).then(() => {
                    setLiveData(prev => ({ ...prev, session: { ...prev.session, trackName: "Lucas Guerrero" } }));
                  });
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

// 9. Montar en el DOM
render(h(App), document.getElementById('root'));
