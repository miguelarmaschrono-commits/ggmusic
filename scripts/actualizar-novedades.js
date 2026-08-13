// scripts/actualizar-novedades.js
const admin = require('firebase-admin');

// Cargar credenciales desde el Secret de GitHub
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
        console.log("🔄 Iniciando actualización del Feed de Novedades...");

        // Ajusta 'canciones' y 'fechaCreacion' si tus colecciones o campos se llaman diferente
        const snapshot = await db.collection('canciones')
            .orderBy('fechaCreacion', 'desc')
            .limit(20)
            .get();

        const listaNovedades = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            listaNovedades.push({
                id: doc.id,
                ...data
            });
        });

        // Guardar el resultado precalculado en Firestore
        await db.collection('feedCanciones').doc('actual').set({
            items: listaNovedades,
            actualizadoEn: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log("✅ ¡Feed de Novedades actualizado con éxito!");
        process.exit(0);

    } catch (error) {
        console.error("❌ Error al actualizar las novedades:", error);
        process.exit(1);
    }
}

actualizarNovedades();