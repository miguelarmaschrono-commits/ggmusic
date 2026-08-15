// js/services/floatingPlayer.js
// ==========================================
// REPRODUCTOR FLOTANTE PERSISTENTE (YouTube IFrame Player API)
// ==========================================

const CLAVE_ESTADO = 'ggmusic_reproductor_flotante_estado';

// Iconos SVG
const SVG_PLAY = '<path d="M4 4l12 6-12 6V4z"></path>';
const SVG_PAUSE = '<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path>';
const SVG_PREV = '<path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z"></path>';
const SVG_NEXT = '<path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798L4.555 5.168z"></path>';

let apiListaPromise = null;
let player = null;               
let contenedorFlotante = null;   
let elementosUI = null;          
let intervaloGuardado = null;

let cancionActualId = null;
let videoIdActual = null;
let fotoUrlActual = null;

// COLA DE REPRODUCCIÓN
let colaReproduccion = [];
let indiceActual = -1;

// Extrae el ID de 11 caracteres de YouTube incluso si viene compuesto con "_" (ej: "USERID_YOUTUBEID")
function extraerYoutubeId(pista) {
    if (!pista) return null;

    if (typeof pista === 'string') {
        return pista.includes('_') ? pista.split('_').pop() : pista;
    }

    // 1. Probar propiedad videoId o similares
    let idDirecto = pista.videoId || pista.youtubeId || pista.youtube_id || pista.idVideo;
    if (idDirecto) {
        return (typeof idDirecto === 'string' && idDirecto.includes('_')) ? idDirecto.split('_').pop() : idDirecto;
    }

    // 2. Probar cancionId o id compuesto (ej: "TcSrX9xGEEPC06TDcmlpxX1vIpw2_G9volFxFf3w")
    const idCompuesto = pista.cancionId || pista.id;
    if (idCompuesto && typeof idCompuesto === 'string') {
        if (idCompuesto.includes('_')) {
            const posibleYtId = idCompuesto.split('_').pop();
            if (posibleYtId.length === 11) return posibleYtId;
        } else if (idCompuesto.length === 11) {
            return idCompuesto;
        }
    }

    // 3. Probar por URL
    const url = pista.url || pista.youtubeUrl || pista.link;
    if (url) {
        const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
        return match ? match[1] : null;
    }

    return null;
}

// ==========================================
// 1. CARGA PEREZOSA DE LA API DE YOUTUBE
// ==========================================
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

        if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
        }
    });

    return apiListaPromise;
}

// ==========================================
// 2. PERSISTENCIA EN LOCALSTORAGE
// ==========================================
function guardarEstado() {
    if (!player || !cancionActualId || !videoIdActual) return;
    try {
        const tiempoActual = typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : 0;
        const estadoReproductor = typeof player.getPlayerState === 'function' ? player.getPlayerState() : -1;
        const estaReproduciendo = (estadoReproductor === 1);
        const estaMinimizado = contenedorFlotante ? contenedorFlotante.classList.contains('gg-flotante-minimizado') : false;

        localStorage.setItem(CLAVE_ESTADO, JSON.stringify({
            videoId: videoIdActual,
            cancionId: cancionActualId,
            tiempo: tiempoActual,
            titulo: elementosUI?.titulo?.textContent || '',
            subtitulo: elementosUI?.subtitulo?.textContent || '',
            fotoUrl: fotoUrlActual,
            reproduciendo: estaReproduciendo,
            minimizado: estaMinimizado,
            cola: colaReproduccion,
            indice: indiceActual,
            guardadoEn: Date.now()
        }));
    } catch (error) {
        console.warn("No se pudo guardar el estado de reproducción", error);
    }
}

window.addEventListener('beforeunload', guardarEstado);

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
// 3. CONSTRUCCIÓN DEL WIDGET (DISEÑO SOBRIO)
// ==========================================
function construirWidgetSiHaceFalta() {
    if (contenedorFlotante) return;

    contenedorFlotante = document.createElement('div');
    contenedorFlotante.id = 'gg-reproductor-flotante';
    contenedorFlotante.className = [
        'fixed z-[70] bottom-4 right-4 w-[320px] bg-slate-900/95 border border-slate-700/80',
        'rounded-md shadow-2xl backdrop-blur-xl overflow-hidden transition-all duration-300',
        'select-none flex flex-col justify-between'
    ].join(' ');
    
    contenedorFlotante.style.touchAction = 'none';

    contenedorFlotante.innerHTML = `
        <!-- CABECERA Y DATOS DE CANCIÓN -->
        <div id="gg-flotante-header" class="relative flex items-center justify-between gap-2 px-3 py-2 bg-slate-950/80 border-b border-slate-800 cursor-grab active:cursor-grabbing shrink-0 transition-all">
            <div id="gg-flotante-info" class="flex items-center gap-2.5 min-w-0 flex-1 transition-all">
                <img id="gg-flotante-foto" src="" alt="" class="w-8 h-8 rounded-sm object-cover border border-slate-700 shrink-0 bg-slate-800 shadow-sm transition-all duration-200">
                <div class="min-w-0 flex-1">
                    <p id="gg-flotante-titulo" class="text-xs font-bold text-white truncate leading-tight">—</p>
                    <p id="gg-flotante-subtitulo" class="text-[10px] text-slate-400 truncate leading-tight mt-0.5">—</p>
                </div>
            </div>
            
            <!-- Botones de ventana -->
            <div class="flex items-center gap-0.5 shrink-0 self-start">
                <button id="gg-flotante-min" type="button" title="Minimizar / Expandir" class="text-slate-400 hover:text-white p-1 rounded-sm hover:bg-slate-800/80 transition">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path></svg>
                </button>
                <button id="gg-flotante-cerrar" type="button" title="Cerrar" class="text-slate-400 hover:text-rose-400 p-1 rounded-sm hover:bg-slate-800/80 transition">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        </div>

        <!-- CONTENEDOR DE VIDEO -->
        <div id="gg-flotante-video-wrap" class="relative w-full pb-[56.25%] bg-black shrink-0">
            <div id="gg-flotante-video-target" class="absolute inset-0"></div>
        </div>

        <!-- BARRA DE CONTROLES MULTIMEDIA (Botón de pausa sobrio) -->
        <div id="gg-flotante-controls-bar" class="flex items-center justify-center gap-4 px-3 py-2 bg-slate-950/90 border-t border-slate-800/80 shrink-0">
            <button id="gg-flotante-prev" type="button" title="Anterior" class="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-800 transition active:scale-95">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">${SVG_PREV}</svg>
            </button>
            <button id="gg-flotante-playpause" type="button" title="Pausar/Reanudar" class="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white p-2 rounded-full border border-slate-700/60 transition active:scale-95">
                <svg class="w-4 h-4 icono-estado" fill="currentColor" viewBox="0 0 20 20">${SVG_PLAY}</svg>
            </button>
            <button id="gg-flotante-next" type="button" title="Siguiente" class="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-800 transition active:scale-95">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">${SVG_NEXT}</svg>
            </button>
        </div>
    `;

    document.body.appendChild(contenedorFlotante);

    elementosUI = {
        header: contenedorFlotante.querySelector('#gg-flotante-header'),
        foto: contenedorFlotante.querySelector('#gg-flotante-foto'),
        titulo: contenedorFlotante.querySelector('#gg-flotante-titulo'),
        subtitulo: contenedorFlotante.querySelector('#gg-flotante-subtitulo'),
        videoWrap: contenedorFlotante.querySelector('#gg-flotante-video-wrap'),
        btnPlayPause: contenedorFlotante.querySelector('#gg-flotante-playpause'),
        btnPrev: contenedorFlotante.querySelector('#gg-flotante-prev'),
        btnNext: contenedorFlotante.querySelector('#gg-flotante-next'),
        iconoPlayPause: contenedorFlotante.querySelector('#gg-flotante-playpause .icono-estado'),
        btnMin: contenedorFlotante.querySelector('#gg-flotante-min'),
        btnCerrar: contenedorFlotante.querySelector('#gg-flotante-cerrar')
    };

    elementosUI.btnCerrar.addEventListener('click', cerrarFlotante);
    elementosUI.btnMin.addEventListener('click', alternarMinimizado);
    elementosUI.btnPrev.addEventListener('click', reproducirAnterior);
    elementosUI.btnNext.addEventListener('click', reproducirSiguiente);
    elementosUI.btnPlayPause.addEventListener('click', () => {
        if (!player || typeof player.getPlayerState !== 'function') return;
        const estadoActual = player.getPlayerState();
        if (estadoActual === 1) {
            player.pauseVideo();
        } else {
            player.playVideo();
        }
    });

    habilitarArrastre(contenedorFlotante, elementosUI.header);
}

// ==========================================
// 4. MINIMIZAR / RESTAURAR
// ==========================================
function alternarMinimizado() {
    if (!contenedorFlotante) return;

    const minimizado = contenedorFlotante.classList.toggle('gg-flotante-minimizado');

    // Cambiar ancho manteniendo una tarjeta compacta rectangular de bordes suaves (rounded-xl)
    contenedorFlotante.classList.toggle('w-[70px]', !minimizado);
    contenedorFlotante.classList.toggle('w-[300px]', minimizado);
    contenedorFlotante.classList.toggle('h-[100px]', minimizado);

    // Ocultar iframe de video
    elementosUI.videoWrap.classList.toggle('hidden', minimizado);

    const icono = elementosUI.btnMin.querySelector('svg');
    icono.innerHTML = minimizado
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-5v4m0-4h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"></path>'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path>';

    guardarEstado();
}

// ==========================================
// 5. ARRASTRAR EL WIDGET
// ==========================================
function habilitarArrastre(contenedor, agarradera) {
    let arrastrando = false;
    let offsetX = 0;
    let offsetY = 0;

    agarradera.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;

        arrastrando = true;
        const rect = contenedor.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

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
// 6. CONTROL DE LA COLA DE REPRODUCCIÓN
// ==========================================
export function establecerCola(lista, indiceInicial = 0) {
    colaReproduccion = Array.isArray(lista) ? lista : [];
    indiceActual = (indiceInicial >= 0 && indiceInicial < colaReproduccion.length) ? indiceInicial : 0;
}

export function reproducirSiguiente() {
    if (!colaReproduccion.length || indiceActual + 1 >= colaReproduccion.length) return;
    indiceActual++;
    lanzarCancionDeCola(colaReproduccion[indiceActual]);
}

export function reproducirAnterior() {
    if (!colaReproduccion.length || indiceActual - 1 < 0) return;
    indiceActual--;
    lanzarCancionDeCola(colaReproduccion[indiceActual]);
}

function lanzarCancionDeCola(pista) {
    if (!pista) return;
    const ytId = extraerYoutubeId(pista);

    reproducirEnFlotante({
        videoId: ytId,
        cancionId: pista.cancionId || pista.id,
        titulo: pista.nombre || pista.titulo,
        subtitulo: pista.perfilNombre || pista.subtitulo || pista.artista,
        fotoUrl: pista.perfilFotoUrl || pista.fotoUrl || pista.portada
    });
}

// ==========================================
// 7. API PÚBLICA PRINCIPAL (en js/services/floatingPlayer.js)
// ==========================================
export async function reproducirEnFlotante({ videoId, cancionId, titulo, subtitulo, fotoUrl, iniciarEnSegundo, minimizado }) {
    if (!videoId) {
        console.warn("reproducirEnFlotante: No se pudo determinar el videoId de YouTube.");
        return;
    }

    const yaExistiaWidget = !!contenedorFlotante;
    construirWidgetSiHaceFalta();
    contenedorFlotante.classList.remove('hidden');

    const actualmenteMinimizado = contenedorFlotante.classList.contains('gg-flotante-minimizado');

    // LÓGICA DE ESTADO:
    // 1. Si se pasa 'minimizado' explícitamente (ej: al restaurar sesión), usa ese valor.
    // 2. Si ya estaba abierto, conserva su estado actual (sea minimizado o expandido).
    // 3. Si se está abriendo por primera vez, inicia expandido (false).
    const deberiaEstarMinimizado = (minimizado !== undefined)
        ? !!minimizado
        : (yaExistiaWidget ? actualmenteMinimizado : false);

    if (deberiaEstarMinimizado !== actualmenteMinimizado) {
        alternarMinimizado();
    }

    elementosUI.titulo.textContent = titulo || 'Reproduciendo...';
    elementosUI.subtitulo.textContent = subtitulo || '';
    if (fotoUrl) elementosUI.foto.src = fotoUrl;

    cancionActualId = cancionId || null;
    videoIdActual = videoId;
    fotoUrlActual = fotoUrl || '';

    const YT = await cargarYoutubeApi();

    if (!player) {
        player = new YT.Player('gg-flotante-video-target', {
            width: '100%',
            height: '100%',
            videoId: videoId,
            playerVars: {
                autoplay: 1,
                rel: 0,
                start: iniciarEnSegundo ? Math.floor(iniciarEnSegundo) : 0
            },
            events: {
                onStateChange: (e) => {
                    if (e.data === YT.PlayerState.PLAYING) {
                        clearInterval(intervaloGuardado);
                        intervaloGuardado = setInterval(guardarEstado, 10000);
                        if (elementosUI?.iconoPlayPause) elementosUI.iconoPlayPause.innerHTML = SVG_PAUSE;
                    } else if (e.data === YT.PlayerState.ENDED) {
                        clearInterval(intervaloGuardado);
                        guardarEstado();
                        reproducirSiguiente();
                    } else {
                        clearInterval(intervaloGuardado);
                        guardarEstado();
                        if (elementosUI?.iconoPlayPause) elementosUI.iconoPlayPause.innerHTML = SVG_PLAY;
                    }
                }
            }
        });
    } else {
        if (typeof player.loadVideoById === 'function') {
            player.loadVideoById(videoId, iniciarEnSegundo || 0);
        }
    }
}

export function pausarFlotante() {
    player?.pauseVideo?.();
}

export function cerrarFlotante() {
    clearInterval(intervaloGuardado);
    try { player?.destroy?.(); } catch (error) {}
    player = null;
    cancionActualId = null;
    videoIdActual = null;
    colaReproduccion = [];
    indiceActual = -1;
    if (contenedorFlotante) {
        contenedorFlotante.remove();
        contenedorFlotante = null;
        elementosUI = null;
    }
    try { localStorage.removeItem(CLAVE_ESTADO); } catch (error) {}
}

export function obtenerCancionActual() {
    return cancionActualId;
}

// ==========================================
// 8. FUNCIÓN DE REANUDACIÓN AUTOMÁTICA
// ==========================================
export async function reanudarReproduccionAutomatica() {
    const estado = obtenerEstadoGuardado();
    const fueNavegacionReciente = estado && (Date.now() - estado.guardadoEn < 120000);

    if (estado && estado.reproduciendo && estado.videoId && fueNavegacionReciente) {
        if (Array.isArray(estado.cola)) {
            colaReproduccion = estado.cola;
            indiceActual = typeof estado.indice === 'number' ? estado.indice : -1;
        }

        await reproducirEnFlotante({
            videoId: estado.videoId,
            cancionId: estado.cancionId,
            titulo: estado.titulo,
            subtitulo: estado.subtitulo,
            fotoUrl: estado.fotoUrl,
            iniciarEnSegundo: estado.tiempo,
            minimizado: !!estado.minimizado
        });
    }
}