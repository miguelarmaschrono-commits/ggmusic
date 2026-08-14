const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

exports.notificarActualizacionFeed = onDocumentWritten("feedCanciones/actual", async (event) => {
    if (!event.data.after.exists) {
        console.log("El documento fue eliminado. No se enviarán notificaciones.");
        return;
    }

    const db = getFirestore();
    const messaging = getMessaging();

    try {
        const tokensSnapshot = await db.collection("fcm_tokens").get();

        if (tokensSnapshot.empty) {
            console.log("No hay tokens registrados para enviar notificaciones.");
            return;
        }

        const tokens = tokensSnapshot.docs.map(doc => doc.id);
        console.log(`Enviando notificación a ${tokens.length} dispositivo(s)...`);

        const message = {
            notification: {
                title: "🎵 ¡Nuevas canciones en GGmusic!",
                body: "El feed y las ligas de competencia han sido actualizadas. ¡Entra a escuchar lo nuevo!"
            },
            data: {
                url: "/canciones.html"
            },
            tokens: tokens
        };

        const response = await messaging.sendEachForMulticast(message);
        console.log(`Notificaciones enviadas exitosamente: ${response.successCount}`);

        if (response.failureCount > 0) {
            const batch = db.batch();
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errorCode = resp.error?.code;
                    if (
                        errorCode === 'messaging/invalid-registration-token' ||
                        errorCode === 'messaging/registration-token-not-registered'
                    ) {
                        const tokenDocRef = tokensSnapshot.docs[idx].ref;
                        batch.delete(tokenDocRef);
                    }
                }
            });
            await batch.commit();
            console.log(`Se eliminaron ${response.failureCount} token(s) obsoletos.`);
        }

    } catch (error) {
        console.error("Error al procesar el envío de notificaciones:", error);
    }
});