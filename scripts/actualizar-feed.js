// scripts/actualizar-feed.js
const admin = require('firebase-admin');

// Cargar credenciales desde el Secret de GitHub
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("❌ Error: No se encontró la variable FIREBASE_SERVICE_ACCOUNT.");
    process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ==========================================
// MAPPERS EXACTOS
// ==========================================

function calcularTotalLikes(temas) {
    if (!Array.isArray(temas)) return 0;
    return temas.reduce((suma, tema) => suma + (tema.likesCount || 0), 0);
}

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
        cantidadTrabajos: Array.isArray(p.temas) && p.temas.length > 0
            ? p.temas.length
            : (p.temaDestacado ? 1 : 0)
    };
}

// ==========================================
// RANKING
// ==========================================

function calcularScoreRanking(perfil) {
    const seguidores = perfil.seguidoresCount || 0;
    const likes = typeof perfil.totalLikes === 'number'
        ? perfil.totalLikes
        : calcularTotalLikes(perfil.temas);
    return (seguidores * 2) + likes;
}

function compararPorScoreYNombre(a, b) {
    const scoreA = calcularScoreRanking(a);
    const scoreB = calcularScoreRanking(b);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
}

function compararPorMenosSeguidores(a, b) {
    const seguidoresA = a.seguidoresCount || 0;
    const seguidoresB = b.seguidoresCount || 0;
    if (seguidoresA !== seguidoresB) return seguidoresA - seguidoresB;
    return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
}

const LIMITE_TOP = 30;
const LIMITE_EMERGENTES = 10;

// ==========================================
// PROCESAMIENTO
// ==========================================

async function procesarRol(rolNombre) {
    // 1. Obtener todos los usuarios activos con ese rol
    const snapshot = await db.collection('usuarios')
        .where('rol', '==', rolNombre)
        .get();

    const lista = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.suspendido !== true) { // Mantener el mismo criterio que actualizarFeedHome()
            const perfilConId = { id: doc.id, ...data };
            
            // Se aplica el mapper correspondiente según el rol
            const snapshotMapeado = rolNombre === 'artista' 
                ? mapearSnapshotArtista(perfilConId)
                : mapearSnapshotProductor(perfilConId);

            lista.push(snapshotMapeado);
        }
    });

    // 2. Ordenar con el mismo score combinado que actualizarFeedHome()
    lista.sort(compararPorScoreYNombre);

    // 3. Extraer Top 30
    const top30 = lista.slice(0, LIMITE_TOP);

    // 4. Extraer Talento Emergente fuera del Top 30
    const idsEnTop = new Set(top30.map(perfil => perfil.id));
    const emergentes = lista
        .filter(perfil => !idsEnTop.has(perfil.id))
        .sort(compararPorMenosSeguidores)
        .slice(0, LIMITE_EMERGENTES);

    return { top30, emergentes, totalConsiderados: snapshot.size };
}

async function ejecutar() {
    try {
        console.log("🔄 Iniciando actualización automática del feed...");

        const [artistasData, productoresData] = await Promise.all([
            procesarRol('artista'),
            procesarRol('productor')
        ]);

        const snapshotFeed = {
            artistas: artistasData.top30,
            productores: productoresData.top30,
            menosSeguidosArtistas: artistasData.emergentes,
            menosSeguidosProductores: productoresData.emergentes,
            actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
            totalArtistasConsiderados: artistasData.totalConsiderados,
            totalProductoresConsiderados: productoresData.totalConsiderados
        };

        // Sobrescribir el documento central en Firestore
        await db.collection('feedHome').doc('actual').set(snapshotFeed);

        console.log("✅ ¡Feed de inicio (Top 30 + Emergentes) actualizado con éxito!");
        process.exit(0);

    } catch (error) {
        console.error("❌ Error al actualizar el feed:", error);
        process.exit(1);
    }
}

ejecutar();