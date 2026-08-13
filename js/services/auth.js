// js/services/auth.js
import { auth, db } from '../firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    deleteUser,
    EmailAuthProvider,
    reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { 
    doc, 
    setDoc,
    getDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * REGISTRO UNIVERSAL
 * Crea la cuenta en Firebase Auth y guarda la información en la colección única "usuarios".
 */
/**
 * REGISTRO UNIVERSAL
 * Crea la cuenta en Firebase Auth y guarda la información en la colección única "usuarios".
 */
export async function registrarCuenta(email, password, datosPerfil, rolUsuario) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        let fotoFinal = datosPerfil.fotoUrl;
        if (!fotoFinal || fotoFinal.trim() === '') {
            const nombreAvatar = datosPerfil.nombre || 'Usuario';
            fotoFinal = `https://ui-avatars.com/api/?name=${encodeURIComponent(nombreAvatar)}&background=random&size=200`;
        }

        const perfilCompleto = {
            uid: user.uid,
            rol: rolUsuario, 
            ...datosPerfil,  
            fotoUrl: fotoFinal,
            fechaRegistro: serverTimestamp()
        };

        // Inicialización según el rol del usuario
        if (rolUsuario === 'oyente') {
            // Inicializa las listas de favoritos vacías
            perfilCompleto.artistasFavoritos = [];
            perfilCompleto.productoresFavoritos = [];
        } else {
            // Perfiles públicos (artista o productor)
            perfilCompleto.verificado = false;
            perfilCompleto.suspendido = false;
            if (typeof perfilCompleto.limiteCanciones !== 'number') {
                perfilCompleto.limiteCanciones = 10;
            }
        }

        await setDoc(doc(db, "usuarios", user.uid), perfilCompleto);

        return { exito: true, user };
    } catch (error) {
        return { exito: false, mensaje: error.message };
    }
}

/**
 * LOGIN UNIVERSAL
 */
export async function loginUsuario(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { exito: true, user: userCredential.user };
    } catch (error) {
        return { exito: false, mensaje: error.message };
    }
}

/**
 * VERIFICAR SI EL USUARIO ES ADMINISTRADOR
 * Consulta si existe un documento con el UID del usuario en la colección "admins".
 */
export async function esAdmin(user) {
    if (!user) return false;

    try {
        const uid = typeof user === 'object' ? user.uid : user;
        const snap = await getDoc(doc(db, "admins", uid));
        return snap.exists();
    } catch (error) {
        console.error("Error al verificar admin:", error);
        return false;
    }
}

/**
 * LOGOUT UNIVERSAL
 */
export async function logoutUsuario() {
    try {
        await signOut(auth);
        return { exito: true };
    } catch (error) {
        return { exito: false, mensaje: error.message };
    }
}

export const logoutArtista = logoutUsuario;
export const logoutProductor = logoutUsuario;

/**
 * ELIMINAR CUENTA PROPIA (Artista o Productor)
 * Agnóstica de rol: solo necesita el usuario actualmente autenticado.
 *
 * Firebase exige una sesión "reciente" para operaciones sensibles como
 * borrar la cuenta — por eso se reautentica con la contraseña actual antes
 * de proceder, aunque la persona ya tenga sesión iniciada.
 *
 * ORDEN IMPORTA: el documento de Firestore se borra ANTES que la cuenta de
 * Firebase Authentication. Las reglas de "usuarios/{userId}" exigen
 * request.auth.uid == userId para poder escribir/borrar; si deleteUser()
 * se ejecutara primero, esa sesión ya no sería válida y el borrado del
 * documento fallaría por permisos.
 *
 * LIMITACIÓN CONOCIDA: esto es distinto de que un ADMIN borre la cuenta de
 * OTRA persona (eso sí sigue requiriendo Admin SDK/Cloud Function, ver
 * adminDb.js). Aquí es el propio usuario borrando su propia cuenta, que sí
 * es una operación soportada desde el cliente. Lo que esta función NO hace
 * es limpiar documentos relacionados en otras colecciones ("seguidores",
 * "likes_canciones") que referencian este uid — quedan huérfanos. Es la
 * misma limitación de "cascada" ya anotada para el borrado desde admin.
 */
export async function eliminarCuentaPropia(password) {
    const user = auth.currentUser;
    if (!user) return { exito: false, mensaje: "No hay una sesión activa." };

    try {
        // 1. Reautenticar con la contraseña actual
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);

        // 2. Borrar el documento de perfil en Firestore (mientras la
        // sesión todavía es válida para las reglas de seguridad)
        await deleteDoc(doc(db, "usuarios", user.uid));

        // 3. Borrar la cuenta de Firebase Authentication
        await deleteUser(user);

        return { exito: true };
    } catch (error) {
        let mensaje = error.message;
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            mensaje = "La contraseña ingresada es incorrecta.";
        } else if (error.code === 'auth/too-many-requests') {
            mensaje = "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.";
        } else if (error.code === 'auth/requires-recent-login') {
            mensaje = "Por seguridad, vuelve a iniciar sesión e inténtalo de nuevo.";
        }
        console.error("Error al eliminar la cuenta:", error);
        return { exito: false, mensaje };
    }
}