// js/services/floatingPlayer.js
// ==========================================
// REPRODUCTOR FLOTANTE PERSISTENTE (YouTube IFrame Player API)
// ==========================================
// PROBLEMA QUE RESUELVE: los <iframe> estáticos que usa render.js
// (construirTarjetaCancion) se pausan/cortan en cuanto salen del viewport
// por scroll, o cuando Android minimiza la pestaña/PWA. Este módulo crea
// UN solo reproductor real (YT.Player), anclado en una ventana flotante
// con position:fixed, que no depende de estar visible dentro del flujo
// normal de la página para seguir sonando.
//
// LIMITACIÓN HONESTA: GGmusic es un sitio multi-página (cada <a href>
// hace una navegación real, no un cambio de vista de SPA). Eso significa
// que el audio SÍ se corta al navegar de canciones.html a artista.html,
// porque el contexto entero de JavaScript se destruye con la página.
// Lo que este módulo ofrece es continuidad DENTRO de la página actual
// (scroll, cambiar de pestaña del navegador, minimizar en Android) y,
// mediante localStorage, la posibilidad de retomar el mismo tema justo
// donde iba al volver a cargar cualquier página del sitio.
//
// INTEGRACIÓN: cualquier página que quiera usar el reproductor flotante
// solo necesita:
//   import { reproducirEnFlotante } from './services/floatingPlayer.js';
//   reproducirEnFlotante({ videoId, cancionId, titulo, subtitulo, fotoUrl });
//
// No hace falta llamar a ninguna función de inicialización aparte: el
// primer reproducirEnFlotante() de la sesión construye el widget solo.

const CLAVE_ESTADO = 'ggmusic_reproductor_flotante_estado';

let apiListaPromise = null;
let player = null;               // instancia de YT.Player, una sola vez creada
let contenedorFlotante = null;   // wrapper <div> con position:fixed
let elementosUI = null;          // referencias a los nodos de la UI (título, botones, etc.)
let cancionActualId = null;
let intervaloGuardado = null;

// ==========================================
// 1. CARGA PEREZOSA DE LA API DE YOUTUBE
// ==========================================
// La API global de YouTube solo puede inicializarse una vez por página, y
// notifica que está lista invocando window.onYouTubeIframeAPIReady() — un
// nombre de función fijo que la propia librería espera encontrar en el
// scope global. Si otra parte del sitio ya la cargó, se reutiliza.
function cargarYoutubeApi() {
    if (apiListaPromise) return apiListaPromise;

    apiListaPromise = new Promise((resolve) => {
        if (window.YT && window.YT.Player) {
            resolve(window.YT);
            return;
        }

        const anteriorCallback = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (typeof anteriorCallback === 'function') anteriorCallback();
            resolve(window.YT);
        };

        // Evita inyectar el script dos veces si algo más en la página
        // (poco probable en este proyecto, pero por seguridad) ya lo pidió.
        if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
        }
    });

    return apiListaPromise;
}

// ==========================================
// 2. PERSISTENCIA LIGERA (retomar al recargar / cambiar de página)
// ==========================================
function guardarEstado() {
    if (!player || !cancionActualId) return;
    try {
        const tiempoActual = typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : 0;
        localStorage.setItem(CLAVE_ESTADO, JSON.stringify({
            cancionId: cancionActualId,
            tiempo: tiempoActual,
            titulo: elementosUI?.titulo.textContent || '',
            subtitulo: elementosUI?.subtitulo.textContent || '',
            guardadoEn: Date.now()
        }));
    } catch (error) {
        // localStorage puede fallar (privado, cuota) — no rompe la reproducción.
    }
}

/**
 * Devuelve el último estado guardado si sigue siendo razonablemente
 * reciente (30 minutos), o null. Pensado para que una página nueva pueda
 * ofrecer "Retomar: <tema>" sin forzar la reproducción automáticamente
 * (los navegadores bloquean el autoplay con sonido sin interacción previa
 * del usuario, así que retomar SIEMPRE debe ser un clic explícito).
 */
export function obtenerEstadoGuardado() {
    try {
        const crudo = localStorage.getItem(CLAVE_ESTADO);
        if (!crudo) return null;
        const datos = JSON.parse(crudo);
        if (!datos || typeof datos.guardadoEn !== 'number') return null;
        if (Date.now() - datos.guardadoEn > 30 * 60 * 1000) return null;
        return datos;
    } catch (error) {
        return null;
    }
}

// ==========================================
// 3. CONSTRUCCIÓN DEL WIDGET (una sola vez)
// ==========================================
function construirWidgetSiHaceFalta() {
    if (contenedorFlotante) return;

    contenedorFlotante = document.createElement('div');
    contenedorFlotante.id = 'gg-reproductor-flotante';
    contenedorFlotante.className = [
        'fixed z-[70] bottom-4 right-4 w-[300px] bg-slate-900/95 border border-slate-700/80',
        'rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden transition-all duration-200',
        'select-none'
    ].join(' ');
    // Posición inicial vía transform, así arrastrar (paso 5) no pelea con
    // los right-4/bottom-4 de Tailwind una vez que el usuario ya movió el widget.
    contenedorFlotante.style.touchAction = 'none';

    contenedorFlotante.innerHTML = `
        <div id="gg-flotante-header" class="flex items-center gap-2 px-3 py-2 bg-slate-950/60 border-b border-slate-800/80 cursor-grab active:cursor-grabbing">
            <img id="gg-flotante-foto" src="" alt="" class="w-8 h-8 rounded-lg object-cover border border-slate-700 shrink-0 bg-slate-800">
            <div class="min-w-0 flex-1">
                <p id="gg-flotante-titulo" class="text-xs font-bold text-white truncate leading-tight">—</p>
                <p id="gg-flotante-subtitulo" class="text-[10px] text-slate-400 truncate leading-tight">—</p>
            </div>
            <button id="gg-flotante-min" type="button" title="Minimizar" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path></svg>
            </button>
            <button id="gg-flotante-cerrar" type="button" title="Cerrar" class="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
        <div id="gg-flotante-video-wrap" class="relative w-full pb-[56.25%] bg-black">
            <div id="gg-flotante-video-target" class="absolute inset-0"></div>
        </div>
    `;

    document.body.appendChild(contenedorFlotante);

    elementosUI = {
        header: contenedorFlotante.querySelector('#gg-flotante-header'),
        foto: contenedorFlotante.querySelector('#gg-flotante-foto'),
        titulo: contenedorFlotante.querySelector('#gg-flotante-titulo'),
        subtitulo: contenedorFlotante.querySelector('#gg-flotante-subtitulo'),
        videoWrap: contenedorFlotante.querySelector('#gg-flotante-video-wrap'),
        btnMin: contenedorFlotante.querySelector('#gg-flotante-min'),
        btnCerrar: contenedorFlotante.querySelector('#gg-flotante-cerrar')
    };

    elementosUI.btnCerrar.addEventListener('click', cerrarFlotante);
    elementosUI.btnMin.addEventListener('click', alternarMinimizado);
    habilitarArrastre(contenedorFlotante, elementosUI.header);
}

// ==========================================
// 4. MINIMIZAR / RESTAURAR
// ==========================================
function alternarMinimizado() {
    const minimizado = contenedorFlotante.classList.toggle('gg-flotante-minimizado');
    elementosUI.videoWrap.classList.toggle('hidden', minimizado);
    contenedorFlotante.classList.toggle('w-[300px]', !minimizado);
    contenedorFlotante.classList.toggle('w-[220px]', minimizado);

    const icono = elementosUI.btnMin.querySelector('svg');
    icono.innerHTML = minimizado
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-5v4m0-4h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"></path>'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path>';
}

// ==========================================
// 5. ARRASTRAR EL WIDGET (Pointer Events, funciona en touch y mouse)
// ==========================================
function habilitarArrastre(contenedor, agarradera) {
    let arrastrando = false;
    let offsetX = 0;
    let offsetY = 0;

    agarradera.addEventListener('pointerdown', (e) => {
        // No iniciar arrastre si el clic fue sobre uno de los botones de la cabecera.
        if (e.target.closest('button')) return;

        arrastrando = true;
        const rect = contenedor.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        // A partir de aquí el widget se posiciona por left/top explícitos,
        // dejando de depender de las clases bottom-4/right-4 de Tailwind.
        contenedor.style.left = `${rect.left}px`;
        contenedor.style.top = `${rect.top}px`;
        contenedor.style.right = 'auto';
        contenedor.style.bottom = 'auto';

        agarradera.setPointerCapture(e.pointerId);
    });

    agarradera.addEventListener('pointermove', (e) => {
        if (!arrastrando) return;
        const maxX = window.innerWidth - contenedor.offsetWidth - 8;
        const maxY = window.innerHeight - contenedor.offsetHeight - 8;
        const nuevoX = Math.min(Math.max(8, e.clientX - offsetX), maxX);
        const nuevoY = Math.min(Math.max(8, e.clientY - offsetY), maxY);
        contenedor.style.left = `${nuevoX}px`;
        contenedor.style.top = `${nuevoY}px`;
    });

    agarradera.addEventListener('pointerup', () => { arrastrando = false; });
    agarradera.addEventListener('pointercancel', () => { arrastrando = false; });
}

// ==========================================
// 6. API PÚBLICA
// ==========================================

/**
 * Reproduce (o cambia a) un tema en el reproductor flotante.
 * @param {Object} datos
 * @param {string} datos.videoId - ID de 11 caracteres del video de YouTube.
 * @param {string} datos.cancionId - mismo identificador compuesto que usa
 *   interactions.js (perfilId_videoId), para poder retomar likes/estado.
 * @param {string} [datos.titulo]
 * @param {string} [datos.subtitulo] - ej. nombre del artista/productor.
 * @param {string} [datos.fotoUrl]
 * @param {number} [datos.iniciarEnSegundo] - útil para "Retomar" desde obtenerEstadoGuardado().
 */
export async function reproducirEnFlotante({ videoId, cancionId, titulo, subtitulo, fotoUrl, iniciarEnSegundo }) {
    if (!videoId) return;

    construirWidgetSiHaceFalta();
    contenedorFlotante.classList.remove('hidden');
    if (contenedorFlotante.classList.contains('gg-flotante-minimizado')) {
        alternarMinimizado();
    }

    elementosUI.titulo.textContent = titulo || 'Reproduciendo...';
    elementosUI.subtitulo.textContent = subtitulo || '';
    if (fotoUrl) elementosUI.foto.src = fotoUrl;

    cancionActualId = cancionId || null;

    const YT = await cargarYoutubeApi();

    if (!player) {
        player = new YT.Player('gg-flotante-video-target', {
            width: '100%',
            height: '100%',
            videoId,
            playerVars: {
                autoplay: 1,
                rel: 0,
                start: iniciarEnSegundo ? Math.floor(iniciarEnSegundo) : 0
            },
            events: {
                onStateChange: (e) => {
                    // 1 = PLAYING. Guardamos posición cada 5s mientras suena,
                    // y dejamos de guardar en pausa/fin para no acumular
                    // escrituras innecesarias a localStorage.
                    if (e.data === YT.PlayerState.PLAYING) {
                        clearInterval(intervaloGuardado);
                        intervaloGuardado = setInterval(guardarEstado, 5000);
                    } else {
                        clearInterval(intervaloGuardado);
                    }
                }
            }
        });
    } else {
        player.loadVideoById({ videoId, startSeconds: iniciarEnSegundo || 0 });
    }
}

/** Pausa sin cerrar el widget (ej. si se quiere silenciar temporalmente). */
export function pausarFlotante() {
    player?.pauseVideo?.();
}

/** Cierra el widget por completo y destruye el reproductor. */
export function cerrarFlotante() {
    clearInterval(intervaloGuardado);
    try { player?.destroy?.(); } catch (error) {}
    player = null;
    cancionActualId = null;
    if (contenedorFlotante) {
        contenedorFlotante.remove();
        contenedorFlotante = null;
        elementosUI = null;
    }
    try { localStorage.removeItem(CLAVE_ESTADO); } catch (error) {}
}

/** ID de la canción actualmente activa en el flotante, o null. */
export function obtenerCancionActual() {
    return cancionActualId;
}