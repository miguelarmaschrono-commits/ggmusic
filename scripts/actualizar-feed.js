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
        if (data.activo !== false && data.suspendido !== true) { // Excluir desactivados o suspendidos
            const perfilConId = { id: doc.id, ...data };
            
            // Se aplica el mapper correspondiente según el rol
            const snapshotMapeado = rolNombre === 'artista' 
                ? mapearSnapshotArtista(perfilConId)
                : mapearSnapshotProductor(perfilConId);

            lista.push(snapshotMapeado);
        }
    });

    // 2. Ordenar por seguidores (desc) y desempate por nombre
    lista.sort((a, b) => {
        const segA = a.seguidoresCount || 0;
        const segB = b.seguidoresCount || 0;
        if (segB !== segA) return segB - segA;
        return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
    });

    // 3. Extraer Top 15
    const top15 = lista.slice(0, 15);

    // 4. Extraer Talento Emergente (los 5 con menos seguidores fuera del Top 15)
    const fueraDelTop = lista.slice(15);
    fueraDelTop.sort((a, b) => {
        const segA = a.seguidoresCount || 0;
        const segB = b.seguidoresCount || 0;
        if (segA !== segB) return segA - segB; // Ascendente (menos seguidores primero)
        return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
    });
    const emergentes = fueraDelTop.slice(0, 5);

    return { top15, emergentes };
}

async function ejecutar() {
    try {
        console.log("🔄 Iniciando actualización automática del feed...");

        const [artistasData, productoresData] = await Promise.all([
            procesarRol('artista'),
            procesarRol('productor')
        ]);

        const snapshotFeed = {
            artistas: artistasData.top15,
            productores: productoresData.top15,
            menosSeguidosArtistas: artistasData.emergentes,
            menosSeguidosProductores: productoresData.emergentes,
            actualizadoEn: admin.firestore.FieldValue.serverTimestamp()
        };

        // Sobrescribir el documento central en Firestore
        await db.collection('feedHome').doc('actual').set(snapshotFeed);

        console.log("✅ ¡Feed de inicio (Top 15 + Emergentes) actualizado con éxito!");
        process.exit(0);

    } catch (error) {
        console.error("❌ Error al actualizar el feed:", error);
        process.exit(1);
    }
}

ejecutar();