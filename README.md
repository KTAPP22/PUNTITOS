# PITGUIDE - Karting Live Timing & Pit Lane Manager

PITGUIDE es una aplicación web móvil (PWA) de alto rendimiento diseñada específicamente para pilotos y equipos de karting en pista. Permite gestionar y monitorear la distribución de karts en los carriles de boxes (Pit Lanes) en tiempo real, con una interfaz adaptada para pantallas móviles de alto contraste y bajo consumo de batería (OLED Black absoluto).

## 🏎️ Características de la Fase 1
- **Interfaz OLED de Alto Contraste:** Diseño negro absoluto con tipografías monoespaciadas y colores neón (Cyan, Amarillo y Rosado/Rojo) de alta visibilidad en pista.
- **Configuración Dinámica de Carriles:** Permite ajustar en tiempo real el número de carriles de boxes (de 1 a 6) y la capacidad de karts por carril (de 1 a 8) directamente desde la pantalla.
- **Gestión de Tiers de Karts:** Clasifica visualmente los karts en pista por su rendimiento (Fast, Normal, Slow) con actualización instantánea.
- **Egreso Manual a Pista:** Libera karts a pista asignando pilotos, iniciando simulaciones de paso por sectores.
- **Soporte Offline (PWA):** Totalmente instalable en el móvil y utilizable sin conexión a internet en boxes gracias a su Service Worker.
- **Cero Dependencias locales:** Se ejecuta abriendo directamente el archivo `index.html` en el navegador (compatible con el protocolo `file://`).

---

## 🛠️ Cómo Ejecutar el Proyecto

### Opción 1: Ejecución Directa (Sin Servidor)
1. Descarga el repositorio o clónalo localmente.
2. Haz **doble clic** sobre el archivo `index.html`.
3. ¡Listo! La app cargará y funcionará inmediatamente en tu navegador.

### Opción 2: Ejecución mediante Servidor Local
Para activar soporte de instalación como PWA y registro del Service Worker:
1. Abre tu terminal en la carpeta del proyecto.
2. Ejecuta un servidor local (por ejemplo, con Python):
   ```bash
   python -m http.server 8000
   ```
3. Abre tu navegador e ingresa a `http://localhost:8000`.

---

## 📡 Arquitectura Fase 2 (Ready para Supabase/PostgreSQL)
El motor de datos en `app.js` expone eventos automáticos al completar vueltas. El repositorio incluye el esquema SQL DDL necesario para crear las tablas en base de datos para almacenar y clasificar qué karts son más rápidos en días anteriores.
