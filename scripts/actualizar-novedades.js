// scripts/actualizar-novedades.js
const admin = require('firebase-admin');

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("❌ Error: No se encontró la variable FIREBASE_SERVICE_ACCOUNT.");
    process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

const LIMITE_FEED_CANCIONES = 20;

// Helper para ordenar por likes (desc) y fecha (desc)
function compararCancionesPorLikesYFecha(a, b) {
    const likesA = a.likesCount || 0;
    const likesB = b.likesCount || 0;
    if (likesB !== likesA) return likesB - likesA;
    return (b.fecha || '').localeCompare(a.fecha || '');
}

// Helper para extraer el ID del video de YouTube
function extraerIdYouTube(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// Extrae las canciones dentro del perfil del usuario asignando la misma estructura que admin.js
function aplanarTemasDePerfil(usuario, rol) {
    const temas = Array.isArray(usuario.temas) ? usuario.temas : (Array.isArray(usuario.canciones) ? usuario.canciones : []);
    const uid = usuario.uid || usuario.id;

    return temas
        .filter(tema => tema.url && tema.url.trim() !== '')
        .map(tema => {
            const videoId = extraerIdYouTube(tema.url);

            return {
                ...tema,
                cancionId: videoId ? `${uid}_${videoId}` : (tema.cancionId || null),
                nombre: tema.nombre || 'Sin título',
                url: tema.url,
                genero: tema.genero || '',
                fecha: tema.fecha || '',
                lista: tema.lista || '',
                likesCount: tema.likesCount || 0,
                // --- Campos exactos que requiere la aplicación (admin.js) ---
                perfilId: uid,
                perfilNombre: usuario.nombre || usuario.nombreArtistico || (rol === 'productor' ? 'Productor' : 'Artista'),
                perfilFotoUrl: usuario.fotoPerfil || usuario.fotoUrl || usuario.foto || '',
                perfilZona: usuario.zona || '',
                perfilEtiqueta: rol === 'productor' ? (usuario.especialidad || '') : (usuario.genero || ''),
                perfilVerificado: usuario.verificado === true,
                tipoPerfil: rol,
            };
        })
        .filter(cancion => cancion.cancionId !== null);
}

// Obtiene todos los usuarios de un rol específico
async function obtenerUsuariosPorRol(rol) {
    const snapshot = await db.collection('usuarios')
        .where('rol', '==', rol)
        .get();

    const lista = [];
    snapshot.forEach(doc => {
        lista.push({
            uid: doc.id,
            ...doc.data()
        });
    });
    return lista;
}

async function ejecutarActualizaciónFeedCanciones() {
    try {
        console.log("🔄 Iniciando extracción y actualización del Feed de Canciones...");

        const [artistas, productores] = await Promise.all([
            obtenerUsuariosPorRol('artista'),
            obtenerUsuariosPorRol('productor')
        ]);

        // Filtrar usuarios no suspendidos
        const artistasActivos = artistas.filter(a => a.suspendido !== true);
        const productoresActivos = productores.filter(p => p.suspendido !== true);

        // Aplanar universo completo de canciones
        const todasLasCanciones = [
            ...artistasActivos.flatMap(a => aplanarTemasDePerfil(a, 'artista')),
            ...productoresActivos.flatMap(p => aplanarTemasDePerfil(p, 'productor'))
        ];

        // 1. Top Canciones Generales
        const topCanciones = [...todasLasCanciones]
            .sort(compararCancionesPorLikesYFecha)
            .slice(0, LIMITE_FEED_CANCIONES);

        // 2. Recién Publicadas
        const recienPublicadas = [...todasLasCanciones]
            .filter(c => c.fecha)
            .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
            .slice(0, LIMITE_FEED_CANCIONES);

        // 3. Top por Rangos de Likes
        const configuracionRangos = [
            { id: 'rango-10-50', titulo: '🔈 En Ascenso (10 - 50 Likes)', min: 10, max: 50, limite: 10 },
            { id: 'rango-51-200', titulo: '🔉 Populares (51 - 200 Likes)', min: 51, max: 200, limite: 10 },
            { id: 'rango-201-500', titulo: '🔊 Hits (201 - 500 Likes)', min: 201, max: 500, limite: 10 },
            { id: 'rango-501-1000', titulo: '📡 Leyendas (501 - 1000 Likes)', min: 501, max: 1000, limite: 15 }
        ];

        const topPorRangoLikes = {};

        configuracionRangos.forEach(rango => {
            const temasDelRango = todasLasCanciones.filter(cancion => {
                const likes = cancion.likesCount || 0;
                return likes >= rango.min && likes <= rango.max;
            });

            if (temasDelRango.length > 0) {
                topPorRangoLikes[rango.id] = {
                    titulo: rango.titulo,
                    canciones: temasDelRango.sort(compararCancionesPorLikesYFecha).slice(0, rango.limite)
                };
            }
        });

        // Escribir en Firestore en feedCanciones/actual
        await db.collection("feedCanciones").doc("actual").set({
            canciones: topCanciones,
            recienPublicadas,
            topPorRangoLikes,
            actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
            totalCancionesConsideradas: todasLasCanciones.length
        });

        console.log(`✅ ¡feedCanciones/actual actualizado con éxito! (${todasLasCanciones.length} canciones procesadas)`);
        process.exit(0);

    } catch (error) {
        console.error("❌ Error al actualizar el feed de canciones:", error);
        process.exit(1);
    }
}

ejecutarActualizaciónFeedCanciones();