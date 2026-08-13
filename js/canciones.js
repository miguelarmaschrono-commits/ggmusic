// ==========================================
// CANCIONES.JS - Feed público de canciones (canciones.html)
// ==========================================
// Mismo espíritu que index.js para el feed de perfiles: canciones.html NO
// dispara ninguna consulta pesada a "usuarios" en cada visita. Se lee UN
// solo documento (feedCanciones/actual) que el admin recalcula
// manualmente desde admin.html (botón "Actualizar Feed de Canciones", ver
// services/adminDb.js: actualizarFeedCanciones()). El snapshot ya viene
// aplanado (cada tema con los datos de su perfil dueño denormalizados) y
// ordenado en dos listas: "canciones" (por me gusta) y "recienPublicadas"
// (por fecha).
//
// "MÁS POPULARES" EN TRES BLOQUES DE 10: el snapshot trae hasta 30
// canciones ordenadas por popularidad (LIMITE_FEED_CANCIONES en
// adminDb.js). En vez de una sola grilla larga, se corta en tres tramos
// de 10 (Top 1-10 / 11-20 / 21-30), cada uno pintado como su propio
// carrusel horizontal con scroll-snap — mismo patrón visual que ya usa
// index.js para el Top 15 de artistas/productores (oro/plata/bronce).
//
// CAPA DE CACHÉ LOCAL: igual patrón "pintado optimista + revalidación en
// segundo plano" que ya usan session-nav.js (ggmusic_sesion_cache) e
// index.js (ggmusic_feed_cache) — el feed de canciones tampoco cambia en
// tiempo real, solo cuando el admin lo actualiza, así que no hace falta
// tocar Firestore en cada carga si hay una copia reciente en localStorage.

import { auth, db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { configurarMenuSesion } from './ui/session-nav.js';
import { renderizarCancionesHorizontal } from './ui/render.js';
import { toggleLikeCancion, obtenerMisLikes } from './services/interactions.js';
import { marcarCancionesComoVisto } from './services/feedNovedades.js';

// IDs de los tres carruseles en los que se divide "Más Populares" — deben
// coincidir con los contenedores agregados en canciones.html.
const IDS_POPULARES = {
    top1: 'gridCancionesPopulares1', // Puestos 1 - 10
    top2: 'gridCancionesPopulares2', // Puestos 11 - 20
    top3: 'gridCancionesPopulares3'  // Puestos 21 - 30
};

// CORRECCIÓN APLICADA: Declaración de la constante para "Recién Publicado"
const ID_GRID_RECIENTES = 'gridCancionesRecientes';

// IDs de TODOS los carruseles de la página (3 de "Más Populares" + el
// de "Recién Publicado"). Centraliza la inicialización/actualización
// de flechas y degradado sin repetir la lógica 4 veces.
const IDS_CARRUSELES = [
    IDS_POPULARES.top1,
    IDS_POPULARES.top2,
    IDS_POPULARES.top3,
    ID_GRID_RECIENTES
];

const CLAVE_CACHE_FEED_CANCIONES = 'ggmusic_feed_canciones_cache';
const TTL_FEED_MS = 20 * 60 * 1000; // 20 minutos, igual que el feed de perfiles

// ==========================================
// CACHÉ LOCAL (localStorage)
// ==========================================

function leerCacheFeedCanciones() {
    try {
        const crudo = localStorage.getItem(CLAVE_CACHE_FEED_CANCIONES);
        if (!crudo) return null;
        const datos = JSON.parse(crudo);
        if (!datos || typeof datos.guardadoEn !== 'number' || !Array.isArray(datos.canciones) || !Array.isArray(datos.recienPublicadas)) {
            return null;
        }
        return datos;
    } catch (error) {
        return null;
    }
}

function guardarCacheFeedCanciones({ canciones, recienPublicadas, topPorRangoLikes, fechaTexto, actualizadoEnMs }) {
    try {
        localStorage.setItem(CLAVE_CACHE_FEED_CANCIONES, JSON.stringify({
            canciones: canciones || [],
            recienPublicadas: recienPublicadas || [],
            topPorRangoLikes: topPorRangoLikes || {},
            fechaTexto: fechaTexto || null,
            actualizadoEnMs: actualizadoEnMs || null,
            guardadoEn: Date.now()
        }));
    } catch (error) {
        // localStorage puede fallar (navegación privada, cuota, etc.) — sin
        // pintado optimista en ese caso, pero sin romper nada.
    }
}

function borrarCacheFeedCanciones() {
    try {
        localStorage.removeItem(CLAVE_CACHE_FEED_CANCIONES);
    } catch (error) {}
}

// ==========================================
// INDICADOR DE FRESCURA ("hace X días")
// ==========================================
function formatearTiempoRelativo(actualizadoEnMs) {
    if (!actualizadoEnMs || typeof actualizadoEnMs !== 'number') return null;

    const diferenciaMs = Date.now() - actualizadoEnMs;
    if (diferenciaMs < 0) return 'justo ahora';

    const MINUTO = 60 * 1000;
    const HORA = 60 * MINUTO;
    const DIA = 24 * HORA;
    const SEMANA = 7 * DIA;

    if (diferenciaMs < MINUTO) return 'justo ahora';
    if (diferenciaMs < HORA) {
        const minutos = Math.floor(diferenciaMs / MINUTO);
        return `hace ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
    }
    if (diferenciaMs < DIA) {
        const horas = Math.floor(diferenciaMs / HORA);
        return `hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
    }
    if (diferenciaMs < SEMANA) {
        const dias = Math.floor(diferenciaMs / DIA);
        return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
    }
    const semanas = Math.floor(diferenciaMs / SEMANA);
    if (semanas <= 4) {
        return `hace ${semanas} ${semanas === 1 ? 'semana' : 'semanas'}`;
    }
    return null;
}

// ==========================================
// PINTADO
// ==========================================

function pintarBloquePopulares(sublista, contenedorId) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    const wrapper = contenedor.closest('.space-y-3');

    if (!sublista || sublista.length === 0) {
        contenedor.innerHTML = '';
        if (wrapper) wrapper.classList.add('hidden');
        return;
    }

    if (wrapper) wrapper.classList.remove('hidden');
    renderizarCancionesHorizontal(sublista, contenedorId);
}

// ==========================================
// CONTROLES DE CARRUSEL (flechas + degradado móvil)
// ==========================================
function configurarCarrusel(contenedorId) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    const wrapper = contenedor.closest('.carousel-wrapper');
    if (!wrapper) return;

    const btnPrev = wrapper.querySelector('.carousel-arrow-prev');
    const btnNext = wrapper.querySelector('.carousel-arrow-next');
    const fade = wrapper.querySelector('.carousel-fade-right');

    function actualizarEstado() {
        const maxScroll = contenedor.scrollWidth - contenedor.clientWidth;
        const hayOverflow = maxScroll > 8; 
        const enInicio = contenedor.scrollLeft <= 4;
        const enFinal = contenedor.scrollLeft >= maxScroll - 4;

        [btnPrev, btnNext, fade].forEach(el => el && el.classList.toggle('hidden', !hayOverflow));

        if (btnPrev) {
            btnPrev.classList.toggle('opacity-0', enInicio);
            btnPrev.classList.toggle('pointer-events-none', enInicio);
        }
        if (btnNext) {
            btnNext.classList.toggle('opacity-0', enFinal);
            btnNext.classList.toggle('pointer-events-none', enFinal);
        }
        if (fade) fade.classList.toggle('opacity-0', enFinal);
    }

    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            contenedor.scrollBy({ left: -contenedor.clientWidth * 0.8, behavior: 'smooth' });
        });
    }
    if (btnNext) {
        btnNext.addEventListener('click', () => {
            contenedor.scrollBy({ left: contenedor.clientWidth * 0.8, behavior: 'smooth' });
        });
    }

    contenedor.addEventListener('scroll', actualizarEstado, { passive: true });
    window.addEventListener('resize', actualizarEstado);

    contenedor._actualizarEstadoCarrusel = actualizarEstado;
    actualizarEstado();
}

function inicializarControlesCarruseles() {
    IDS_CARRUSELES.forEach(configurarCarrusel);
}

function actualizarTodosLosCarruseles() {
    requestAnimationFrame(() => {
        IDS_CARRUSELES.forEach(id => {
            const contenedor = document.getElementById(id);
            contenedor?._actualizarEstadoCarrusel?.();
        });
        
        const contenedorGeneros = document.getElementById('contenedor-generos');
        if (contenedorGeneros) {
            const dinamicos = contenedorGeneros.querySelectorAll('.flex.overflow-x-auto');
            dinamicos.forEach(contenedor => {
                contenedor._actualizarEstadoCarrusel?.();
            });
        }
    });
}

function mostrarFeedVacio() {
    [...Object.values(IDS_POPULARES), ID_GRID_RECIENTES].forEach(id => {
        const contenedor = document.getElementById(id);
        if (contenedor) contenedor.innerHTML = '';
    });
    
    const contenedorGeneros = document.getElementById('contenedor-generos');
    if (contenedorGeneros) contenedorGeneros.innerHTML = '';

    const info = document.getElementById('feed-canciones-info-actualizacion');
    if (info) {
        info.textContent = 'El feed de canciones todavía no ha sido publicado por un administrador.';
        info.removeAttribute('title');
    }
    actualizarTodosLosCarruseles();
}

function pintarFeedCanciones(canciones, recienPublicadas, topPorRangoLikes, fechaTexto, actualizadoEnMs) {
    pintarBloquePopulares(canciones.slice(0, 10), IDS_POPULARES.top1);
    pintarBloquePopulares(canciones.slice(10, 20), IDS_POPULARES.top2);
    pintarBloquePopulares(canciones.slice(20, 30), IDS_POPULARES.top3);

    renderizarCancionesHorizontal(recienPublicadas, ID_GRID_RECIENTES);

    // --- NUEVO: Renderizar Top por Rangos de Likes ---
    const contenedorGeneros = document.getElementById('contenedor-generos');
    if (contenedorGeneros) {
        contenedorGeneros.innerHTML = '';
        
        if (topPorRangoLikes) {
            for (const keyId in topPorRangoLikes) {
                const grupo = topPorRangoLikes[keyId];
                if (!grupo || !grupo.canciones || grupo.canciones.length === 0) continue;

                const idContenedor = `carrusel-rango-${keyId}`;
                
                const seccionHTML = `
                    <div class="space-y-3">
                        <h3 class="text-sm font-bold text-fuchsia-400 uppercase tracking-wide">${grupo.titulo}</h3>
                        <div class="carousel-wrapper">
                            <div id="${idContenedor}" class="flex overflow-x-auto gap-6 pb-6 snap-x scrollbar-thin scrollbar-thumb-slate-700"></div>
                            <button type="button" class="carousel-arrow carousel-arrow-prev hidden" aria-label="Ver canciones anteriores">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                            </button>
                            <button type="button" class="carousel-arrow carousel-arrow-next hidden" aria-label="Ver más canciones">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                            </button>
                            <div class="carousel-fade-right hidden"></div>
                        </div>
                    </div>
                `;
                contenedorGeneros.insertAdjacentHTML('beforeend', seccionHTML);
                renderizarCancionesHorizontal(grupo.canciones, idContenedor);
                configurarCarrusel(idContenedor);
            }
        }
    }

    const info = document.getElementById('feed-canciones-info-actualizacion');
    if (info) {
        const relativo = formatearTiempoRelativo(actualizadoEnMs);
        if (relativo) {
            info.textContent = `Catálogo actualizado ${relativo}`;
        } else if (fechaTexto) {
            info.textContent = `Catálogo actualizado el ${fechaTexto}`;
        } else {
            info.textContent = 'Catálogo publicado';
        }
        if (fechaTexto) {
            info.title = `Última actualización: ${fechaTexto}`;
        } else {
            info.removeAttribute('title');
        }
    }

    aplicarEstadoDeLikesSiHaySesion();
    actualizarTodosLosCarruseles();
}

// ==========================================
// CARGA DESDE FIRESTORE
// ==========================================

async function cargarFeedCancionesDesdeFirestore(yaHabiaPintadoOptimista) {
    try {
        const snap = await getDoc(doc(db, 'feedCanciones', 'actual'));

        if (!snap.exists()) {
            borrarCacheFeedCanciones();
            if (!yaHabiaPintadoOptimista) mostrarFeedVacio();
            return;
        }

        const data = snap.data();
        const canciones = Array.isArray(data.canciones) ? data.canciones : [];
        const recienPublicadas = Array.isArray(data.recienPublicadas) ? data.recienPublicadas : [];
        const topPorRangoLikes = data.topPorRangoLikes || {};

        const fecha = data.actualizadoEn?.toDate ? data.actualizadoEn.toDate() : null;
        const fechaTexto = fecha
            ? fecha.toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })
            : null;
        const actualizadoEnMs = fecha ? fecha.getTime() : null;

        pintarFeedCanciones(canciones, recienPublicadas, topPorRangoLikes, fechaTexto, actualizadoEnMs);
        guardarCacheFeedCanciones({ canciones, recienPublicadas, topPorRangoLikes, fechaTexto, actualizadoEnMs });

    } catch (error) {
        console.error("Error al cargar el feed de canciones:", error);
        if (!yaHabiaPintadoOptimista) mostrarFeedVacio();
    }
}

// ==========================================
// LIKES (se resuelven aparte del pintado, tras conocer la sesión)
// ==========================================
let misLikesConocidos = null;

function marcarBotonLike(btn, liked) {
    const icono = btn.querySelector('.icono-like');
    if (!icono) return;
    if (liked) {
        icono.classList.add('text-rose-500', 'fill-current');
        icono.classList.remove('text-slate-400');
    } else {
        icono.classList.remove('text-rose-500', 'fill-current');
        icono.classList.add('text-slate-400');
    }
}

function aplicarEstadoDeLikesSiHaySesion() {
    if (!Array.isArray(misLikesConocidos)) return;
    document.querySelectorAll('.btn-like').forEach(btn => {
        const cancionId = btn.dataset.cancionId;
        if (cancionId && misLikesConocidos.includes(cancionId)) {
            marcarBotonLike(btn, true);
        }
    });
}

function inicializarLikes() {
    if (!auth) return;

    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            misLikesConocidos = null;
            return;
        }
        try {
            misLikesConocidos = await obtenerMisLikes(user.uid);
            aplicarEstadoDeLikesSiHaySesion();
        } catch (error) {
            console.error("Error al cargar mis likes:", error);
        }
    });

    const main = document.querySelector('main');
    if (!main) return;

    main.addEventListener('click', async (e) => {
        const btnLike = e.target.closest('.btn-like');
        if (!btnLike) return;

        const user = auth.currentUser;
        if (!user) return mostrarToast("Debes iniciar sesión para dar me gusta.", 'warn');

        const cancionId = btnLike.dataset.cancionId;
        if (!cancionId) return;

        try {
            btnLike.disabled = true;
            const res = await toggleLikeCancion(user.uid, cancionId);

            if (res && res.exito) {
                marcarBotonLike(btnLike, res.liked);
                const contadorLike = btnLike.querySelector('.count-likes');
                if (contadorLike) {
                    const actual = parseInt(contadorLike.textContent) || 0;
                    contadorLike.textContent = res.liked ? actual + 1 : Math.max(0, actual - 1);
                }
                if (Array.isArray(misLikesConocidos)) {
                    misLikesConocidos = res.liked
                        ? [...misLikesConocidos, cancionId]
                        : misLikesConocidos.filter(id => id !== cancionId);
                }
            } else {
                mostrarToast(res?.mensaje || "No se pudo procesar el like.", 'error');
            }
        } catch (error) {
            console.error("Error al ejecutar toggleLikeCancion:", error);
            mostrarToast("Ocurrió un error al procesar el like.", 'error');
        } finally {
            btnLike.disabled = false;
        }
    });
}

// ==========================================
// TOAST DE NOTIFICACIONES
// ==========================================
let toastTimeoutId = null;

function mostrarToast(mensaje, tipo = 'info') {
    const toast = document.getElementById('toast');
    const toastMensaje = document.getElementById('toast-mensaje');
    if (!toast || !toastMensaje) return;

    const estilosPorTipo = {
        info:  { clase: 'bg-rose-600',  icono: '' },
        warn:  { clase: 'bg-amber-500', icono: '⚠️ ' },
        error: { clase: 'bg-red-600',   icono: '⚠️ ' }
    };
    const { clase, icono } = estilosPorTipo[tipo] || estilosPorTipo.info;

    toast.classList.remove('bg-rose-600', 'bg-amber-500', 'bg-red-600');
    toast.classList.add(clase);
    toastMensaje.textContent = `${icono}${mensaje}`;

    toast.classList.remove('translate-y-20', 'opacity-0');

    clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 2500);
}

// ==========================================
// INICIALIZACIÓN
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    marcarCancionesComoVisto();
    configurarMenuSesion();
    inicializarLikes();
    inicializarControlesCarruseles();
    const cache = leerCacheFeedCanciones();
    
    if (cache) {
        pintarFeedCanciones(cache.canciones, cache.recienPublicadas, cache.topPorRangoLikes, cache.fechaTexto, cache.actualizadoEnMs);

        const antiguedad = Date.now() - cache.guardadoEn;
        if (antiguedad < TTL_FEED_MS) {
            return;
        }
    }

    await cargarFeedCancionesDesdeFirestore(!!cache);
});