// js/ui/session-nav.js
// ==========================================
// CONTROL DEL MENÚ Y SESIÓN PÚBLICA
// ==========================================
// Única fuente de verdad para el comportamiento del nav (Ingresar / Crear
// Perfil vs. Mi Panel / Cerrar Sesión) en las páginas públicas del sitio.
//
// Antes esta función vivía copiada y pegada dentro de explorar.js e
// index.js, y faltaba por completo en explorar-productores.js (justo
// porque nadie se acordó de copiarla ahí también). A partir de ahora
// cualquier página pública que necesite este control de sesión solo
// tiene que importar y llamar a configurarMenuSesion() — un cambio en
// el flujo de sesión se hace en un solo archivo y no puede volver a
// "perderse" en una página nueva.
//
// Requisito en el HTML de la página que la use: los IDs
// nav-login, nav-registro, nav-panel, nav-logout,
// nav-mobile-perfil, texto-mobile-perfil y nav-mobile-logout.
// Todos son opcionales de forma individual (cada uso está protegido con
// "if (elemento)"), así que la función no revienta si alguno falta —
// simplemente no actualiza esa pieza del nav.
//
// nav-mobile-perfil ahora tiene un único significado en todas las páginas:
// enlaza al panel del usuario (dashboard.html o dashboard-productor.html
// según su rol — el mismo criterio para artistas y productores). Para un
// oyente, que no tiene panel propio, este ítem simplemente se oculta.
//
// nav-mobile-logout es el botón dedicado para cerrar sesión desde el menú
// inferior móvil. Antes esa acción solo existía "escondida" dentro del
// enlace de perfil, y solo para oyentes — un artista o productor logueado
// en móvil no tenía forma de salir sin entrar primero a su panel. Ahora
// aparece igual para cualquier rol logueado (oyente, artista o productor),
// separado del enlace de perfil.
//
// CORRECCIÓN APLICADA (indicador "hay novedades" en el nav): esta misma
// función, aplicarIndicadoresDeNovedades() —la que efectivamente pinta el
// puntito rosado (.badge-novedad-punto, ver css/main.css) sobre los
// enlaces a index.html/canciones.html cuando hay un snapshot más nuevo
// que la última visita del usuario— ya estaba definida y exportada aquí
// abajo, apoyándose en obtenerEstadoNovedades() de services/feedNovedades.js
// para el cálculo. El problema no era dónde vivía, sino que ningún
// archivo del proyecto la estaba INVOCANDO. Todo el andamiaje de datos
// (marcas de "visto", comparación de timestamps, caché liviana en
// feedNovedades.js) funcionaba correctamente por debajo, pero el usuario
// nunca llegaba a VER el aviso en pantalla. Se conecta la llamada dentro
// de configurarMenuSesion(), en el mismo lugar donde ya se resuelve el
// resto del estado del nav, para mantener una sola fuente de verdad y no
// duplicarla en cada página pública.
//
import { auth, db } from '../firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { obtenerEstadoNovedades } from '../services/feedNovedades.js';
import { reanudarReproduccionAutomatica } from '../services/floatingPlayer.js';
// ==========================================
// PINTADO OPTIMISTA (CACHÉ LOCAL)
// ==========================================
// onAuthStateChanged es asíncrono: Firebase necesita leer la sesión
// persistida antes de confirmar si hay usuario o no. Como este es un sitio
// multi-página (cada navegación recarga todo desde cero), esa espera se
// repite en cada cambio de página.
//
// Versión anterior de este archivo: mientras Firebase resolvía, ocultábamos
// TODO lo relacionado a sesión (para no mostrar el estado "sin sesión" por
// error a alguien que sí tenía sesión activa). Funcionaba, pero dejaba un
// instante de nav vacío en cada carga.
//
// Esta versión prueba algo más agresivo: recordamos en localStorage el
// último estado de sesión conocido (con sesión / sin sesión, y el rol) y
// lo pintamos de inmediato, sin esperar a Firebase. Cuando la respuesta
// real llega, se vuelve a pintar por si el caché estaba desactualizado
// (ej. el usuario cerró sesión desde otra pestaña) — en ese caso puede
// haber un parpadeo muy breve al estado correcto, pero en el caso normal
// (nada cambió) el usuario ve el menú correcto desde el primer instante.
const CLAVE_CACHE_SESION = 'ggmusic_sesion_cache';

function leerCacheSesion() {
    try {
        const crudo = localStorage.getItem(CLAVE_CACHE_SESION);
        return crudo ? JSON.parse(crudo) : null;
    } catch (error) {
        // localStorage puede fallar (navegación privada, cuota, etc.) — en
        // ese caso simplemente no hay pintado optimista, sin romper nada.
        return null;
    }
}

function guardarCacheSesion(estado) {
    try {
        if (estado) {
            localStorage.setItem(CLAVE_CACHE_SESION, JSON.stringify(estado));
        } else {
            localStorage.removeItem(CLAVE_CACHE_SESION);
        }
    } catch (error) {
        // Si falla el guardado no pasa nada grave: la próxima carga
        // simplemente no tendrá pintado optimista para este usuario.
    }
}

// Aplica un estado de sesión ({ loggedIn, rol }) al DOM del nav. Se llama
// dos veces en cada carga de página: una vez de forma optimista (con lo
// que había en caché) y otra con la respuesta real de Firebase.
function pintarEstadoSesion({ loggedIn, rol }, els) {
    const {
        navLogin, navRegistro, navPanel, navLogout,
        navMobilePerfil, textoMobilePerfil, navMobileLogout,
        navBiblioteca, navMobileBiblioteca
    } = els;

    if (!loggedIn) {
        if (navLogin) navLogin.classList.remove('hidden');
        if (navRegistro) navRegistro.classList.remove('hidden');
        if (navPanel) navPanel.classList.add('hidden');
        if (navLogout) navLogout.classList.add('hidden');
        if (navMobileLogout) navMobileLogout.classList.add('hidden');
        if (navBiblioteca) navBiblioteca.classList.add('hidden');
        if (navMobileBiblioteca) navMobileBiblioteca.classList.add('hidden');

        if (navMobilePerfil) {
            navMobilePerfil.href = 'login.html';
            if (textoMobilePerfil) textoMobilePerfil.textContent = "Ingresar";
            navMobilePerfil.classList.remove('text-indigo-400', 'text-red-400');
            navMobilePerfil.classList.add('text-gray-400');
            navMobilePerfil.classList.remove('hidden');
        }
        return;
    }

    // loggedIn === true
    if (navLogin) navLogin.classList.add('hidden');
    if (navRegistro) navRegistro.classList.add('hidden');
    if (navLogout) navLogout.classList.remove('hidden');
    if (navMobileLogout) navMobileLogout.classList.remove('hidden');

    if (rol && rol !== 'oyente') {
        // Artistas y Productores
        const urlDestino = (rol === 'productor') ? 'dashboard-productor.html' : 'dashboard.html';

        if (navPanel) {
            navPanel.href = urlDestino;
            navPanel.classList.remove('hidden');
        }
        if (navMobilePerfil) {
            navMobilePerfil.href = urlDestino;
            if (textoMobilePerfil) textoMobilePerfil.textContent = "Mi Panel";
            navMobilePerfil.classList.remove('text-gray-400', 'text-red-400');
            navMobilePerfil.classList.add('text-indigo-400');
            navMobilePerfil.classList.remove('hidden');
        }
        if (navBiblioteca) navBiblioteca.classList.add('hidden');
        if (navMobileBiblioteca) navMobileBiblioteca.classList.add('hidden');

    } else if (rol === 'oyente') {
        if (navPanel) navPanel.classList.add('hidden');
        if (navMobilePerfil) navMobilePerfil.classList.add('hidden');

        if (navBiblioteca) navBiblioteca.classList.remove('hidden');
        if (navMobileBiblioteca) {
            navMobileBiblioteca.classList.remove('hidden');
            navMobileBiblioteca.classList.add('flex');
        }

    } else {
        // Con sesión pero rol aún sin confirmar (primera visita sin caché,
        // o el documento en "usuarios" no existe): dejamos panel y
        // biblioteca ocultos hasta tener una respuesta real de Firestore.
        if (navPanel) navPanel.classList.add('hidden');
        if (navMobilePerfil) navMobilePerfil.classList.add('hidden');
        if (navBiblioteca) navBiblioteca.classList.add('hidden');
        if (navMobileBiblioteca) navMobileBiblioteca.classList.add('hidden');
    }
}

// ==========================================
// PUNTOS DE "HAY NOVEDADES" EN EL NAV (ver services/feedNovedades.js)
// ==========================================
// Selecciona por href en vez de por id: así no hace falta tocar ningún
// HTML — funciona igual en el link de escritorio, en el logo y en el
// menú inferior móvil, en todas las páginas que ya usan este archivo.
function aplicarBadgeEnEnlaces(selector, mostrar) {
    document.querySelectorAll(selector).forEach(enlace => {
        const existente = enlace.querySelector('.badge-novedad-punto');
        if (mostrar && !existente) {
            const punto = document.createElement('span');
            punto.className = 'badge-novedad-punto';
            punto.setAttribute('aria-hidden', 'true');
            enlace.appendChild(punto);
        } else if (!mostrar && existente) {
            existente.remove();
        }
    });
}

export async function aplicarIndicadoresDeNovedades() {
    try {
        const { hayNovedadHome, hayNovedadCanciones } = await obtenerEstadoNovedades();
        aplicarBadgeEnEnlaces('a[href="index.html"]', hayNovedadHome);
        aplicarBadgeEnEnlaces('a[href="canciones.html"]', hayNovedadCanciones);
    } catch (error) {
        console.error("Error al aplicar indicadores de novedades:", error);
    }
}

export function configurarMenuSesion() {
    const els = {
        navLogin: document.getElementById('nav-login'),
        navRegistro: document.getElementById('nav-registro'),
        navPanel: document.getElementById('nav-panel'),
        navLogout: document.getElementById('nav-logout'),
        navMobilePerfil: document.getElementById('nav-mobile-perfil'),
        textoMobilePerfil: document.getElementById('texto-mobile-perfil'),
        navMobileLogout: document.getElementById('nav-mobile-logout'),
        // NUEVO: Referencias a los botones de biblioteca (oyente)
        navBiblioteca: document.getElementById('nav-biblioteca'),
        navMobileBiblioteca: document.getElementById('nav-mobile-biblioteca'),
    };

    // 1. Pintado optimista, instantáneo, con el último estado conocido.
    const cache = leerCacheSesion();
    if (cache) {
        pintarEstadoSesion(cache, els);
    } else {
        // Sin caché (primera visita en este navegador, o localStorage no
        // disponible): ocultamos lo ambiguo hasta tener respuesta real,
        // igual que en la versión anterior de este archivo.
        if (els.navLogin) els.navLogin.classList.add('hidden');
        if (els.navRegistro) els.navRegistro.classList.add('hidden');
        if (els.navMobilePerfil) els.navMobilePerfil.classList.add('hidden');
    }

    // CORRECCIÓN APLICADA: esta llamada faltaba en todo el proyecto.
    // aplicarIndicadoresDeNovedades() (definida arriba en este mismo
    // archivo) ya resolvía correctamente si había contenido nuevo sin
    // ver, pero nunca se invocaba desde ningún lugar — así que el punto
    // rosado definido en css/main.css (.badge-novedad-punto) jamás
    // llegaba a pintarse en pantalla. Se dispara aquí, en paralelo al
    // resto de esta función: es asíncrona e independiente del flujo de
    // sesión, así que no bloquea ni interfiere con el pintado optimista
    // de arriba.
    aplicarIndicadoresDeNovedades();
    reanudarReproduccionAutomatica();

    async function cerrarSesion() {
        guardarCacheSesion(null); // así la próxima carga no arrastra el estado viejo
        try {
            await signOut(auth);
            window.location.reload();
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
        }
    }

    // 2. Respuesta real de Firebase: corrige el pintado si hacía falta y
    // actualiza el caché para la próxima carga de página.
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            let rol = null;
            try {
                const docSnap = await getDoc(doc(db, "usuarios", user.uid));
                if (docSnap.exists()) rol = docSnap.data().rol;
            } catch (error) {
                console.error("Error al obtener rol del usuario:", error);
            }

            const estado = { loggedIn: true, rol };
            guardarCacheSesion(estado);
            pintarEstadoSesion(estado, els);
        } else {
            guardarCacheSesion(null);
            pintarEstadoSesion({ loggedIn: false }, els);
        }
    });

    if (els.navLogout) els.navLogout.addEventListener('click', cerrarSesion);
    if (els.navMobileLogout) {
        els.navMobileLogout.addEventListener('click', (e) => {
            e.preventDefault();
            cerrarSesion();
        });
    }
}