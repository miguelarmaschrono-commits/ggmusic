import { db } from '../firebase-config.js';
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
 * Verificar si un usuario le dio like a una canción.
 * Se conserva como utilidad puntual (consultar UN tema específico), pero
 * ya NO se usa en un loop por cada botón en pantalla — para eso existe
 * obtenerMisLikes() más abajo, que resuelve el estado de TODOS los
 * botones con una sola lectura.
 */
export async function tieneLikeCancion(uidUsuario, cancionId) {
    if (!uidUsuario || !cancionId) return false;
    try {
        const likeRef = doc(db, "likes_canciones", `${uidUsuario}_${cancionId}`);
        const snap = await getDoc(likeRef);
        return snap.exists();
    } catch (error) {
        console.error("Error al verificar like:", error);
        return false;
    }
}

/**
 * Devuelve la lista de cancionId a los que el usuario ya le dio like,
 * leyendo su propio documento de perfil (usuarios/{uid}) UNA SOLA VEZ.
 *
 * Antes, pintar el estado de like de un perfil con N temas costaba N
 * lecturas a "likes_canciones" (una por botón, en un for...of secuencial).
 * Ahora, toggleLikeCancion() mantiene sincronizado un array denormalizado
 * "likesCanciones" dentro del propio perfil del oyente — el mismo patrón
 * que ya usan favoritosArtistas/favoritosProductores para la biblioteca.
 * Con eso, una única lectura basta sin importar cuántos temas tenga el
 * artista que se está visitando.
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
 * Extrae el ID de video de YouTube (11 caracteres) de una URL, ya venga en
 * formato embed (.../embed/ID) o en cualquiera de los formatos "crudos"
 * (watch?v=, youtu.be/, shorts/...). Misma lógica que ya usan artista.js y
 * productor.js para lo mismo — se replica aquí (en vez de importarla) para
 * no crear una dependencia cruzada entre un servicio de datos y un archivo
 * de UI de página.
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
 * Descompone un cancionId (formado como `${perfilId}_${videoId}`, ver
 * artista.js/productor.js) en sus dos partes. El uid de Firebase Auth no
 * contiene guiones bajos, así que el PRIMER '_' marca de forma segura el
 * límite entre el id del perfil y el id del video de YouTube (que sí puede
 * contener '_' o '-').
 */
function descomponerCancionId(cancionId) {
    const indice = cancionId.indexOf('_');
    if (indice === -1) return null;
    return {
        perfilId: cancionId.substring(0, indice),
        videoId: cancionId.substring(indice + 1)
    };
}

/**
 * Alternar Like en Canción (Dar / Quitar Like)
 *
 * CAMBIO DE ESQUEMA: ya no existe una colección "canciones" aparte para
 * guardar el conteo. El likesCount vive directamente dentro del objeto
 * correspondiente en el array "temas" del perfil (usuarios/{perfilId}),
 * junto a nombre/fecha/genero/url. Motivo: el perfil del artista o
 * productor YA se lee completo en una sola consulta al cargar la página
 * (obtenerPerfilArtista/obtenerPerfilProductor) — antes, cada tema exigía
 * además 1 lectura a "canciones" (conteo) y 1 lectura a "likes_canciones"
 * (¿le di like?) SOLO para pintar el número. Con el conteo fusionado en el
 * propio documento del perfil, esas N lecturas de "canciones" desaparecen
 * por completo: el número ya viaja gratis con el resto del perfil.
 *
 * Firestore no permite un increment() atómico sobre un campo dentro de un
 * elemento de un array, así que la actualización se hace con una
 * transacción: se lee el documento completo, se localiza el tema por su
 * ID de YouTube (no por URL exacta, para tolerar diferencias de formato),
 * se reescribe SOLO ese elemento con el likesCount ajustado, y se guarda
 * el array entero de vuelta — todo en un solo paso atómico junto con el
 * alta/baja del registro en "likes_canciones" (que se conserva únicamente
 * para poder responder "¿este usuario ya le dio like a esto?").
 */
export async function toggleLikeCancion(uidUsuario, cancionId) {
    if (!uidUsuario || !cancionId) return { exito: false, mensaje: "Debes iniciar sesión" };

    const partes = descomponerCancionId(cancionId);
    if (!partes) return { exito: false, mensaje: "Identificador de canción inválido" };
    const { videoId } = partes;

    const perfilRef = doc(db, "usuarios", partes.perfilId);
    const oyenteRef = doc(db, "usuarios", uidUsuario);

    try {
        let quedoConLike = false;

        await runTransaction(db, async (transaction) => {
            // Lecturas primero (regla de las transacciones de Firestore)
            const perfilSnap = await transaction.get(perfilRef);
            const oyenteSnap = await transaction.get(oyenteRef);

            if (!perfilSnap.exists()) {
                throw new Error("El perfil dueño de esta canción ya no existe.");
            }

            const datosPerfil = perfilSnap.data();
            const temas = Array.isArray(datosPerfil.temas) ? [...datosPerfil.temas] : [];
            const indiceTema = temas.findIndex(t => extraerIdYouTube(t.url) === videoId);

            if (indiceTema === -1) {
                throw new Error("El tema ya no existe en el perfil (pudo haber sido eliminado).");
            }

            const misLikesActuales = (oyenteSnap.exists() && Array.isArray(oyenteSnap.data().likesCanciones))
                ? oyenteSnap.data().likesCanciones
                : [];
            const yaLeGustaba = misLikesActuales.includes(cancionId);
            const likesActuales = temas[indiceTema].likesCount || 0;

            temas[indiceTema] = {
                ...temas[indiceTema],
                likesCount: Math.max(0, likesActuales + (yaLeGustaba ? -1 : 1))
            };

            transaction.update(perfilRef, { temas });
            transaction.set(oyenteRef, {
                likesCanciones: yaLeGustaba ? arrayRemove(cancionId) : arrayUnion(cancionId)
            }, { merge: true });

            quedoConLike = !yaLeGustaba;
        });

        return { exito: true, liked: quedoConLike };
    } catch (error) {
        console.error("Error al procesar el like:", error);
        return { exito: false, mensaje: error.message };
    }
}