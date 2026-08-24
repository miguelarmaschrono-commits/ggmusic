// ==========================================
// CANCIONES.JS - Feed público de canciones (canciones.html)
// ==========================================

import { db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { configurarMenuSesion } from './ui/session-nav.js';
import { renderizarCancionesHorizontal, alRenderizarTarjetaDiferida } from './ui/render.js';
import { inicializarLikesEnTarjetas, tieneLikeLocal, aplicarEstadoDeLikesEnDOM } from './services/interactions.js';
import { marcarCancionesComoVisto } from './services/feedNovedades.js';
import { reproducirEnFlotante, establecerCola } from './services/floatingPlayer.js';

// IDs de los tres carruseles en los que se divide "Más Populares"
const IDS_POPULARES = {
    top1: 'gridCancionesPopulares1', // Puestos 1 - 10
    top2: 'gridCancionesPopulares2', // Puestos 11 - 20
    top3: 'gridCancionesPopulares3'  // Puestos 21 - 30
};

const ID_GRID_RECIENTES = 'gridCancionesRecientes';

const IDS_CARRUSELES = [
    IDS_POPULARES.top1,
    IDS_POPULARES.top2,
    IDS_POPULARES.top3,
    ID_GRID_RECIENTES
];

const CLAVE_CACHE_FEED_CANCIONES = 'ggmusic_feed_canciones_cache';
const TTL_FEED_MS = 12 * 60 * 60 * 1000; // 12 horas

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
        // Ignorar fallos de cuota/navegación privada
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
// CONTROLES DE CARRUSEL
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
                        <h3 class="text-sm font-bold text-white uppercase tracking-wide">${grupo.titulo}</h3>
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

    // Consolidar canciones para la búsqueda local
    const mapaCanciones = new Map();
    const agregarLista = (lista) => {
        if (Array.isArray(lista)) {
            lista.forEach(item => {
                const id = item.cancionId || item.id || item.videoId;
                if (id && !mapaCanciones.has(id)) mapaCanciones.set(id, item);
            });
        }
    };

    agregarLista(canciones);
    agregarLista(recienPublicadas);
    if (topPorRangoLikes) {
        Object.values(topPorRangoLikes).forEach(grupo => {
            agregarLista(Array.isArray(grupo) ? grupo : grupo?.canciones);
        });
    }

    inicializarBuscador(Array.from(mapaCanciones.values()));

    aplicarEstadoDeLikesEnDOM();
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
// LIKES
// ==========================================
// Toda la lógica de "me gusta" (detectar cuáles ya likeó el usuario,
// procesar el clic, sincronizar contadores en todas las tarjetas
// repetidas y en el reproductor flotante) vive centralizada en
// services/interactions.js -> inicializarLikesEnTarjetas(). Esta página
// solo la invoca una vez al arrancar (ver DOMContentLoaded más abajo) y
// vuelve a pintar el estado conocido cada vez que renderiza tarjetas
// nuevas (aplicarEstadoDeLikesEnDOM(), llamado al final de
// pintarFeedCanciones()). Ya no se registra ningún listener de clic
// propio para '.btn-like' aquí — hacerlo duplicaría el toggle por clic.

// ==========================================
// REPRODUCTOR FLOTANTE
// ==========================================

function inicializarReproductorFlotante() {
    const main = document.querySelector('main');
    if (!main) return;

    main.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-flotante');
        if (!btn) return;

        const cancionId = btn.dataset.cancionId;
        let videoIdFallback = btn.dataset.videoId;
        if (!cancionId && !videoIdFallback) return;

        if (!videoIdFallback && cancionId) {
            videoIdFallback = cancionId.includes('_') ? cancionId.split('_').pop() : cancionId;
        }

        const cache = leerCacheFeedCanciones();
        let listaOrigen = [];

        if (cache) {
            if (cache.canciones && cache.canciones.some(c => (c.cancionId || c.id) === cancionId)) {
                listaOrigen = cache.canciones;
            } else if (cache.recienPublicadas && cache.recienPublicadas.some(c => (c.cancionId || c.id) === cancionId)) {
                listaOrigen = cache.recienPublicadas;
            } else if (cache.topPorRangoLikes) {
                for (const keyId in cache.topPorRangoLikes) {
                    const grupo = cache.topPorRangoLikes[keyId];
                    const cancionesGrupo = Array.isArray(grupo) ? grupo : grupo?.canciones;
                    if (cancionesGrupo?.some(c => (c.cancionId || c.id) === cancionId)) {
                        listaOrigen = cancionesGrupo;
                        break;
                    }
                }
            }
        }

        if (listaOrigen.length > 0) {
            const colaNormalizada = listaOrigen.map(item => {
                const idActual = item.cancionId || item.id;
                const ytId = item.videoId || item.ytId || (idActual && idActual.includes('_') ? idActual.split('_').pop() : idActual);
                const esLiked = tieneLikeLocal(idActual);

                return {
                    videoId: ytId || videoIdFallback,
                    cancionId: idActual,
                    perfilId: item.perfilId || item.usuarioId || item.idUsuario || item.artistaId || btn.dataset.perfilId || null,
                    paginaPerfil: item.paginaPerfil || btn.dataset.paginaPerfil || null,
                    titulo: item.nombre || item.titulo || btn.dataset.titulo || 'Sin título',
                    subtitulo: item.perfilNombre || item.perfilEtiqueta || item.artista || item.nombreArtista || btn.dataset.subtitulo || 'Artista',
                    fotoUrl: item.perfilFotoUrl || item.portada || item.imagen || item.fotoUrl || btn.dataset.foto || '',
                    likesCount: typeof item.likesCount === 'number' ? item.likesCount : (parseInt(btn.dataset.likes, 10) || 0),
                    meGusta: esLiked
                };
            });

            const indice = colaNormalizada.findIndex(item => item.cancionId === cancionId);
            const indiceValido = indice >= 0 ? indice : 0;

            establecerCola(colaNormalizada, indiceValido);
            reproducirEnFlotante(colaNormalizada[indiceValido]);

        } else {
            const esLiked = tieneLikeLocal(cancionId);
            reproducirEnFlotante({
                videoId: videoIdFallback,
                cancionId: cancionId,
                perfilId: btn.dataset.perfilId || null,
                paginaPerfil: btn.dataset.paginaPerfil || null,
                titulo: btn.dataset.titulo,
                subtitulo: btn.dataset.subtitulo,
                fotoUrl: btn.dataset.foto,
                likesCount: parseInt(btn.dataset.likes, 10) || 0,
                meGusta: esLiked
            });
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
        warn:  { clase: 'bg-[#8d001c]', icono: '🔔 ' },
        error: { clase: 'bg-[#DC143C]', icono: '🔔 ' }
    };
    const { clase, icono } = estilosPorTipo[tipo] || estilosPorTipo.info;

    toast.classList.remove('bg-rose-600', 'bg-amber-500', 'bg-red-600', 'bg-[#DC143C]');
    toast.classList.add(clase);
    
    toastMensaje.textContent = `${icono}${mensaje}`;

    toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
    toast.classList.add('translate-y-0', 'opacity-100');

    clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
    }, 2500);
}

// ==========================================
// BUSCADOR Y FILTROS
// ==========================================

const estadoFiltros = {
    texto: '',
    zona: 'Todas',
    genero: 'Todos',
    verificado: 'Todos'
};

function inicializarBuscador(todasLasCanciones) {
    const inputBuscador = document.getElementById('inputBuscador');
    if (!inputBuscador || inputBuscador._listenerCargado) return;
    inputBuscador._listenerCargado = true;

    inputBuscador.addEventListener('input', (e) => {
        estadoFiltros.texto = e.target.value.toLowerCase().trim();
        ejecutarFiltradoCombinado(todasLasCanciones);
    });

    document.querySelectorAll('.dropdown-filtro').forEach(container => {
        const btn = container.querySelector('.btn-dropdown');
        const lista = container.querySelector('.lista-opciones');
        const label = container.querySelector('.label-selected');
        const id = container.id;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.lista-opciones').forEach(l => {
                if (l !== lista) l.classList.add('hidden');
            });
            lista.classList.toggle('hidden');
        });

        lista.querySelectorAll('li').forEach(item => {
            item.addEventListener('click', () => {
                const valor = item.dataset.value;
                label.textContent = item.textContent.trim();
                lista.classList.add('hidden');

                if (id === 'dropdownZona') estadoFiltros.zona = valor;
                if (id === 'dropdownGenero') estadoFiltros.genero = valor;
                if (id === 'dropdownVerificado') estadoFiltros.verificado = valor;

                ejecutarFiltradoCombinado(todasLasCanciones);
            });
        });
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.lista-opciones').forEach(l => l.classList.add('hidden'));
    });
}

function ejecutarFiltradoCombinado(todasLasCanciones) {
    const { texto, zona, genero, verificado } = estadoFiltros;
    const sinFiltros = !texto && zona === 'Todas' && genero === 'Todos' && verificado === 'Todos';

    if (sinFiltros) {
        restaurarSeccionesOriginales();
        const cache = leerCacheFeedCanciones();
        if (cache) {
            pintarFeedCanciones(cache.canciones, cache.recienPublicadas, cache.topPorRangoLikes, cache.fechaTexto, cache.actualizadoEnMs);
        }
        return;
    }

    const coincidencias = todasLasCanciones.filter(c => {
        const titulo = (c.nombre || c.titulo || '').toLowerCase();
        const artista = (c.perfilNombre || c.subtitulo || c.artista || '').toLowerCase();
        const coincideTexto = !texto || titulo.includes(texto) || artista.includes(texto);

        const zonaCancion = c.zona || c.perfilZona || c.ubicacion || '';
        const coincideZona = zona === 'Todas' || zonaCancion.toLowerCase() === zona.toLowerCase();

        const generoCancion = c.genero || '';
        const coincideGenero = genero === 'Todos' || generoCancion.toLowerCase().includes(genero.toLowerCase());

        const esVerificado = c.verificado === true || c.perfilVerificado === true;
        let coincideVerificacion = true;
        if (verificado === 'Verificado') coincideVerificacion = esVerificado;
        if (verificado === 'No Verificado') coincideVerificacion = !esVerificado;

        return coincideTexto && coincideZona && coincideGenero && coincideVerificacion;
    });

    pintarResultadosBusqueda(coincidencias);
}

function pintarResultadosBusqueda(canciones) {
    document.getElementById('gridCancionesPopulares2')?.closest('.space-y-3')?.classList.add('hidden');
    document.getElementById('gridCancionesPopulares3')?.closest('.space-y-3')?.classList.add('hidden');
    document.getElementById('gridCancionesRecientes')?.closest('.space-y-4')?.classList.add('hidden');
    document.getElementById('contenedor-generos')?.classList.add('hidden');

    const contenedor = document.getElementById('gridCancionesPopulares1');
    if (!contenedor) return;

    if (canciones.length === 0) {
        contenedor.innerHTML = `
            <div class="col-span-full py-12 text-center text-slate-400">
                <p class="text-base font-semibold">No se encontraron resultados</p>
                <p class="text-xs text-slate-500 mt-1">Intenta ajustar o limpiar tus filtros de búsqueda.</p>
            </div>`;
    } else {
        renderizarCancionesHorizontal(canciones, 'gridCancionesPopulares1');
    }
    actualizarTodosLosCarruseles();
}

function restaurarSeccionesOriginales() {
    document.getElementById('gridCancionesPopulares2')?.closest('.space-y-3')?.classList.remove('hidden');
    document.getElementById('gridCancionesPopulares3')?.closest('.space-y-3')?.classList.remove('hidden');
    document.getElementById('gridCancionesRecientes')?.closest('.space-y-4')?.classList.remove('hidden');
    document.getElementById('contenedor-generos')?.classList.remove('hidden');
}

// ==========================================
// INICIALIZACIÓN
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    marcarCancionesComoVisto();
    configurarMenuSesion();
    inicializarLikesEnTarjetas();
    inicializarReproductorFlotante();
    inicializarControlesCarruseles();

    // Cada vez que una tarjeta pasa de placeholder a tarjeta real (al
    // acercarse a la pantalla), reaplicamos el estado de "me gusta" ya
    // conocido — aplicarEstadoDeLikesEnDOM() solo alcanza al DOM que
    // existe en el momento en que se llama.
    alRenderizarTarjetaDiferida(() => aplicarEstadoDeLikesEnDOM());
    
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