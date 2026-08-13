// js/services/feedNovedades.js
// ==========================================
// INDICADOR "HAY NOVEDADES" EN EL NAV (sin Web Push)
// ==========================================
// Alternativa a las notificaciones push (hoy deshabilitadas — ver
// services/notifications.js): comparamos el campo "actualizadoEn" que
// feedHome/actual y feedCanciones/actual YA guardan (ver adminDb.js)
// contra la última vez que ESTE navegador confirmó haber visto esa
// sección (index.html / canciones.html). Si el snapshot es más nuevo que
// esa última visita, se pinta un punto rojo en los enlaces de nav que
// apuntan a esa sección.
//
// POR QUÉ NO BASTA CON LEER SOLO LAS CACHÉS QUE YA MANTIENEN INDEX.JS Y
// CANCIONES.JS: esas cachés (ggmusic_feed_cache / ggmusic_feed_canciones_
// cache) SOLO se actualizan visitando esa página exacta — y en la misma
// visita también se marcaría como "vista". Comparar únicamente esas dos
// cachés entre sí nunca detectaría una novedad, porque ambos valores
// siempre se escriben juntos, en el mismo instante. Para que el punto
// tenga sentido en OTRAS páginas (ej. avisar en index.html que hay
// canciones nuevas sin haber entrado a canciones.html todavía), este
// módulo necesita poder refrescar el "actualizadoEn" de forma
// independiente de la visita a esa página.
//
// CÓMO SE MANTIENE BARATO: se reutiliza PRIMERO la caché completa que ya
// mantienen index.js/canciones.js si sigue fresca (mismo TTL de 20 min);
// solo si esa caché no existe o venció, se usa una caché propia y liviana
// (ggmusic_meta_home / ggmusic_meta_canciones, solo con el timestamp, sin
// el resto del feed); y solo si AMBAS faltan o vencieron se hace una
// lectura real a Firestore. En el peor caso: 1 lectura de documento por
// sección cada 20 minutos por navegador — el mismo costo/patrón que el
// resto del proyecto ya acepta para estos snapshots.

import { db } from '../firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const TTL_NOVEDADES_MS = 12 * 60 * 60 * 1000; // 24 horas de caché // mismo TTL que index.js/canciones.js

const CLAVE_CACHE_FEED_HOME = 'ggmusic_feed_cache';                 // la mantiene index.js
const CLAVE_CACHE_FEED_CANCIONES = 'ggmusic_feed_canciones_cache';  // la mantiene canciones.js
const CLAVE_META_HOME = 'ggmusic_meta_home';           // liviana, la mantiene este archivo
const CLAVE_META_CANCIONES = 'ggmusic_meta_canciones'; // liviana, la mantiene este archivo
const CLAVE_VISTOS = 'ggmusic_feed_vistos';

// ==========================================
// HELPERS GENÉRICOS DE LOCALSTORAGE
// ==========================================
function leerJSON(clave) {
    try {
        const crudo = localStorage.getItem(clave);
        return crudo ? JSON.parse(crudo) : null;
    } catch (error) {
        return null;
    }
}

function guardarJSON(clave, valor) {
    try {
        localStorage.setItem(clave, JSON.stringify(valor));
    } catch (error) {
        // localStorage puede fallar (privado, cuota, etc.) — sin caché
        // optimista en ese caso, pero sin romper nada.
    }
}

// ==========================================
// "VISTOS" (marca de que el usuario ya entró a esa sección)
// ==========================================
function leerVistos() {
    return leerJSON(CLAVE_VISTOS) || {};
}

/** Marca la sección "home" (index.html / Top 15) como vista ahora mismo. */
export function marcarHomeComoVisto() {
    const vistos = leerVistos();
    vistos.homeVistoMs = Date.now();
    guardarJSON(CLAVE_VISTOS, vistos);
}

/** Marca la sección de canciones.html como vista ahora mismo. */
export function marcarCancionesComoVisto() {
    const vistos = leerVistos();
    vistos.cancionesVistoMs = Date.now();
    guardarJSON(CLAVE_VISTOS, vistos);
}

// ==========================================
// LECTURA DEL "actualizadoEn" REMOTO (solo cuando de verdad hace falta)
// ==========================================
async function leerActualizadoEnRemoto(coleccion) {
    try {
        const snap = await getDoc(doc(db, coleccion, 'actual'));
        if (!snap.exists()) return null;
        const fecha = snap.data().actualizadoEn?.toDate ? snap.data().actualizadoEn.toDate() : null;
        return fecha ? fecha.getTime() : null;
    } catch (error) {
        console.error(`Error al consultar actualizadoEn de ${coleccion}:`, error);
        return null;
    }
}

/**
 * Devuelve el actualizadoEnMs de una sección, priorizando en este orden:
 *   1. La caché COMPLETA que ya mantiene index.js/canciones.js, si sigue
 *      fresca (evita cualquier lectura duplicada en esas mismas páginas).
 *   2. La caché liviana propia de este módulo, si sigue fresca.
 *   3. Una lectura real a Firestore (y se guarda en la caché liviana).
 */
async function obtenerActualizadoEnMs({ claveCacheCompleta, claveCacheMeta, coleccion }) {
    const ahora = Date.now();

    const completa = leerJSON(claveCacheCompleta);
    if (completa && typeof completa.actualizadoEnMs === 'number' && typeof completa.guardadoEn === 'number') {
        if (ahora - completa.guardadoEn < TTL_NOVEDADES_MS) {
            return completa.actualizadoEnMs;
        }
    }

    const meta = leerJSON(claveCacheMeta);
    if (meta && typeof meta.actualizadoEnMs === 'number' && typeof meta.guardadoEn === 'number') {
        if (ahora - meta.guardadoEn < TTL_NOVEDADES_MS) {
            return meta.actualizadoEnMs;
        }
    }

    const actualizadoEnMs = await leerActualizadoEnRemoto(coleccion);
    guardarJSON(claveCacheMeta, { actualizadoEnMs, guardadoEn: ahora });
    return actualizadoEnMs;
}

/**
 * Punto de entrada usado por session-nav.js en TODAS las páginas.
 * @returns {Promise<{ hayNovedadHome: boolean, hayNovedadCanciones: boolean }>}
 */
export async function obtenerEstadoNovedades() {
    const [homeActualizadoEnMs, cancionesActualizadoEnMs] = await Promise.all([
        obtenerActualizadoEnMs({
            claveCacheCompleta: CLAVE_CACHE_FEED_HOME,
            claveCacheMeta: CLAVE_META_HOME,
            coleccion: 'feedHome'
        }),
        obtenerActualizadoEnMs({
            claveCacheCompleta: CLAVE_CACHE_FEED_CANCIONES,
            claveCacheMeta: CLAVE_META_CANCIONES,
            coleccion: 'feedCanciones'
        })
    ]);

    const vistos = leerVistos();

    const hayNovedadHome =
        typeof homeActualizadoEnMs === 'number' &&
        (typeof vistos.homeVistoMs !== 'number' || homeActualizadoEnMs > vistos.homeVistoMs);

    const hayNovedadCanciones =
        typeof cancionesActualizadoEnMs === 'number' &&
        (typeof vistos.cancionesVistoMs !== 'number' || cancionesActualizadoEnMs > vistos.cancionesVistoMs);

    return { hayNovedadHome, hayNovedadCanciones };
}