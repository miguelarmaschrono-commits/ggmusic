// js/services/floatingPlayer.js
// ==========================================
// REPRODUCTOR FLOTANTE PERSISTENTE (YouTube IFrame Player API)
// ==========================================

import { auth } from '../firebase-config.js';
import { toggleLikeCancion } from './interactions.js';

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
let perfilIdActual = null;
let paginaPerfilActual = 'artista.html';

// COLA Y DATOS DE LA CANCIÓN EN REPRODUCCIÓN
let colaReproduccion = [];
let indiceActual = -1;
let cancionActualFlotante = null;

// Extrae el ID de 11 caracteres de YouTube
function extraerYoutubeId(pista) {
    if (!pista) return null;

    if (typeof pista === 'string') {
        const match = pista.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
        if (match) return match[1];
        return pista.includes('_') ? pista.split('_').pop() : pista;
    }

    let idDirecto = pista.videoId || pista.youtubeId || pista.youtube_id || pista.idVideo;
    if (idDirecto) {
        return (typeof idDirecto === 'string' && idDirecto.includes('_')) ? idDirecto.split('_').pop() : idDirecto;
    }

    const idCompuesto = pista.cancionId || pista.id;
    if (idCompuesto && typeof idCompuesto === 'string') {
        if (idCompuesto.includes('_')) {
            const posibleYtId = idCompuesto.split('_').pop();
            if (posibleYtId.length === 11) return posibleYtId;
        } else if (idCompuesto.length === 11) {
            return idCompuesto;
        }
    }

    const url = pista.url || pista.youtubeUrl || pista.link;
    if (url) {
        const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
        return match ? match[1] : null;
    }

    return null;
}

// ==========================================
// 1. CONTROL VISUAL Y SINCRONIZACIÓN DE LIKES
// ==========================================
export function actualizarBotonLikeUI(meGusta, totalLikes) {
    if (!elementosUI?.btnLike) return;

    elementosUI.countLikes.textContent = totalLikes ?? 0;

    if (meGusta) {
        elementosUI.iconLike.setAttribute('fill', 'currentColor');
        elementosUI.btnLike.className = 'flex items-center gap-1.5 text-rose-500 hover:text-rose-400 transition p-1.5 rounded-full hover:bg-slate-800/80 active:scale-95';
    } else {
        elementosUI.iconLike.setAttribute('fill', 'none');
        elementosUI.btnLike.className = 'flex items-center gap-1.5 text-slate-400 hover:text-rose-500 transition p-1.5 rounded-full hover:bg-slate-800/80 active:scale-95';
    }
}

// 1. Sincroniza desde el Reproductor hacia las Tarjetas de la Página
export function sincronizarLikesEnPagina(cancionId, meGusta, totalLikes) {
    if (!cancionId) return;

    const botones = document.querySelectorAll(`.btn-like[data-cancion-id="${cancionId}"]`);
    botones.forEach(btn => {
        const icono = btn.querySelector('.icono-like') || btn.querySelector('svg');
        const contador = btn.querySelector('.count-likes') || btn.querySelector('.likes-count');

        if (icono) {
            if (meGusta) {
                icono.classList.add('text-rose-500', 'fill-current');
                icono.classList.remove('text-slate-400');
            } else {
                icono.classList.remove('text-rose-500', 'fill-current');
                icono.classList.add('text-slate-400');
            }
        }

        if (contador) {
            contador.textContent = totalLikes ?? 0;
        }

        btn.setAttribute('data-liked', meGusta ? 'true' : 'false');
    });
}

// 2. Sincroniza desde la Tarjeta de la Página hacia el Reproductor Flotante
export function sincronizarLikeDesdePagina(cancionId, meGusta, totalLikes) {
    if (!cancionActualId || cancionActualId !== cancionId) return;

    if (cancionActualFlotante) {
        cancionActualFlotante.meGusta = meGusta;
        cancionActualFlotante.likes = totalLikes;
    }

    actualizarBotonLikeUI(meGusta, totalLikes);
    guardarEstado();
}

// ==========================================
// 2. CARGA PEREZOSA DE LA API DE YOUTUBE
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
// 3. PERSISTENCIA EN LOCALSTORAGE Y CIERRE
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
            perfilId: perfilIdActual,
            paginaPerfil: paginaPerfilActual,
            tiempo: tiempoActual,
            titulo: elementosUI?.titulo?.textContent || '',
            subtitulo: elementosUI?.subtitulo?.textContent || '',
            fotoUrl: fotoUrlActual,
            likes: cancionActualFlotante?.likes || 0,
            meGusta: cancionActualFlotante?.meGusta || false,
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

export function cerrarFlotante() {
    if (intervaloGuardado) clearInterval(intervaloGuardado);
    if (player && typeof player.stopVideo === 'function') {
        player.stopVideo();
    }
    if (contenedorFlotante) {
        contenedorFlotante.classList.add('hidden');
        // Si se cierra estando en modo expandido, hay que deshacer ese
        // estado explícitamente — de lo contrario el scroll de la página
        // (bloqueado por alternarPantallaCompleta) quedaría atascado para
        // siempre, ya que el widget nunca vuelve a pasar por su propio
        // toggle una vez oculto.
        if (expandidoActualmente) {
            salirDeBloqueoNativo();
            contenedorFlotante.classList.remove('gg-flotante-expandido', 'gg-flotante-rotado');
            document.body.style.overflow = '';
            expandidoActualmente = false;
        }
    }
    localStorage.removeItem(CLAVE_ESTADO);
}

// ==========================================
// 4. CONSTRUCCIÓN DEL WIDGET CON BOTÓN DE LIKE Y PERFIL
// ==========================================

// Iconos del botón de "pantalla completa" — flechas hacia afuera cuando
// se puede expandir, flechas hacia adentro cuando ya está expandido y el
// clic va a contraerlo. Mismo patrón que ya usa alternarMinimizado() con
// el ícono del botón de minimizar.
const SVG_EXPANDIR = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path>';
const SVG_CONTRAER = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v6H3M15 21v-6h6M21 9l-6-6M3 15l6 6"></path>';

// El modo "expandido" NO usa la API nativa de Fullscreen del navegador
// (target.requestFullscreen()) — a propósito. Esa API oculta cualquier
// UI que no esté dentro del elemento puesto en pantalla completa según
// las reglas del navegador, y en la práctica termina tapando o
// recortando los controles de like/siguiente/ver perfil en varios
// navegadores móviles. En vez de eso, "expandido" es un estado 100% CSS:
// el mismo widget flotante pasa a ocupar todo el viewport (posición fixed
// inset:0) sin salir del flujo normal del DOM, así que like/seguir/perfil
// siguen siendo botones normales, clicables, sin ninguna limitación de la
// API de Fullscreen. Estas reglas viven en un <style> inyectado una sola
// vez (no en css/main.css) para que este archivo sea autocontenido y no
// dependa de que alguien recuerde replicar los estilos en el CSS global.
function inyectarEstilosExpandidoSiHaceFalta() {
    if (document.getElementById('gg-flotante-estilos-expandido')) return;

    const estilos = document.createElement('style');
    estilos.id = 'gg-flotante-estilos-expandido';
    estilos.textContent = `
        #gg-reproductor-flotante.gg-flotante-expandido {
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100dvh !important;
            max-width: 100vw !important;
            border-radius: 0 !important;
            z-index: 90 !important;
            /* RENDIMIENTO: el contenedor base trae backdrop-blur-xl,
               shadow-2xl y transition-all pensados para un widget de
               320px flotando SOBRE la página. Al expandirlo a toda la
               pantalla esas mismas propiedades se vuelven carísimas —
               backdrop-filter:blur() sobre el viewport completo obliga
               al navegador a recalcular el desenfoque de fondo en cada
               frame mientras el video de YouTube sigue reproduciéndose
               encima, lo cual se siente como que "todo el navegador" se
               puso lento, no solo el reproductor. En pantalla completa
               no hay nada detrás que desenfocar ni sombra que proyectar
               (el widget cubre 100% del viewport), así que se anulan
               por completo en vez de solo "hacerlas más sutiles". */
            background-color: #0f172a !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            box-shadow: none !important;
            transition: none !important;
        }
        #gg-reproductor-flotante.gg-flotante-expandido #gg-flotante-video-wrap {
            flex: 1 1 auto;
            min-height: 0;
            padding-bottom: 0 !important;
        }
        #gg-reproductor-flotante.gg-flotante-expandido #gg-flotante-header {
            cursor: default;
        }

        /* MODO ROTADO FORZADO — fallback para cuando no existe
           screen.orientation.lock() nativo (iOS Safari) o cuando
           requestFullscreen()/lock() fallan por cualquier motivo. En vez
           de esperar a que el usuario gire el teléfono, se rota el propio
           widget 90° con CSS mientras el dispositivo sigue en vertical,
           intercambiando ancho/alto para que ocupe el viewport como si
           ya estuviera en horizontal. Se activa/desactiva por JS
           agregando la clase 'gg-flotante-rotado' — nunca convive con un
           landscape real del sistema (ver aplicarRotacionForzada). */
        #gg-reproductor-flotante.gg-flotante-expandido.gg-flotante-rotado {
            width: 100vh !important;
            height: 100vw !important;
            top: 50% !important;
            left: 50% !important;
            right: auto !important;
            bottom: auto !important;
            transform: translate(-50%, -50%) rotate(90deg);
            transform-origin: center center;
        }
    `;
    document.head.appendChild(estilos);
}

function construirWidgetSiHaceFalta() {
    if (contenedorFlotante) return;

    inyectarEstilosExpandidoSiHaceFalta();

    contenedorFlotante = document.createElement('div');
    contenedorFlotante.id = 'gg-reproductor-flotante';
    contenedorFlotante.className = [
        'fixed z-[70] bottom-4 right-4 w-[320px] bg-slate-900/95 border border-slate-700/80',
        'rounded-xl shadow-2xl backdrop-blur-xl overflow-hidden transition-all duration-300',
        'select-none flex flex-col justify-between'
    ].join(' ');
    
    contenedorFlotante.style.touchAction = 'none';

    contenedorFlotante.innerHTML = `
        <!-- CABECERA Y DATOS DE CANCIÓN -->
        <div id="gg-flotante-header" class="flex items-center justify-between gap-2 px-3 py-2 bg-slate-950/80 border-b border-slate-800 cursor-grab active:cursor-grabbing shrink-0 transition-all">
            <div id="gg-flotante-info" class="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer hover:opacity-90 transition group" title="Ver perfil">
                <img id="gg-flotante-foto" src="" alt="" class="w-8 h-8 rounded-sm object-cover border border-slate-700 shrink-0 bg-slate-800 shadow-sm transition-all duration-200 group-hover:border-indigo-500">
                <div class="min-w-0 flex-1">
                    <p id="gg-flotante-titulo" class="text-xs font-bold text-white truncate leading-tight">—</p>
                    <p id="gg-flotante-subtitulo" class="text-[10px] text-slate-400 group-hover:text-indigo-400 truncate leading-tight mt-0.5 transition-colors">—</p>
                </div>
            </div>
            
            <!-- Botones de ventana -->
            <div class="flex items-center gap-0.5 shrink-0 self-start">
                <button id="gg-flotante-fullscreen" type="button" title="Pantalla completa" class="text-slate-400 hover:text-white p-1 rounded-sm hover:bg-slate-800/80 transition">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path></svg>
                </button>
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

        <!-- BARRA DE CONTROLES MULTIMEDIA -->
        <div id="gg-flotante-controls-bar" class="flex items-center justify-between px-4 py-2 bg-slate-950/90 border-t border-slate-800/80 shrink-0">
            
            <!-- Grupo de Interacción: Like y Ver Perfil -->
            <div class="flex items-center gap-1">
                <!-- Botón de Like con Contador -->
                <button id="gg-flotante-like" type="button" title="Me gusta" class="flex items-center gap-1.5 text-slate-400 hover:text-rose-500 transition p-1.5 rounded-full hover:bg-slate-800/80 active:scale-95">
                    <svg id="gg-flotante-like-icon" class="w-4 h-4 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                    </svg>
                    <span id="gg-flotante-likes-count" class="text-[11px] font-bold text-slate-300">0</span>
                </button>

                <!-- Botón Ver Perfil -->
                <button id="gg-flotante-perfil" type="button" title="Ver perfil" class="flex items-center text-slate-400 hover:text-indigo-400 transition p-1.5 rounded-full hover:bg-slate-800/80 active:scale-95">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                    </svg>
                </button>
            </div>

            <!-- Controles de Reproducción -->
            <div class="flex items-center gap-3">
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
        </div>
    `;

    document.body.appendChild(contenedorFlotante);

    elementosUI = {
        header: contenedorFlotante.querySelector('#gg-flotante-header'),
        infoWrap: contenedorFlotante.querySelector('#gg-flotante-info'),
        foto: contenedorFlotante.querySelector('#gg-flotante-foto'),
        titulo: contenedorFlotante.querySelector('#gg-flotante-titulo'),
        subtitulo: contenedorFlotante.querySelector('#gg-flotante-subtitulo'),
        videoWrap: contenedorFlotante.querySelector('#gg-flotante-video-wrap'),
        btnPlayPause: contenedorFlotante.querySelector('#gg-flotante-playpause'),
        btnPrev: contenedorFlotante.querySelector('#gg-flotante-prev'),
        btnNext: contenedorFlotante.querySelector('#gg-flotante-next'),
        iconoPlayPause: contenedorFlotante.querySelector('#gg-flotante-playpause .icono-estado'),
        btnFullscreen: contenedorFlotante.querySelector('#gg-flotante-fullscreen'),
        btnMin: contenedorFlotante.querySelector('#gg-flotante-min'),
        btnCerrar: contenedorFlotante.querySelector('#gg-flotante-cerrar'),
        btnLike: contenedorFlotante.querySelector('#gg-flotante-like'),
        btnPerfil: contenedorFlotante.querySelector('#gg-flotante-perfil'),
        iconLike: contenedorFlotante.querySelector('#gg-flotante-like-icon'),
        countLikes: contenedorFlotante.querySelector('#gg-flotante-likes-count')
    };

    elementosUI.btnCerrar.addEventListener('click', cerrarFlotante);
    elementosUI.btnMin.addEventListener('click', alternarMinimizado);
    elementosUI.btnFullscreen.addEventListener('click', alternarPantallaCompleta);
    elementosUI.btnPrev.addEventListener('click', reproducirAnterior);
    elementosUI.btnNext.addEventListener('click', reproducirSiguiente);

    // Función reutilizable de redirección al perfil
    const irAlPerfil = () => {
        if (perfilIdActual) {
            const pagina = paginaPerfilActual || 'artista.html';
            const idLimpio = encodeURIComponent(perfilIdActual);
            window.location.href = `${pagina}?id=${idLimpio}`;
        }
    };

    elementosUI.infoWrap.addEventListener('click', irAlPerfil);
    elementosUI.btnPerfil.addEventListener('click', irAlPerfil);

    // Helper visual para reemplazar alert() en el reproductor
    function mostrarToast(mensaje, tipo = 'warn') {
        const toast = document.getElementById('toast');
        const toastMensaje = document.getElementById('toast-mensaje');
        if (!toast || !toastMensaje) return;

        const claseColor = 'bg-[#8d001c]/95 border-rose-500/40 shadow-rose-950/50';
        const icono = '🔔 ';
        toast.className = `fixed bottom-24 md:bottom-6 right-6 z-[100] text-white px-5 py-3.5 rounded-2xl shadow-2xl border text-xs sm:text-sm font-semibold transform transition-all duration-300 backdrop-blur-md flex items-center gap-2.5 translate-y-0 opacity-100 ${claseColor}`;
        toastMensaje.textContent = `${icono}${mensaje}`;

        toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');

        clearTimeout(window._toastTimer);
        window._toastTimer = setTimeout(() => {
            toast.classList.remove('translate-y-0', 'opacity-100');
            toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
        }, 2500);
    }
   
    elementosUI.btnLike.addEventListener('click', async () => {
        if (!cancionActualId) return;

        const user = auth.currentUser;
        if (!user) {
            mostrarToast("Debes iniciar sesión para dar me gusta.", 'warn');
            return;
        }
        try {
            elementosUI.btnLike.disabled = true;
            const res = await toggleLikeCancion(user.uid, cancionActualId);

            if (res && res.exito) {
                const nuevoTotal = res.totalLikes ?? 0;

                if (cancionActualFlotante) {
                    cancionActualFlotante.likes = nuevoTotal;
                    cancionActualFlotante.meGusta = res.liked;
                }

                // Actualizar reproductor flotante
                actualizarBotonLikeUI(res.liked, nuevoTotal);

                // Sincronizar todas las tarjetas asociadas en la vista
                sincronizarLikesEnPagina(cancionActualId, res.liked, nuevoTotal);

                guardarEstado();
            }
        } catch (error) {
            console.error("Error al procesar el me gusta en el reproductor:", error);
        } finally {
            elementosUI.btnLike.disabled = false;
        }
    });

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
// 5. MINIMIZAR / RESTAURAR / PANTALLA COMPLETA
// ==========================================
function alternarMinimizado() {
    if (!contenedorFlotante) return;

    // Minimizar mientras se está expandido dejaría dos estados visuales
    // en conflicto (el CSS de expandido usa !important sobre tamaño y
    // posición). Se sale del modo expandido primero para que el clic en
    // "minimizar" haga lo que la persona espera ver.
    if (expandidoActualmente) {
        alternarPantallaCompleta();
    }

    const minimizado = contenedorFlotante.classList.toggle('gg-flotante-minimizado');

    contenedorFlotante.classList.toggle('w-[320px]', !minimizado);
    contenedorFlotante.classList.toggle('w-[280px]', minimizado);
    contenedorFlotante.classList.toggle('h-[100px]', minimizado);

    elementosUI.videoWrap.classList.toggle('hidden', minimizado);

    const icono = elementosUI.btnMin.querySelector('svg');
    icono.innerHTML = minimizado
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-5v4m0-4h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"></path>'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path>';

    guardarEstado();
}

// Estado del modo expandido, guardado aparte de las clases del DOM para
// poder consultarlo de forma síncrona desde el listener de Escape sin
// tener que volver a leer classList en cada pulsación de tecla.
let expandidoActualmente = false;

// ==========================================
// 5.1 FORZADO DE ORIENTACIÓN HORIZONTAL
// ==========================================
// Dos capas, de mejor a peor caso:
//
//  1. Fullscreen API nativo + screen.orientation.lock('landscape').
//     Es lo ideal (Android/Chrome): el sistema operativo rota de verdad
//     y el widget no tiene que hacer trampas visuales. Se intenta
//     siempre primero porque, cuando funciona, evita el hack de CSS.
//
//  2. Si lock() no existe, no está disponible sin fullscreen nativo, o
//     el propio requestFullscreen() es rechazado (algunos navegadores
//     móviles solo lo permiten dentro de un gesto de usuario muy
//     directo), se cae a rotar el widget con CSS (clase
//     'gg-flotante-rotado', ver inyectarEstilosExpandidoSiHaceFalta)
//     mientras matchMedia detecta que el teléfono sigue en vertical.
//     Esto es puramente visual: el teléfono no rota, el contenido sí.
//
// En ambos casos, si el teléfono YA está en horizontal al expandir
// (o el usuario lo gira físicamente), no se aplica ninguna rotación
// CSS — solo se usa el hack cuando hace falta.

const consultaVertical = window.matchMedia('(orientation: portrait)');

function estaEnVertical() {
    return consultaVertical.matches;
}

async function intentarBloqueoNativo() {
    try {
        if (contenedorFlotante.requestFullscreen) {
            await contenedorFlotante.requestFullscreen();
        } else if (contenedorFlotante.webkitRequestFullscreen) {
            // Safari/iOS antiguos exponen el prefijo, pero no
            // screen.orientation.lock — igual se intenta por si acaso
            // hay soporte parcial en algún navegador basado en Chromium.
            contenedorFlotante.webkitRequestFullscreen();
        } else {
            return false;
        }

        if (screen.orientation && typeof screen.orientation.lock === 'function') {
            await screen.orientation.lock('landscape');
            return true;
        }
        return false;
    } catch (error) {
        // Rechazo esperado en iOS (no existe lock) o cuando el gesto de
        // usuario no cumple los requisitos del navegador para
        // fullscreen — se sigue con el fallback de CSS sin alarmar
        // al usuario con un error en consola.
        return false;
    }
}

function salirDeBloqueoNativo() {
    try {
        if (screen.orientation && typeof screen.orientation.unlock === 'function') {
            screen.orientation.unlock();
        }
    } catch (error) { /* no-op */ }

    try {
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    } catch (error) { /* no-op */ }
}

function aplicarRotacionForzadaSiHaceFalta() {
    if (!contenedorFlotante || !expandidoActualmente) return;
    // Si el fullscreen nativo con lock ya está activo, el sistema
    // operativo se encarga de la orientación real — no hay que rotar
    // nada con CSS encima, o quedaría rotado dos veces.
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        contenedorFlotante.classList.remove('gg-flotante-rotado');
        return;
    }
    contenedorFlotante.classList.toggle('gg-flotante-rotado', estaEnVertical());
}

// Reacciona tanto a que el usuario gire el teléfono como a que el
// fallback deba activarse/desactivarse en caliente mientras el
// reproductor sigue expandido.
consultaVertical.addEventListener('change', aplicarRotacionForzadaSiHaceFalta);

async function alternarPantallaCompleta() {
    if (!contenedorFlotante || !elementosUI) return;

    // Si el widget está minimizado, expandir no tendría sentido visual
    // (partiríamos de una barra de 100px) — lo restauramos primero.
    if (!expandidoActualmente && contenedorFlotante.classList.contains('gg-flotante-minimizado')) {
        alternarMinimizado();
    }

    expandidoActualmente = !expandidoActualmente;
    contenedorFlotante.classList.toggle('gg-flotante-expandido', expandidoActualmente);

    // Bloquear el scroll de la página detrás mientras el reproductor
    // ocupa toda la pantalla — igual que haría un fullscreen nativo.
    document.body.style.overflow = expandidoActualmente ? 'hidden' : '';

    if (expandidoActualmente) {
        const bloqueoNativoOk = await intentarBloqueoNativo();
        if (!bloqueoNativoOk) {
            aplicarRotacionForzadaSiHaceFalta();
        }
    } else {
        salirDeBloqueoNativo();
        contenedorFlotante.classList.remove('gg-flotante-rotado');
    }

    const icono = elementosUI.btnFullscreen.querySelector('svg');
    if (icono) icono.innerHTML = expandidoActualmente ? SVG_CONTRAER : SVG_EXPANDIR;
    elementosUI.btnFullscreen.title = expandidoActualmente ? 'Salir de pantalla completa' : 'Pantalla completa';
}

// Salir del modo expandido con la tecla Escape — comportamiento esperado
// de cualquier "pantalla completa", incluso siendo una implementación
// propia en vez de la API nativa del navegador.
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && expandidoActualmente) {
        alternarPantallaCompleta();
    }
});

// Si el usuario sale del fullscreen nativo con el botón/gesto propio
// del sistema (no con nuestro botón), el evento 'fullscreenchange' es
// la única forma de enterarnos — sin este listener, expandidoActualmente
// quedaría en true, el body seguiría con overflow:hidden, y el widget
// perdería la posibilidad de activar el fallback de rotación CSS.
function manejarCambioFullscreenNativo() {
    const sigueEnFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!sigueEnFullscreen && expandidoActualmente) {
        aplicarRotacionForzadaSiHaceFalta();
    }
}
document.addEventListener('fullscreenchange', manejarCambioFullscreenNativo);
document.addEventListener('webkitfullscreenchange', manejarCambioFullscreenNativo);

// ==========================================
// 6. ARRASTRAR EL WIDGET
// ==========================================
function habilitarArrastre(contenedor, agarradera) {
    let arrastrando = false;
    let offsetX = 0;
    let offsetY = 0;

    agarradera.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        // En modo expandido el widget ocupa toda la pantalla a propósito
        // (ver alternarPantallaCompleta) — no tiene sentido permitir
        // arrastrarlo, y hacerlo solo generaría estilos inline left/top
        // que quedarían pisados por las reglas !important de
        // .gg-flotante-expandido hasta que se salga de ese modo.
        if (contenedor.classList.contains('gg-flotante-expandido')) return;

        arrastrando = true;
        const rect = contenedor.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        contenedor.style.left = `${rect.left}px`;
        contenedor.style.top = `${rect.top}px`;
        contenedor.style.right = 'auto';
        contenedor.style.bottom = 'auto';

        // El contenedor trae 'transition-all duration-300' (Tailwind)
        // para que minimizar/expandir se vean suaves. Esa misma regla
        // agarra los cambios de left/top que este arrastre hace en cada
        // pointermove, así que cada frame del dedo dispara una animación
        // de 300ms detrás — el widget siempre queda persiguiendo al dedo
        // en vez de seguirlo al instante. Se apaga la transición solo
        // mientras dura el arrastre y se restaura al soltar.
        contenedor.style.transition = 'none';

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

    // Se restaura 'transition' (quitando el 'none' inline) al terminar
    // el arrastre por cualquier vía, para no perder la animación suave
    // en minimizar/expandir el resto del tiempo.
    const finalizarArrastre = () => {
        arrastrando = false;
        contenedor.style.transition = '';
    };

    agarradera.addEventListener('pointerup', finalizarArrastre);
    agarradera.addEventListener('pointercancel', finalizarArrastre);
}

// ==========================================
// 7. CONTROL DE LA COLA DE REPRODUCCIÓN
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
        fotoUrl: pista.perfilFotoUrl || pista.fotoUrl || pista.portada,
        perfilId: pista.perfilId || pista.usuarioId || pista.idUsuario || pista.artistaId || null,
        paginaPerfil: pista.paginaPerfil || null,
        tipoPerfil: pista.tipoPerfil || null,
        likes: pista.likesCount ?? pista.likes ?? 0,
        meGusta: pista.meGusta || pista.meGustaUsuario || false
    });
}

// ==========================================
// 8. API PÚBLICA PRINCIPAL
// ==========================================
export async function reproducirEnFlotante(opciones = {}) {
    const videoIdFinal = opciones.videoId || extraerYoutubeId(opciones);

    if (!videoIdFinal) {
        console.warn("reproducirEnFlotante: No se pudo determinar el videoId de YouTube.", opciones);
        return;
    }

    const { 
        cancionId, 
        perfilId,
        paginaPerfil,
        tipoPerfil,
        usuarioId,
        idUsuario,
        artistaId,
        titulo, 
        subtitulo, 
        fotoUrl, 
        likes, 
        likesCount, 
        meGusta = false, 
        iniciarEnSegundo, 
        minimizado 
    } = opciones;

    const yaExistiaWidget = !!contenedorFlotante;
    construirWidgetSiHaceFalta();
    contenedorFlotante.classList.remove('hidden');

    const actualmenteMinimizado = contenedorFlotante.classList.contains('gg-flotante-minimizado');

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
    perfilIdActual = perfilId || usuarioId || idUsuario || artistaId || null;

    // Resolución dinámica de la página de perfil (Artista vs Productor)
    const tipo = tipoPerfil || opciones.tipoPerfil;
    const paginaExplicit = paginaPerfil || opciones.paginaPerfil;

    if (paginaExplicit) {
        paginaPerfilActual = paginaExplicit;
    } else if (tipo === 'productor') {
        paginaPerfilActual = 'productor.html';
    } else {
        paginaPerfilActual = 'artista.html';
    }

    videoIdActual = videoIdFinal;
    fotoUrlActual = fotoUrl || '';

    // Ajuste dinámico de cursor e indicación visual para la cabecera y el botón de perfil
    if (perfilIdActual) {
        elementosUI.infoWrap.classList.add('cursor-pointer');
        elementosUI.infoWrap.setAttribute('title', 'Ver perfil');
        if (elementosUI.btnPerfil) {
            elementosUI.btnPerfil.disabled = false;
            elementosUI.btnPerfil.classList.remove('opacity-50', 'pointer-events-none');
        }
    } else {
        elementosUI.infoWrap.classList.remove('cursor-pointer');
        elementosUI.infoWrap.removeAttribute('title');
        if (elementosUI.btnPerfil) {
            elementosUI.btnPerfil.disabled = true;
            elementosUI.btnPerfil.classList.add('opacity-50', 'pointer-events-none');
        }
    }

    // 1. Extraer total de likes
    let totalInicialLikes = 0;

    if (typeof likesCount === 'number') {
        totalInicialLikes = likesCount;
    } else if (typeof likes === 'number') {
        totalInicialLikes = likes;
    } else if (typeof likes === 'object' && likes !== null) {
        totalInicialLikes = likes.likesCount ?? likes.likes ?? 0;
    } else if (!isNaN(Number(likes)) && likes !== null && likes !== '') {
        totalInicialLikes = Number(likes);
    }

    // 2. Respaldo desde el DOM si no viene en los datos
    if (!totalInicialLikes && cancionActualId) {
        const tarjetaEnPantalla = document.querySelector(`[data-cancion-id="${cancionActualId}"], .btn-like[data-cancion-id="${cancionActualId}"]`);
        if (tarjetaEnPantalla) {
            const contadorEl = tarjetaEnPantalla.querySelector('.count-likes, .likes-count') || tarjetaEnPantalla.closest('.btn-like')?.querySelector('.count-likes');
            if (contadorEl) {
                const valorExtraido = parseInt(contadorEl.textContent.trim(), 10);
                if (!isNaN(valorExtraido)) totalInicialLikes = valorExtraido;
            }
        }
    }

    cancionActualFlotante = {
        id: cancionActualId,
        videoId: videoIdActual,
        perfilId: perfilIdActual,
        paginaPerfil: paginaPerfilActual,
        titulo,
        subtitulo,
        fotoUrl,
        likes: totalInicialLikes,
        meGusta: !!meGusta
    };

    actualizarBotonLikeUI(meGusta, totalInicialLikes);

    const YT = await cargarYoutubeApi();

    if (!player) {
        player = new YT.Player('gg-flotante-video-target', {
            width: '100%',
            height: '100%',
            videoId: videoIdFinal,
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
            player.loadVideoById({
                videoId: videoIdFinal,
                startSeconds: iniciarEnSegundo ? Math.floor(iniciarEnSegundo) : 0
            });
        }
    }
}

// ==========================================
// 9. FUNCIÓN DE REANUDACIÓN AUTOMÁTICA
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
            perfilId: estado.perfilId,
            paginaPerfil: estado.paginaPerfil || 'artista.html',
            titulo: estado.titulo,
            subtitulo: estado.subtitulo,
            fotoUrl: estado.fotoUrl,
            likes: estado.likes || 0,
            meGusta: estado.meGusta || false,
            iniciarEnSegundo: estado.tiempo,
            minimizado: !!estado.minimizado
        });
    }
}