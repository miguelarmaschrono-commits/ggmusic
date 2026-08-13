// js/services/adminDb.js
import { db } from '../firebase-config.js';
import { 
    doc, 
    updateDoc, 
    setDoc,
    serverTimestamp,
    collection, 
    getDocs,
    query,
    where,
    increment 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"; 

// NOTA DE CORRECCIÓN: las cuatro funciones de este archivo apuntaban a una
// colección "artistas" que ningún flujo de registro real escribe jamás
// (auth.js -> registrarCuenta() guarda todo en "usuarios"). El panel de
// admin mostraba una tabla siempre vacía y ninguna acción tenía efecto
// real, sin arrojar ningún error visible. Ahora todo apunta a "usuarios".
//
// Las acciones (verificar, suspender, ampliar límite) son agnósticas de
// rol: solo necesitan el uid del documento. Hay una sola versión de cada
// una, reutilizada tanto para artistas como para productores desde
// admin.html, en vez de duplicar 4 funciones por cada rol.

// ==========================================
// LISTADOS (uno por rol, misma colección)
// ==========================================

export async function obtenerTodosLosArtistas() {
    try {
        const q = query(collection(db, "usuarios"), where("rol", "==", "artista"));
        const snapshot = await getDocs(q);
        let artistas = [];
        snapshot.forEach(doc => {
            artistas.push({ id: doc.id, ...doc.data() });
        });
        return artistas;
    } catch (error) {
        console.error("Error obteniendo artistas: ", error);
        return [];
    }
}

export async function obtenerTodosLosProductores() {
    try {
        const q = query(collection(db, "usuarios"), where("rol", "==", "productor"));
        const snapshot = await getDocs(q);
        let productores = [];
        snapshot.forEach(doc => {
            productores.push({ id: doc.id, ...doc.data() });
        });
        return productores;
    } catch (error) {
        console.error("Error obteniendo productores: ", error);
        return [];
    }
}

// Oyentes: no tienen tabla de gestión propia en el panel (no se verifican,
// no se suspenden, no tienen límite de temas), pero el dashboard sí
// necesita saber cuántos hay para el contador general de la plataforma.
export async function obtenerTodosLosOyentes() {
    try {
        const q = query(collection(db, "usuarios"), where("rol", "==", "oyente"));
        const snapshot = await getDocs(q);
        let oyentes = [];
        snapshot.forEach(doc => {
            oyentes.push({ id: doc.id, ...doc.data() });
        });
        return oyentes;
    } catch (error) {
        console.error("Error obteniendo oyentes: ", error);
        return [];
    }
}

// ==========================================
// ACCIONES (agnósticas de rol — reciben el uid del perfil)
// ==========================================

// 1. Cambiar estado de verificación
export async function cambiarEstadoVerificacion(uid, estadoActual) {
    try {
        const ref = doc(db, "usuarios", uid);
        // Si es undefined/null (perfil legado) lo trata como no verificado,
        // al invertirlo queda en true.
        const nuevoEstado = estadoActual === true ? false : true; 
        await updateDoc(ref, { verificado: nuevoEstado });
        return { exito: true };
    } catch (error) {
        console.error("Error al actualizar estado de verificación:", error);
        return { exito: false };
    }
}

// 2. Suspender / Reactivar — reemplaza al borrado permanente que tenía
// esta función antes (eliminarArtista con deleteDoc). Un perfil suspendido
// deja de renderizarse en explorar.html / explorar-productores.html /
// index.html / su propia página de perfil (ver db.js, artista.js,
// productor.js), pero ningún dato se borra y el admin puede reactivarlo
// después con la misma función.
//
// LIMITACIÓN CONOCIDA: esto solo cambia un campo en Firestore. NO
// deshabilita la cuenta de Firebase Authentication asociada — eso requiere
// el Admin SDK desde un backend/Cloud Function, no es posible desde código
// de cliente. La persona suspendida puede seguir iniciando sesión; solo
// que su perfil público deja de ser visible para otros.
export async function toggleSuspension(uid, estadoActual) {
    const yaSuspendido = estadoActual === true;
    const mensajeConfirm = yaSuspendido
        ? '¿Reactivar este perfil? Volverá a ser visible en los paneles públicos.'
        : '¿Suspender este perfil? Dejará de ser visible en los paneles públicos, pero no se borra ningún dato y se puede reactivar después.';

    if (!confirm(mensajeConfirm)) return { exito: false };

    try {
        const ref = doc(db, "usuarios", uid);
        await updateDoc(ref, { suspendido: !yaSuspendido });
        return { exito: true, suspendido: !yaSuspendido };
    } catch (error) {
        console.error("Error al cambiar el estado de suspensión:", error);
        return { exito: false };
    }
}

// 3. Ampliar límite de temas/trabajos (Flexible — botones 5/10/20/50/100)
export async function ampliarLimite(uid, cantidad) {
    if (!confirm(`¿Añadir ${cantidad} espacios más al límite de este perfil?`)) return { exito: false };

    try {
        const ref = doc(db, "usuarios", uid);
        await updateDoc(ref, { limiteCanciones: increment(cantidad) });
        return { exito: true };
    } catch (error) {
        console.error("Error al ampliar el límite: ", error);
        return { exito: false };
    }
}

// ==========================================
// 4. FEED DE INICIO (Top 15 + Talento Emergente / snapshot manual)
// ==========================================
// Este documento (feedHome/actual) es lo único que index.html consulta al
// cargar. Se recalcula bajo demanda (botón "Actualizar Feed" en
// admin.html), NO en cada visita — así el home no dispara una lectura
// completa de "usuarios" por cada persona que entra al sitio.
//
// Ranking del Top 15: por un "score" combinado (seguidoresCount * 2 + suma
// de likesCount de todos sus temas) descendente; en caso de empate,
// prioridad alfabética por nombre. Se recorta a 15 por rol y se guarda ya
// ordenado, listo para que index.js lo corte en 3 bloques de 5
// (🥇 1-5, 🥈 6-10, 🥉 11-15) sin tener que volver a ordenar nada del lado
// del cliente.
//
// El peso 2x para seguidores es intencional: seguir a alguien es un
// compromiso más fuerte que darle like a un tema suelto (requiere sesión
// iniciada y es una acción explícita hacia el perfil completo, no hacia
// una sola canción), así que debe pesar más en el ranking. Ambos números
// ya vienen incluidos en la misma lectura de "usuarios" que este archivo
// hace para armar la tabla de gestión del admin — sumar los likes de
// "temas" aquí no agrega ninguna lectura extra a Firestore, solo un
// cálculo en memoria sobre datos que ya se descargaron.
//
// "Talento Emergente" (menosSeguidosArtistas / menosSeguidosProductores):
// los LIMITE_EMERGENTES perfiles por rol con MENOS seguidores (orden
// ascendente puro por seguidoresCount, sin el peso de los likes que sí
// aplica al Top 15, porque aquí el criterio a resaltar es exactamente
// ese: quién tiene menos gente siguiéndolo todavía). Se excluye
// deliberadamente a cualquiera que ya haya quedado dentro del Top 15 — en
// un catálogo pequeño, sin esa exclusión, "los de menos seguidores" y "el
// final del Top 15" exterior tienden a ser casi el mismo grupo de personas, y el
// propósito de esta sección (darle una vitrina a quien normalmente no
// aparece en ningún ranking) se perdería.
const LIMITE_EMERGENTES = 10;

function calcularTotalLikes(temas) {
    if (!Array.isArray(temas)) return 0;
    return temas.reduce((suma, tema) => suma + (tema.likesCount || 0), 0);
}

function calcularScoreRanking(perfil) {
    const seguidores = perfil.seguidoresCount || 0;
    const likes = calcularTotalLikes(perfil.temas);
    return (seguidores * 2) + likes;
}

function compararPorScoreYNombre(a, b) {
    const scoreA = calcularScoreRanking(a);
    const scoreB = calcularScoreRanking(b);
    if (scoreB !== scoreA) return scoreB - scoreA;
    // Empate -> prioridad alfabética (A antes que B)
    return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
}

// Orden ascendente por seguidoresCount (menos seguidores primero); en
// empate (típicamente 0 vs 0 entre perfiles nuevos), alfabético — así el
// resultado es determinístico y no depende del orden arbitrario en que
// Firestore devolvió el snapshot.
function compararPorMenosSeguidores(a, b) {
    const seguidoresA = a.seguidoresCount || 0;
    const seguidoresB = b.seguidoresCount || 0;
    if (seguidoresA !== seguidoresB) return seguidoresA - seguidoresB;
    return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
}

// Snapshots livianos reutilizables: el mismo "shape" reducido se usa tanto
// para el Top 15 como para Talento Emergente, así renderizarArtistas /
// renderizarProductores (ui/render.js) no necesitan ninguna rama especial
// según qué sección estén pintando.
function mapearSnapshotArtista(a) {
    return {
        id: a.id,
        nombre: a.nombre || 'Artista',
        fotoUrl: a.fotoUrl || '',
        genero: a.genero || '',
        generoSecundario: a.generoSecundario || '',
        zona: a.zona || '',
        verificado: a.verificado === true,
        seguidoresCount: a.seguidoresCount || 0,
        totalLikes: calcularTotalLikes(a.temas)
    };
}

function mapearSnapshotProductor(p) {
    return {
        id: p.id,
        nombre: p.nombre || 'Productor',
        fotoUrl: p.fotoUrl || '',
        especialidad: p.especialidad || '',
        zona: p.zona || '',
        verificado: p.verificado === true,
        seguidoresCount: p.seguidoresCount || 0,
        totalLikes: calcularTotalLikes(p.temas),
        // Precalculado aquí para no tener que guardar el array completo de
        // "temas" (que puede pesar bastante) en el snapshot.
        cantidadTrabajos: Array.isArray(p.temas) && p.temas.length > 0
            ? p.temas.length
            : (p.temaDestacado ? 1 : 0)
    };
}

export async function actualizarFeedHome() {
    try {
        const [artistas, productores] = await Promise.all([
            obtenerTodosLosArtistas(),
            obtenerTodosLosProductores()
        ]);

        // Los perfiles suspendidos no deben aparecer en la portada pública,
        // aunque estas dos funciones (versión "admin") sí los traigan para
        // la tabla de gestión.
        const artistasActivos = artistas.filter(a => a.suspendido !== true);
        const productoresActivos = productores.filter(p => p.suspendido !== true);

        // --- TOP 15 ---
        const top15Artistas = [...artistasActivos]
            .sort(compararPorScoreYNombre)
            .slice(0, 15)
            .map(mapearSnapshotArtista);

        const top15Productores = [...productoresActivos]
            .sort(compararPorScoreYNombre)
            .slice(0, 15)
            .map(mapearSnapshotProductor);

        // --- TALENTO EMERGENTE (Top LIMITE_EMERGENTES con menos seguidores) ---
        const idsEnTop15Artistas = new Set(top15Artistas.map(a => a.id));
        const menosSeguidosArtistas = artistasActivos
            .filter(a => !idsEnTop15Artistas.has(a.id))
            .sort(compararPorMenosSeguidores)
            .slice(0, LIMITE_EMERGENTES)
            .map(mapearSnapshotArtista);

        const idsEnTop15Productores = new Set(top15Productores.map(p => p.id));
        const menosSeguidosProductores = productoresActivos
            .filter(p => !idsEnTop15Productores.has(p.id))
            .sort(compararPorMenosSeguidores)
            .slice(0, LIMITE_EMERGENTES)
            .map(mapearSnapshotProductor);

        await setDoc(doc(db, "feedHome", "actual"), {
            artistas: top15Artistas,
            productores: top15Productores,
            menosSeguidosArtistas,
            menosSeguidosProductores,
            actualizadoEn: serverTimestamp(),
            totalArtistasConsiderados: artistas.length,
            totalProductoresConsiderados: productores.length
        });

        return {
            exito: true,
            totalArtistas: top15Artistas.length,
            totalProductores: top15Productores.length,
            totalEmergentesArtistas: menosSeguidosArtistas.length,
            totalEmergentesProductores: menosSeguidosProductores.length
        };
    } catch (error) {
        console.error("Error al actualizar el feed de inicio:", error);
        return { exito: false, mensaje: error.message };
    }
}

// ==========================================
// 5. FEED DE CANCIONES (Top N canciones / snapshot manual)
// ==========================================
// Mismo espíritu que actualizarFeedHome(): NO existe una colección
// "canciones" independiente (ver Firestore_rules.txt) — cada tema vive
// embebido en usuarios/{uid}.temas[]. Pintar un feed de canciones en la
// portada pública exigiría, sin este snapshot, recorrer TODOS los
// perfiles de artistas y productores en cada visita solo para armar una
// lista plana de canciones. En vez de eso, este snapshot se calcula una
// sola vez aquí (bajo demanda, botón de admin) y canciones.js simplemente
// lee un único documento ya aplanado y ordenado.
//
// "Aplanar" significa: cada elemento del array "temas" de cada perfil se
// convierte en un objeto de canción independiente, pero como un tema por
// sí solo no sabe a quién pertenece (más allá de que su cancionId
// compuesto, ver interactions.js: descomponerCancionId, incluye el id del
// perfil), se le inyectan aquí los datos del perfil dueño que la tarjeta
// pública necesita mostrar (nombre, foto, zona, género/especialidad,
// verificado, tipo de perfil).
const LIMITE_FEED_CANCIONES = 30;

// Mismo extractor de ID de YouTube que usa interactions.js — se reescribe
// aquí en vez de importarlo porque adminDb.js es un servicio de datos y
// no debería depender de otro servicio solo por una función utilitaria de
// 5 líneas; evita acoplar dos archivos que hoy son independientes.
function extraerIdYouTubeAdmin(url) {
    if (!url) return null;
    if (url.includes('embed/')) {
        return url.split('embed/')[1].split('?')[0].split('&')[0];
    }
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2] && match[2].length === 11) ? match[2] : null;
}

/**
 * Convierte el array "temas" de UN perfil en una lista de objetos de
 * canción ya listos para la tarjeta pública, con los datos del perfil
 * dueño inyectados. Se usa tanto para artistas como para productores
 * (recibe "tipoPerfil" para que la tarjeta sepa a qué página de perfil
 * enlazar y qué etiqueta secundaria mostrar).
 */
function aplanarTemasDePerfil(perfil, tipoPerfil) {
    const temas = Array.isArray(perfil.temas) ? perfil.temas : [];

    return temas
        .filter(tema => tema.url && tema.url.trim() !== '')
        .map(tema => {
            const videoId = extraerIdYouTubeAdmin(tema.url);
            return {
                cancionId: videoId ? `${perfil.id}_${videoId}` : null,
                nombre: tema.nombre || 'Sin título',
                url: tema.url,
                genero: tema.genero || '',
                fecha: tema.fecha || '',
                lista: tema.lista || '',
                likesCount: tema.likesCount || 0,
                // Datos del perfil dueño, denormalizados en cada canción
                perfilId: perfil.id,
                perfilNombre: perfil.nombre || (tipoPerfil === 'productor' ? 'Productor' : 'Artista'),
                perfilFotoUrl: perfil.fotoUrl || '',
                perfilZona: perfil.zona || '',
                perfilEtiqueta: tipoPerfil === 'productor' ? (perfil.especialidad || '') : (perfil.genero || ''),
                perfilVerificado: perfil.verificado === true,
                tipoPerfil
            };
        })
        .filter(cancion => cancion.cancionId !== null); // sin ID de YouTube válido, no es enlazable
}

function compararCancionesPorLikesYFecha(a, b) {
    if (b.likesCount !== a.likesCount) return b.likesCount - a.likesCount;
    // Empate en likes -> más reciente primero. "fecha" es un string
    // YYYY-MM-DD, así que la comparación lexicográfica ya es cronológica;
    // las canciones sin fecha (string vacío) quedan al final del empate.
    return (b.fecha || '').localeCompare(a.fecha || '');
}

export async function actualizarFeedCanciones() {
    try {
        const [artistas, productores] = await Promise.all([
            obtenerTodosLosArtistas(),
            obtenerTodosLosProductores()
        ]);

        // Igual que en el feed de perfiles: los suspendidos no deben
        // aparecer en la portada pública aunque sí se traigan para la
        // tabla de gestión del admin.
        const artistasActivos = artistas.filter(a => a.suspendido !== true);
        const productoresActivos = productores.filter(p => p.suspendido !== true);

        const todasLasCanciones = [
            ...artistasActivos.flatMap(a => aplanarTemasDePerfil(a, 'artista')),
            ...productoresActivos.flatMap(p => aplanarTemasDePerfil(p, 'productor'))
        ];

        const topCanciones = [...todasLasCanciones]
            .sort(compararCancionesPorLikesYFecha)
            .slice(0, LIMITE_FEED_CANCIONES);

        // Sección secundaria "Recién Publicado": mismo universo de
        // canciones pero ordenado solo por fecha descendente, sin importar
        // los likes — así un tema recién subido con 0 likes todavía tiene
        // una vitrina, en vez de quedar enterrado permanentemente debajo
        // de canciones antiguas con más acumulado.
        const recienPublicadas = [...todasLasCanciones]
            .filter(c => c.fecha) // sin fecha no hay forma de saber si es reciente
            .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
            .slice(0, LIMITE_FEED_CANCIONES);

        // --- NUEVO: Top por Rangos de Likes ---
        const configuracionRangos = [
            { id: 'rango-10-50', titulo: '🔈 En Ascenso (5 - 50 Likes)', min: 5, max: 50, limite: 5 },
            { id: 'rango-51-200', titulo: '🔉 Populares (51 - 200 Likes)', min: 51, max: 200, limite: 8 },
            { id: 'rango-201-500', titulo: '🔊 Hits (201 - 500 Likes)', min: 201, max: 500, limite: 10 },
            { id: 'rango-501-1000', titulo: '📡 Leyendas (501 - 1000 Likes)', min: 501, max: 1000, limite: 15 }
        ];

        const topPorRangoLikes = {};
        
        configuracionRangos.forEach(rango => {
            // Filtrar las canciones que caigan exactamente dentro de este rango de likes
            const temasDelRango = todasLasCanciones.filter(cancion => {
                const likes = cancion.likesCount || 0;
                return likes >= rango.min && likes <= rango.max;
            });

            // Si hay temas, los ordenamos y aplicamos el límite exacto de ese rango
            if (temasDelRango.length > 0) {
                topPorRangoLikes[rango.id] = {
                    titulo: rango.titulo,
                    canciones: temasDelRango.sort(compararCancionesPorLikesYFecha).slice(0, rango.limite)
                };
            }
        });

        await setDoc(doc(db, "feedCanciones", "actual"), {
            canciones: topCanciones,
            recienPublicadas,
            topPorRangoLikes, // INYECCIÓN DE LA NUEVA ESTRUCTURA
            actualizadoEn: serverTimestamp(),
            totalCancionesConsideradas: todasLasCanciones.length
        });

        return {
            exito: true,
            totalCanciones: topCanciones.length,
            totalRecienPublicadas: recienPublicadas.length,
            totalConsideradas: todasLasCanciones.length
        };
    } catch (error) {
        console.error("Error al actualizar el feed de canciones:", error);
        return { exito: false, mensaje: error.message };
    }
}