// ==========================================
// INDEX.JS - Feed de Inicio (snapshot controlado por admin + caché local)
// ==========================================
// ARQUITECTURA: cada visita a index.html NO dispara dos queries completas
// a "usuarios" (where rol==artista + where rol==productor); en su lugar
// se lee UN solo documento (feedHome/actual) que el admin recalcula
// manualmente desde admin.html (botón "Actualizar Feed", ver
// services/adminDb.js: actualizarFeedHome). El snapshot ya viene ordenado
// (por seguidoresCount desc, empate -> alfabético) y recortado a 15 por
// rol, además de un bloque adicional de "Talento Emergente" (los 5 con
// MENOS seguidores por rol, excluyendo a quienes ya están en el Top 15).
//
// CAPA DE CACHÉ LOCAL: como el feed solo cambia cuando el admin lo
// actualiza manualmente —no es un dato en tiempo real—, no hace falta
// pedirlo a Firestore en cada carga de página. Guardamos el último
// snapshot conocido en localStorage junto a la hora en que se guardó:
//   - Si la copia tiene menos de TTL_FEED_MS de antigüedad, se pinta
//     directo y NO se toca Firestore en absoluto.
//   - Si está vencida (o no existe), se pinta igual si hay algo en caché
//     (para que la portada no quede en blanco mientras se espera la
//     respuesta real), y en paralelo se pide el snapshot fresco para
//     revalidar y refrescar la caché.
// Mismo patrón de "pintado optimista + revalidación en segundo plano" que
// session-nav.js ya usa para el estado de sesión (ggmusic_sesion_cache).

import { db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { configurarMenuSesion } from './ui/session-nav.js';
import { renderizarArtistas, renderizarProductores } from './ui/render.js';
import { inicializarUINotificaciones } from './ui/notificationsUi.js';
import { marcarHomeComoVisto } from './services/feedNovedades.js';

const IDS_ARTISTAS = { oro: 'gridArtistasOro', plata: 'gridArtistasPlata', bronce: 'gridArtistasBronce' };
const IDS_PRODUCTORES = { oro: 'gridProductoresOro', plata: 'gridProductoresPlata', bronce: 'gridProductoresBronce' };

// Contenedores de la sección "Talento Emergente" (Top 5 con menos
// seguidores por rol). Son secciones aparte del Top 15, así que viven
// fuera de los objetos IDS_ARTISTAS / IDS_PRODUCTORES de arriba.
const ID_ARTISTAS_EMERGENTES = 'gridArtistasEmergentes';
const ID_PRODUCTORES_EMERGENTES = 'gridProductoresEmergentes';

const CLAVE_CACHE_FEED = 'ggmusic_feed_cache';
const TTL_FEED_MS = 12 * 60 * 60 * 1000; // 24 horas de caché (1 día completo) // 20 minutos de vida antes de revalidar

// ==========================================
// CACHÉ LOCAL (localStorage)
// ==========================================

function leerCacheFeed() {
    try {
        const crudo = localStorage.getItem(CLAVE_CACHE_FEED);
        if (!crudo) return null;
        const datos = JSON.parse(crudo);
        // Validación mínima de forma, por si quedó algo corrupto de una
        // versión anterior de la caché.
        if (!datos || typeof datos.guardadoEn !== 'number' || !Array.isArray(datos.artistas) || !Array.isArray(datos.productores)) {
            return null;
        }
        // Compatibilidad hacia atrás: una caché guardada por una versión de
        // este archivo anterior a la sección "Talento Emergente" (o anterior
        // al timestamp crudo "actualizadoEnMs" para el indicador de
        // frescura) no tendrá estos campos. En vez de invalidar toda la
        // caché y forzar una lectura innecesaria a Firestore, se normalizan
        // a valores vacíos/nulos; se completarán solos en cuanto llegue la
        // próxima revalidación.
        return {
            ...datos,
            menosSeguidosArtistas: Array.isArray(datos.menosSeguidosArtistas) ? datos.menosSeguidosArtistas : [],
            menosSeguidosProductores: Array.isArray(datos.menosSeguidosProductores) ? datos.menosSeguidosProductores : [],
            actualizadoEnMs: typeof datos.actualizadoEnMs === 'number' ? datos.actualizadoEnMs : null
        };
    } catch (error) {
        // localStorage puede fallar (navegación privada, cuota, etc.) —
        // en ese caso simplemente no hay pintado optimista, sin romper nada.
        return null;
    }
}

function guardarCacheFeed({ artistas, productores, menosSeguidosArtistas, menosSeguidosProductores, fechaTexto, actualizadoEnMs }) {
    try {
        localStorage.setItem(CLAVE_CACHE_FEED, JSON.stringify({
            artistas: artistas || [],
            productores: productores || [],
            menosSeguidosArtistas: menosSeguidosArtistas || [],
            menosSeguidosProductores: menosSeguidosProductores || [],
            fechaTexto: fechaTexto || null,
            actualizadoEnMs: actualizadoEnMs || null,
            guardadoEn: Date.now()
        }));
    } catch (error) {
        // Si falla el guardado no pasa nada grave: la próxima carga
        // simplemente pedirá el snapshot real de nuevo.
    }
}

function borrarCacheFeed() {
    try {
        localStorage.removeItem(CLAVE_CACHE_FEED);
    } catch (error) {}
}

// ==========================================
// PINTADO
// ==========================================

// Pinta un bloque individual del Top 15 (oro/plata/bronce). A diferencia
// de la versión anterior, ahora también controla la visibilidad del
// WRAPPER completo del bloque (el <div class="space-y-3"> que envuelve al
// <h3> "🥇 Puestos 1 - 5" junto con su grilla): si la sublista que le toca
// pintar viene vacía (catálogo con menos de 6, 11, etc. perfiles activos),
// oculta el wrapper entero en vez de dejar un título huérfano flotando
// sobre una grilla en blanco. document.getElementById(contenedorId) es la
// grilla misma; su .parentElement es ese wrapper — no hace falta ningún
// id ni cambio adicional en index.html para lograrlo.
function pintarBloqueTop15(sublista, contenedorId, renderFn) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    const wrapper = contenedor.parentElement;

    if (!sublista || sublista.length === 0) {
        contenedor.innerHTML = '';
        if (wrapper) wrapper.classList.add('hidden');
        return;
    }

    if (wrapper) wrapper.classList.remove('hidden');
    renderFn(sublista, contenedorId);
}

function renderizarBloques(lista, ids, renderFn) {
    pintarBloqueTop15(lista.slice(0, 5), ids.oro, renderFn);
    pintarBloqueTop15(lista.slice(5, 10), ids.plata, renderFn);
    pintarBloqueTop15(lista.slice(10, 15), ids.bronce, renderFn);
}

// Pinta una sección "opcional" (Talento Emergente): si todavía no hay
// candidatos disponibles (catálogo pequeño donde el Top 15 ya incluye a
// todo el mundo), no reutiliza el mensaje de error de
// renderizarArtistas/renderizarProductores (ese está pensado para una
// búsqueda sin resultados, no para "esta sección aún no tiene contenido"),
// sino un texto más suave e invitador.
function pintarSeccionOpcional(lista, contenedorId, renderFn, mensajeVacio) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    if (!lista || lista.length === 0) {
        contenedor.innerHTML = `<p class="col-span-full text-center text-slate-500 text-sm py-6">${mensajeVacio}</p>`;
        return;
    }
    renderFn(lista, contenedorId);
}

// ==========================================
// INDICADOR DE FRESCURA ("hace X días")
// ==========================================
// Se calcula en el momento del pintado (no al leer Firestore), para que
// sea preciso incluso si el snapshot viene de una caché local que lleva
// un rato guardada. Devuelve null para vencimientos muy lejanos (más de
// ~4 semanas), caso en el que se prefiere mostrar la fecha absoluta
// completa en vez de un contador relativo poco intuitivo ("hace 6 semanas"
// dice menos que "actualizado el 12 de julio de 2026").
function formatearTiempoRelativo(actualizadoEnMs) {
    if (!actualizadoEnMs || typeof actualizadoEnMs !== 'number') return null;

    const diferenciaMs = Date.now() - actualizadoEnMs;
    if (diferenciaMs < 0) return 'justo ahora'; // reloj del cliente desincronizado, no romper la UI

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

    return null; // demasiado antiguo -> que el llamador use la fecha absoluta
}

function mostrarFeedVacio() {
    [
        ...Object.values(IDS_ARTISTAS),
        ...Object.values(IDS_PRODUCTORES),
        ID_ARTISTAS_EMERGENTES,
        ID_PRODUCTORES_EMERGENTES
    ].forEach(id => {
        const contenedor = document.getElementById(id);
        if (contenedor) contenedor.innerHTML = '';
    });
    const info = document.getElementById('feed-info-actualizacion');
    if (info) {
        info.textContent = 'El feed de inicio todavía no ha sido publicado por un administrador.';
        info.removeAttribute('title');
    }
}

function pintarFeed(artistas, productores, menosSeguidosArtistas, menosSeguidosProductores, fechaTexto, actualizadoEnMs) {
    renderizarBloques(artistas, IDS_ARTISTAS, renderizarArtistas);
    renderizarBloques(productores, IDS_PRODUCTORES, renderizarProductores);

    pintarSeccionOpcional(
        menosSeguidosArtistas,
        ID_ARTISTAS_EMERGENTES,
        renderizarArtistas,
        'Todavía no hay más artistas para destacar aquí — ¡vuelve pronto!'
    );
    pintarSeccionOpcional(
        menosSeguidosProductores,
        ID_PRODUCTORES_EMERGENTES,
        renderizarProductores,
        'Todavía no hay más productores para destacar aquí — ¡vuelve pronto!'
    );

    const info = document.getElementById('feed-info-actualizacion');
    if (info) {
        const relativo = formatearTiempoRelativo(actualizadoEnMs);

        if (relativo) {
            info.textContent = `Ranking actualizado ${relativo}`;
        } else if (fechaTexto) {
            info.textContent = `Ranking actualizado el ${fechaTexto}`;
        } else {
            info.textContent = 'Ranking publicado';
        }

        // La fecha absoluta siempre queda disponible como tooltip, incluso
        // cuando el texto visible es relativo — así quien quiera precisión
        // exacta solo tiene que pasar el mouse por encima.
        if (fechaTexto) {
            info.title = `Última actualización: ${fechaTexto}`;
        } else {
            info.removeAttribute('title');
        }
    }
}

// ==========================================
// CARGA DESDE FIRESTORE (solo cuando la caché falta o venció)
// ==========================================

/**
 * @param {boolean} yaHabiaPintadoOptimista - true si ya se pintó algo en
 * pantalla desde la caché antes de llamar a esta función. Si es así y
 * esta consulta falla (o el documento ya no existe), dejamos el pintado
 * optimista tal cual en vez de reemplazarlo por un estado vacío/error —
 * es preferible mostrarle al usuario un ranking un poco desactualizado
 * que romper la portada por un problema de red pasajero.
 */
async function cargarFeedDesdeFirestore(yaHabiaPintadoOptimista) {
    try {
        const snap = await getDoc(doc(db, 'feedHome', 'actual'));

        if (!snap.exists()) {
            borrarCacheFeed();
            if (!yaHabiaPintadoOptimista) mostrarFeedVacio();
            return;
        }

        const data = snap.data();
        const artistas = Array.isArray(data.artistas) ? data.artistas : [];
        const productores = Array.isArray(data.productores) ? data.productores : [];
        const menosSeguidosArtistas = Array.isArray(data.menosSeguidosArtistas) ? data.menosSeguidosArtistas : [];
        const menosSeguidosProductores = Array.isArray(data.menosSeguidosProductores) ? data.menosSeguidosProductores : [];

        const fecha = data.actualizadoEn?.toDate ? data.actualizadoEn.toDate() : null;
        const fechaTexto = fecha
            ? fecha.toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })
            : null;
        // Timestamp crudo en milisegundos, guardado aparte de fechaTexto:
        // fechaTexto es una cadena ya formateada (útil como tooltip
        // absoluto), pero para calcular "hace X días" en cualquier momento
        // futuro —incluso leyendo desde la caché local mucho después—
        // hace falta el valor numérico original, no el texto ya congelado.
        const actualizadoEnMs = fecha ? fecha.getTime() : null;

        pintarFeed(artistas, productores, menosSeguidosArtistas, menosSeguidosProductores, fechaTexto, actualizadoEnMs);
        guardarCacheFeed({ artistas, productores, menosSeguidosArtistas, menosSeguidosProductores, fechaTexto, actualizadoEnMs });

    } catch (error) {
        console.error("Error al cargar el feed de inicio:", error);
        if (!yaHabiaPintadoOptimista) mostrarFeedVacio();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    marcarHomeComoVisto();
    inicializarUINotificaciones();
    configurarMenuSesion(); // 👈 Unificado aquí

    const cache = leerCacheFeed();

    if (cache) {
        // 1. Pintado optimista, instantáneo, sin tocar Firestore.
        pintarFeed(cache.artistas, cache.productores, cache.menosSeguidosArtistas, cache.menosSeguidosProductores, cache.fechaTexto, cache.actualizadoEnMs);

        const antiguedad = Date.now() - cache.guardadoEn;
        if (antiguedad < TTL_FEED_MS) {
            return;
        }
    }

    // 2. Sin caché, o caché vencida: pedir el snapshot real.
    await cargarFeedDesdeFirestore(!!cache);
});