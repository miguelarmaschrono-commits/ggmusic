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

async function actualizarNovedades() {
    try {
        console.log("🔄 Iniciando actualización del Feed de Canciones...");

        // 1. Intentar buscar por fechaCreacion
        let snapshot = await db.collection('canciones')
            .orderBy('fechaCreacion', 'desc')
            .limit(20)
            .get();

        let listaNovedades = [];
        snapshot.forEach(doc => {
            listaNovedades.push({
                id: doc.id,
                ...doc.data()
            });
        });

        console.log(`📊 Canciones encontradas con 'fechaCreacion': ${listaNovedades.length}`);

        // 2. Si dio 0, buscar de respaldo sin ordenar (por si el campo fecha tiene otro nombre)
        if (listaNovedades.length === 0) {
            console.log("⚠️ No se encontraron canciones con 'fechaCreacion'. Buscando canciones sin ordenamiento...");
            const altSnapshot = await db.collection('canciones').limit(20).get();
            altSnapshot.forEach(doc => {
                listaNovedades.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            console.log(`📊 Canciones encontradas sin filtro en 'canciones': ${listaNovedades.length}`);
        }

        // 3. Guardar en feedCanciones/actual (incluyendo 'items' y 'canciones' para evitar fallos de lectura en frontend)
        await db.collection('feedCanciones').doc('actual').set({
            items: listaNovedades,
            canciones: listaNovedades,
            actualizadoEn: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ ¡feedCanciones/actual actualizado con éxito! (${listaNovedades.length} canciones guardadas)`);
        process.exit(0);

    } catch (error) {
        console.error("❌ Error al actualizar el feed de canciones:", error);
        process.exit(1);
    }
}

actualizarNovedades();