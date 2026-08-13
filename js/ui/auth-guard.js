// js/ui/auth-guard.js
import { auth, db } from '../firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { esAdmin } from '../services/auth.js';

/**
 * Consulta la colección 'usuarios' para obtener el rol asignado
 * @param {string} uid - ID del usuario autenticado
 * @returns {Promise<string>} Rol del usuario ('artista', 'productor', 'oyente')
 */
export async function obtenerRolUsuario(uid) {
    try {
        const userRef = doc(db, 'usuarios', uid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists() && docSnap.data().rol) {
            return docSnap.data().rol;
        }
        return 'oyente'; // Rol por defecto si no está especificado
    } catch (error) {
        console.error("Error al consultar el rol del usuario:", error);
        return 'oyente';
    }
}

/**
 * Redirige al usuario al panel o vista adecuada según su rol
 * @param {Object} user - Objeto de usuario activo de Firebase Auth
 */
export async function redireccionarSegunRol(user) {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    const rol = await obtenerRolUsuario(user.uid);

    switch (rol) {
        case 'artista':
            window.location.href = 'dashboard.html';
            break;
        case 'productor':
            window.location.href = 'dashboard-productor.html';
            break;
        case 'oyente':
        default:
            window.location.href = 'index.html';
            break;
    }
}

/**
 * Protege vistas restringidas verificando la sesión y el rol permitido
 * @param {Function} callbackPermitido - Función a ejecutar si el acceso es válido
 * @param {string|null} rolRequerido - Rol obligatorio para acceder ('artista', 'productor', etc.)
 */
export function protegerRuta(callbackPermitido, rolRequerido = null) {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            // Sin sesión -> Redirigir a Login
            window.location.href = 'login.html';
            return;
        }

        // Si la ruta requiere un rol específico, verificamos los permisos
        if (rolRequerido) {
            const rolActual = await obtenerRolUsuario(user.uid);

            if (rolActual !== rolRequerido) {
                // Si el rol no coincide, reubicamos al usuario a donde le corresponde
                await redireccionarSegunRol(user);
                return;
            }
        }

        // Si la autenticación y el rol son válidos, ejecutamos la lógica de la página
        if (typeof callbackPermitido === 'function') {
            callbackPermitido(user);
        }
    });
}

/**
 * Protege vistas exclusivas de administrador (admin.html).
 * NOTA: esta función no existía en este archivo, aunque admin.html ya la
 * importaba y la llamaba — eso rompía la carga completa del script del
 * panel de administración (un import a un nombre inexistente es un error
 * fatal en módulos ES, así que nada dentro de admin.html llegaba a
 * ejecutarse, ni siquiera el menú lateral o el botón de cerrar sesión).
 *
 * A diferencia de protegerRuta() (que compara un campo "rol" en la
 * colección "usuarios"), el estatus de administrador se verifica contra
 * la colección separada "admins" mediante esAdmin(), ya usada en login.js
 * para decidir si redirigir a admin.html tras iniciar sesión.
 *
 * @param {Function} callbackPermitido - Función a ejecutar si el usuario es admin
 */
export function protegerRutaAdmin(callbackPermitido) {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            // Sin sesión -> Redirigir a Login
            window.location.href = 'login.html';
            return;
        }

        const esAdministrador = await esAdmin(user.uid);

        if (!esAdministrador) {
            // Con sesión pero sin permisos de admin: lo mandamos a donde
            // le corresponda según su rol real, no a un callejón sin salida.
            await redireccionarSegunRol(user);
            return;
        }

        if (typeof callbackPermitido === 'function') {
            callbackPermitido(user);
        }
    });
}