import { auth, db } from '../firebase-config.js';
import { sincronizarLikesEnPagina, sincronizarLikeDesdePagina } from './floatingPlayer.js';
import { 
    doc, 
    setDoc, 
    deleteDoc, 
    getDoc, 
    updateDoc, 
    increment,
    arrayUnion,
    arrayRemove,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// NOTA DE UNIFICACIÓN (ver inicializarLikesEnTarjetas más abajo): antes
// cada página (canciones.js, artista.js) tenía su propia copia casi
// idéntica de esta lógica — un listener de clic en '.btn-like', su propio
// arreglo "misLikesConocidos" en memoria, y su propia forma (ligeramente
// distinta) de leer data-cancion-id. Eso generaba dos riesgos reales:
// 1) Desincronización: una página podía marcar "ya te gusta" con un
//    criterio y otra con otro.
// 2) Doble-toggle: si alguna vez dos listeners quedaban activos a la vez
//    sobre el mismo botón, un solo clic invocaba toggleLikeCancion() dos
//    veces y el like se revertía solo.
// Ahora todo vive en un único lugar: este archivo mantiene el caché de
// "mis likes" en memoria (misLikesConocidos) y expone un único punto de
// entrada — inicializarLikesEnTarjetas() — que cualquier página llama UNA
// sola vez. Las páginas que necesiten una reacción adicional (ej.
// artista.js actualizando el contador agregado "Me gusta" del perfil)
// escuchan el evento 'gg:like-actualizado' en vez de reimplementar el
// clic.
let misLikesConocidos = [];

// ==========================================
// 1. GESTIÓN DE SEGUIDORES (FOLLOWERS)
// ==========================================

/**
 * Verificar si un oyente ya sigue a un artista/productor
 */
export async function esSeguidor(uidOyente, uidDestino) {
    if (!uidOyente || !uidDestino) return false;
    try {
        const seguidorRef = doc(db, "seguidores", `${uidOyente}_${uidDestino}`);
        const snap = await getDoc(seguidorRef);
        return snap.exists();
    } catch (error) {
        console.error("Error al verificar seguidor:", error);
        return false;
    }
}

/**
 * Alternar seguimiento (Seguir / Dejar de seguir)
 * Ahora también guarda la referencia en el documento del Oyente para "Mi Biblioteca"
 */
export async function toggleSeguirArtista(uidOyente, uidDestino) {
    if (!uidOyente || !uidDestino) return { exito: false, mensaje: "Debes iniciar sesión" };
    
    const relacionId = `${uidOyente}_${uidDestino}`;
    const seguidorRef = doc(db, "seguidores", relacionId);
    
    // Referencia al perfil que está siendo seguido (Artista o Productor)
    const destinoRef = doc(db, "usuarios", uidDestino);
    // Referencia al perfil del Oyente (quien hace clic)
    const oyenteRef = doc(db, "usuarios", uidOyente);

    try {
        // 1. Determinar el ROL del perfil que se está siguiendo para saber en qué array guardarlo
        const destinoSnap = await getDoc(destinoRef);
        if (!destinoSnap.exists()) {
            return { exito: false, mensaje: "El perfil al que intentas seguir no existe." };
        }
        const rolDestino = destinoSnap.data().rol; 
        // Si es 'productor', lo guardamos en favoritosProductores. Si no, asumimos 'artista'.
        const campoArray = rolDestino === 'productor' ? 'favoritosProductores' : 'favoritosArtistas';

        // NOTA: se removió el límite de 50 elementos por array que existía
        // aquí (bloqueaba "Seguir" devolviendo { limiteAlcanzado: true }).
        // La biblioteca del oyente ahora es ilimitada — ver también
        // biblioteca.js, donde se quitó el "/50" de los contadores en UI.
        const yaSigue = await esSeguidor(uidOyente, uidDestino);

        if (yaSigue) {
            // ==========================================
            // DEJAR DE SEGUIR
            // ==========================================
            
            // A. Eliminar el documento de la colección 'seguidores'
            await deleteDoc(seguidorRef);
            
            // B. Restar 1 al contador público del artista/productor
            await updateDoc(destinoRef, { seguidoresCount: increment(-1) });
            
            // C. Quitar el ID del array personal del Oyente (Para Mi Biblioteca)
            await updateDoc(oyenteRef, {
                [campoArray]: arrayRemove(uidDestino)
            });

            return { exito: true, siguiendo: false };
            
        } else {
            // ==========================================
            // SEGUIR
            // ==========================================
            
            // A. Crear el documento en la colección 'seguidores'
            await setDoc(seguidorRef, {
                uidOyente,
                uidArtista: uidDestino, // Se mantiene el nombre original del campo por compatibilidad
                fecha: new Date()
            });
            
            // B. Sumar 1 al contador público del artista/productor
            await updateDoc(destinoRef, { seguidoresCount: increment(1) });

            // C. Agregar el ID al array personal del Oyente (Para Mi Biblioteca)
            await updateDoc(oyenteRef, {
                [campoArray]: arrayUnion(uidDestino)
            });

            return { exito: true, siguiendo: true };
        }
    } catch (error) {
        console.error("Error al procesar seguimiento:", error);
        return { exito: false, error: error.message };
    }
}

// ==========================================
// 2. GESTIÓN DE LIKES EN CANCIONES
// ==========================================

/**
 * Verificar si un usuario le dio like a una canción consultando su array personal.
 */
export async function tieneLikeCancion(uidUsuario, cancionId) {
    if (!uidUsuario || !cancionId) return false;
    try {
        const snap = await getDoc(doc(db, "usuarios", uidUsuario));
        if (snap.exists() && Array.isArray(snap.data().likesCanciones)) {
            return snap.data().likesCanciones.includes(cancionId);
        }
        return false;
    } catch (error) {
        console.error("Error al verificar me gusta:", error);
        return false;
    }
}
/**
 * Helper de toast reutilizado por este módulo. Todas las páginas que
 * tienen tarjetas de canciones (canciones.html, artista.html) ya
 * comparten el mismo par de IDs #toast / #toast-mensaje en su HTML, así
 * que un servicio de datos puede usarlos directamente sin necesidad de
 * que cada página le pase su propia función de toast. Si esos elementos
 * no existen en la página (ej. una futura vista sin ese markup), no rompe
 * nada — simplemente no se muestra nada.
 */
let toastLikeTimeoutId = null;
function mostrarToastLike(mensaje, tipo = 'warn') {
    const toast = document.getElementById('toast');
    const toastMensaje = document.getElementById('toast-mensaje');
    if (!toast || !toastMensaje) return;

    const estilosPorTipo = {
        warn: { clase: 'bg-[#8d001c]', icono: '🔔 ' },
        error: { clase: 'bg-[#DC143C]', icono: '⚠️ ' }
    };
    const { clase, icono } = estilosPorTipo[tipo] || estilosPorTipo.warn;

    toast.classList.remove('bg-rose-600', 'bg-indigo-600', 'bg-amber-500', 'bg-red-600', 'bg-[#DC143C]', 'bg-[#8d001c]');
    toast.classList.add(clase);
    toastMensaje.textContent = `${icono}${mensaje}`;

    toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
    toast.classList.add('translate-y-0', 'opacity-100');

    clearTimeout(toastLikeTimeoutId);
    toastLikeTimeoutId = setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
    }, 2500);
}

/**
 * Consulta local (sin red) contra el caché de likes ya cargado por
 * inicializarLikesEnTarjetas(). Pensada para que otras páginas (ej.
 * canciones.js al armar la cola del reproductor flotante) puedan saber
 * "¿esta canción ya la tiene marcada el usuario?" sin mantener su propia
 * copia del arreglo ni volver a pedirlo a Firestore.
 */
export function tieneLikeLocal(cancionId) {
    return Array.isArray(misLikesConocidos) && misLikesConocidos.includes(cancionId);
}

/**
 * Pinta (o repinta) el estado visual de "me gusta" sobre TODOS los
 * botones .btn-like presentes en el DOM en este momento, usando el
 * caché en memoria. Se exporta para que una página pueda invocarlo de
 * nuevo después de renderizar tarjetas nuevas (ej. tras una revalidación
 * de Firestore, o un resultado de búsqueda) sin tener que reimplementar
 * el criterio de "cuáles cuentan como ya likeadas" — un único criterio,
 * usado en todos lados.
 */
export function aplicarEstadoDeLikesEnDOM() {
    document.querySelectorAll('.btn-like').forEach(btn => {
        const cancionId = btn.getAttribute('data-cancion-id');
        if (!cancionId) return;
        const yaLeGusta = tieneLikeLocal(cancionId);

        const icono = btn.querySelector('.icono-like') || btn.querySelector('svg');
        if (icono) {
            icono.classList.toggle('text-rose-500', yaLeGusta);
            icono.classList.toggle('fill-current', yaLeGusta);
            icono.classList.toggle('text-slate-400', !yaLeGusta);
        }
        btn.setAttribute('data-liked', yaLeGusta ? 'true' : 'false');
    });
}

/**
 * PUNTO DE ENTRADA ÚNICO para toda interacción de "me gusta" en el sitio.
 * Cada página lo llama UNA sola vez al iniciar (ver canciones.js,
 * artista.js). Se encarga de:
 *   1. Cargar (y mantener actualizado) el caché de canciones que el
 *      usuario ya likeó, y pintarlo sobre cualquier tarjeta presente.
 *   2. Escuchar TODOS los clics en '.btn-like' del documento (delegación
 *      a nivel body — funciona con tarjetas ya presentes o renderizadas
 *      después, sin volver a registrar nada).
 *   3. Tras cada toggle exitoso: actualizar el caché local, sincronizar
 *      TODAS las tarjetas de esa misma canción en la página
 *      (sincronizarLikesEnPagina, ver floatingPlayer.js) y el
 *      reproductor flotante si está sonando esa canción
 *      (sincronizarLikeDesdePagina).
 *   4. Emitir 'gg:like-actualizado' en document — para que una página con
 *      UI adicional dependiente del like (ej. el contador agregado
 *      "Me gusta" del perfil en artista.js) reaccione sin volver a tocar
 *      Firestore ni reimplementar el clic.
 *
 * IMPORTANTE: ninguna página debe registrar su propio listener de clic
 * para '.btn-like' además de este — harían doble toggle por clic (el like
 * se marcaría y desmarcaría en el mismo gesto).
 */
export function inicializarLikesEnTarjetas() {
    if (!auth) return;

    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            misLikesConocidos = [];
            aplicarEstadoDeLikesEnDOM();
            return;
        }
        try {
            misLikesConocidos = await obtenerMisLikes(user.uid);
            aplicarEstadoDeLikesEnDOM();
        } catch (error) {
            console.error("Error al cargar mis likes:", error);
        }
    });

    document.body.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-like');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        const cancionId = btn.getAttribute('data-cancion-id');
        if (!cancionId) return;

        const user = auth.currentUser;
        if (!user) {
            mostrarToastLike("Debes iniciar sesión para dar me gusta.", 'warn');
            return;
        }

        // Deshabilitar TODAS las tarjetas de esta misma canción (puede
        // haber más de una visible a la vez: la tarjeta del feed y el
        // reproductor flotante, o dos carruseles distintos) para evitar
        // que un doble clic dispare dos transacciones concurrentes.
        const tarjetasRelacionadas = document.querySelectorAll(`.btn-like[data-cancion-id="${cancionId}"]`);
        tarjetasRelacionadas.forEach(b => b.disabled = true);

        try {
            const res = await toggleLikeCancion(user.uid, cancionId);

            if (res && res.exito) {
                const nuevoTotal = res.totalLikes ?? 0;

                // 1. Actualizar el caché local — así una tarjeta nueva que
                // se renderice después de este clic (ej. tras cambiar de
                // filtro) ya nace marcada correctamente.
                misLikesConocidos = res.liked
                    ? [...new Set([...misLikesConocidos, cancionId])]
                    : misLikesConocidos.filter(id => id !== cancionId);

                // 2. Sincronizar TODAS las tarjetas de esta canción en la
                // página (icono + contador), sin importar en qué carrusel
                // o sección estén repetidas.
                sincronizarLikesEnPagina(cancionId, res.liked, nuevoTotal);

                // 3. Sincronizar el reproductor flotante si está sonando
                // esta misma canción en este momento.
                sincronizarLikeDesdePagina(cancionId, res.liked, nuevoTotal);

                // 4. Avisar a quien quiera reaccionar de forma adicional
                // (ej. el contador agregado de "Me gusta" del perfil).
                document.dispatchEvent(new CustomEvent('gg:like-actualizado', {
                    detail: { cancionId, liked: res.liked, totalLikes: nuevoTotal }
                }));
            } else if (res && res.mensaje) {
                mostrarToastLike(res.mensaje, 'error');
            }
        } catch (error) {
            console.error("Error al procesar el like desde la tarjeta:", error);
            mostrarToastLike("Ocurrió un error al procesar el me gusta.", 'error');
        } finally {
            tarjetasRelacionadas.forEach(b => b.disabled = false);
        }
    });
}

/**
 * Devuelve la lista de cancionId a los que el usuario ya le dio like.
 */
export async function obtenerMisLikes(uidUsuario) {
    if (!uidUsuario) return [];
    try {
        const snap = await getDoc(doc(db, "usuarios", uidUsuario));
        if (snap.exists() && Array.isArray(snap.data().likesCanciones)) {
            return snap.data().likesCanciones;
        }
        return [];
    } catch (error) {
        console.error("Error al obtener los likes del usuario:", error);
        return [];
    }
}

/**
 * Extrae el ID de video de YouTube (11 caracteres) de una URL.
 */
function extraerIdYouTube(url) {
    if (!url) return null;
    if (url.includes('embed/')) {
        return url.split('embed/')[1].split('?')[0].split('&')[0];
    }
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2] && match[2].length === 11) ? match[2] : null;
}

/**
 * Descompone un cancionId (formado como `${perfilId}_${videoId}`).
 */
function descomponerCancionId(cancionId) {
    if (typeof cancionId !== 'string') return null;
    const indice = cancionId.indexOf('_');
    if (indice === -1) return null;
    return {
        perfilId: cancionId.substring(0, indice),
        videoId: cancionId.substring(indice + 1)
    };
}

/**
 * Alternar Like en Canción (Dar / Quitar Like) de forma atómica.
 */
export async function toggleLikeCancion(uidUsuario, cancionId) {
    if (!uidUsuario || !cancionId) return { exito: false, mensaje: "Debes iniciar sesión" };

    const partes = descomponerCancionId(cancionId);
    if (!partes) return { exito: false, mensaje: "Identificador de canción inválido" };
    const { perfilId, videoId } = partes;

    const perfilRef = doc(db, "usuarios", perfilId);
    const oyenteRef = doc(db, "usuarios", uidUsuario);

    try {
        let quedoConLike = false;
        let nuevoTotalLikes = 0;

        await runTransaction(db, async (transaction) => {
            const perfilSnap = await transaction.get(perfilRef);
            const oyenteSnap = await transaction.get(oyenteRef);

            if (!perfilSnap.exists()) {
                throw new Error("El perfil dueño de esta canción no existe.");
            }

            const datosPerfil = perfilSnap.data();
            const temas = Array.isArray(datosPerfil.temas) ? [...datosPerfil.temas] : [];
            const indiceTema = temas.findIndex(t => t?.url && extraerIdYouTube(t.url) === videoId);

            if (indiceTema === -1) {
                throw new Error("El tema ya no existe en el perfil.");
            }

            const misLikesActuales = (oyenteSnap.exists() && Array.isArray(oyenteSnap.data().likesCanciones))
                ? oyenteSnap.data().likesCanciones
                : [];
                
            const yaLeGustaba = misLikesActuales.includes(cancionId);
            const likesActuales = temas[indiceTema].likesCount || 0;

            nuevoTotalLikes = Math.max(0, likesActuales + (yaLeGustaba ? -1 : 1));

            temas[indiceTema] = {
                ...temas[indiceTema],
                likesCount: nuevoTotalLikes
            };

            transaction.update(perfilRef, { temas });
            transaction.set(oyenteRef, {
                likesCanciones: yaLeGustaba ? arrayRemove(cancionId) : arrayUnion(cancionId)
            }, { merge: true });

            quedoConLike = !yaLeGustaba;
        });

        return { exito: true, liked: quedoConLike, totalLikes: nuevoTotalLikes };
    } catch (error) {
        console.error("Error al procesar el me gusta:", error);
        return { exito: false, mensaje: error.message };
    }
}