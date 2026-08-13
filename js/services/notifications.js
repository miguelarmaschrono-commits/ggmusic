import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseApp, db } from '../firebase-config.js';
const messaging = getMessaging(firebaseApp);

// Clave VAPID pública:
// Consola de Firebase -> Configuración del proyecto -> Cloud Messaging -> Certificados de inserción Web
const PUBLIC_VAPID_KEY = 'TU_CLAVE_VAPID_PUBLICA_AQUI';

/**
 * Solicita permisos de notificación y registra el token FCM en Firestore.
 * @param {string|null} userId ID del usuario si está autenticado, o null si es invitado.
 */
export async function solicitarPermisoNotificaciones(userId = null) {
    if (!("Notification" in window)) {
        console.warn("Este navegador no admite notificaciones en escritorio/móvil.");
        return false;
    }

    // Evitar preguntar de nuevo si el usuario ya las denegó explícitamente
    if (Notification.permission === 'denied') {
        console.warn("El permiso de notificaciones fue denegado previamente por el usuario.");
        return false;
    }

    try {
        const permiso = await Notification.requestPermission();
        
        if (permiso === 'granted') {
            const token = await getToken(messaging, { vapidKey: PUBLIC_VAPID_KEY });
            
            if (token) {
                // Guarda o actualiza el token cumpliendo la regla de seguridad: match /fcm_tokens/{tokenId}
                await setDoc(doc(db, 'fcm_tokens', token), {
                    token: token,
                    userId: userId || 'invitado',
                    actualizadoEn: serverTimestamp()
                }, { merge: true });

                console.log('Permiso concedido y Token FCM registrado exitosamente.');
                return true;
            }
        }
    } catch (error) {
        console.error('Error al solicitar permiso o registrar el token FCM:', error);
    }

    return false;
}