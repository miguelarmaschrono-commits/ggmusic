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

// Helper para calcular likes totales
function calcularLikesTotal(temas) {
    if (!Array.isArray(temas)) return 0;
    return temas.reduce((suma, tema) => suma + (tema.likesCount || 0), 0);
}

async function procesarRol(rolNombre) {
    // 1. Obtener todos los usuarios activos con ese rol
    const snapshot = await db.collection('usuarios')
        .where('rol', '==', rolNombre)
        .get();

    const lista = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.activo !== false) { // Excluir desactivados
            lista.push({
                uid: doc.id,
                ...data
            });
        }
    });

    // 2. Ordenar por seguidores (desc) y desempate por nombre
    lista.sort((a, b) => {
        const segA = a.seguidoresCount || 0;
        const segB = b.seguidoresCount || 0;
        if (segB !== segA) return segB - segA;
        return (a.nombre || '').localeCompare(b.nombre || '');
    });

    // 3. Extraer Top 15
    const top15 = lista.slice(0, 15);

    // 4. Extraer Talento Emergente (los 5 con menos seguidores fuera del Top 15)
    const fueraDelTop = lista.slice(15);
    fueraDelTop.sort((a, b) => {
        const segA = a.seguidoresCount || 0;
        const segB = b.seguidoresCount || 0;
        if (segA !== segB) return segA - segB; // Ascendente (menos seguidores primero)
        return (a.nombre || '').localeCompare(b.nombre || '');
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