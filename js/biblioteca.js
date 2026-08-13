// js/biblioteca.js
import { auth, db } from './firebase-config.js';
import { doc, getDoc, collection, query, where, getDocs, documentId } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { configurarMenuSesion } from './ui/session-nav.js';
import { renderizarArtistas, renderizarProductores } from './ui/render.js';
import { toggleSeguirArtista } from './services/interactions.js';

// Configurar barra de navegación dinámica
configurarMenuSesion();

const profilesContainerId = 'profiles-container';

let misArtistas = [];
let misProductores = [];
let usuarioUid = null;
let filtroActivo = 'all';

document.addEventListener('DOMContentLoaded', () => {
    // Verificar sesión del usuario oyente
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            usuarioUid = user.uid;
            await cargarBibliotecaOyente(user.uid);
            configurarFiltrosYBuscador();
        } else {
            window.location.href = 'login.html';
        }
    });
});

/**
 * Carga únicamente los artistas y productores que el oyente ha guardado en sus arrays de favoritos
 */
async function cargarBibliotecaOyente(uid) {
    try {
        const userRef = doc(db, 'usuarios', uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const userData = userSnap.data();
            const idsArtistas = userData.favoritosArtistas || [];
            const idsProductores = userData.favoritosProductores || [];

            // Obtener documentos completos de Firestore por bloques de IDs
            misArtistas = await obtenerPerfilesPorIds(idsArtistas);
            misProductores = await obtenerPerfilesPorIds(idsProductores);

            actualizarContadoresUI();
            renderizarVistaActual(filtroActivo);
        } else {
            console.warn("No se encontró el documento de usuario.");
            mostrarMensajeVacio("No se encontró tu perfil de usuario.");
        }
    } catch (error) {
        console.error("Error al cargar la biblioteca del oyente:", error);
        document.getElementById(profilesContainerId).innerHTML = '<p class="text-red-400 text-center">Error al obtener tu biblioteca.</p>';
    }
}

/**
 * Helper para realizar consultas en Firestore por lista de IDs (maneja lotes de hasta 30 por restricción de 'in')
 */
async function obtenerPerfilesPorIds(ids) {
    if (!ids || ids.length === 0) return [];
    
    // Si ya son objetos guardados directamente
    if (typeof ids[0] === 'object' && ids[0].id) return ids;

    const resultados = [];
    const usuariosRef = collection(db, 'usuarios');

    // Dividir en bloques de máximo 30 para la cláusula 'in' de Firestore
    for (let i = 0; i < ids.length; i += 30) {
        const bloqueIds = ids.slice(i, i + 30);
        const q = query(usuariosRef, where(documentId(), 'in', bloqueIds));
        const snap = await getDocs(q);
        snap.forEach(docSnap => {
            resultados.push({ id: docSnap.id, ...docSnap.data() });
        });
    }
    return resultados;
}

/**
 * Actualiza los contadores en el DOM.
 * Antes mostraban "x/50" (límite ya eliminado, ver interactions.js);
 * ahora es solo la cantidad guardada, sin techo.
 */
function actualizarContadoresUI() {
    const total = misArtistas.length + misProductores.length;
    
    document.getElementById('count-all').innerText = `(${total})`;
    document.getElementById('count-artistas').innerText = `(${misArtistas.length})`;
    document.getElementById('count-productores').innerText = `(${misProductores.length})`;
}

/**
 * Renderiza los perfiles según el filtro seleccionado
 */
function renderizarVistaActual(filtro, listaArtistas = misArtistas, listaProductores = misProductores) {
    const contenedor = document.getElementById(profilesContainerId);
    contenedor.innerHTML = '';

    if (listaArtistas.length === 0 && listaProductores.length === 0) {
        mostrarMensajeVacio("Aún no tienes guardado nada en tu biblioteca.");
        return;
    }

    if (filtro === 'all') {
        contenedor.innerHTML = `
            <div class="w-full col-span-full mb-6">
                <h3 class="text-indigo-400 font-bold mb-4">Artistas Guardados (${listaArtistas.length})</h3>
                <div id="sub-artistas" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full"></div>
            </div>
            <div class="w-full col-span-full">
                <h3 class="text-emerald-400 font-bold mb-4">Productores Guardados (${listaProductores.length})</h3>
                <div id="sub-productores" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full"></div>
            </div>`;

        renderizarArtistas(listaArtistas, 'sub-artistas', true);
        renderizarProductores(listaProductores, 'sub-productores', true);
        inyectarBotonesQuitar('sub-artistas', 'artista');
        inyectarBotonesQuitar('sub-productores', 'productor');
    } 
    else if (filtro === 'artist') {
        if (listaArtistas.length === 0) {
            mostrarMensajeVacio("No hay artistas guardados.");
            return;
        }
        renderizarArtistas(listaArtistas, profilesContainerId, true);
        inyectarBotonesQuitar(profilesContainerId, 'artista');
    } 
    else if (filtro === 'producer') {
        if (listaProductores.length === 0) {
            mostrarMensajeVacio("No hay productores guardados.");
            return;
        }
        renderizarProductores(listaProductores, profilesContainerId, true);
        inyectarBotonesQuitar(profilesContainerId, 'productor');
    }
}

/**
 * Vincula el evento de "Quitar de biblioteca" a los botones nativos renderizados por render.js
 */
function inyectarBotonesQuitar(contenedorId, tipo) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    // Buscamos directamente los botones estilizados generados en RENDER.JS
    const botonesQuitar = contenedor.querySelectorAll('button[data-action="quitar-favorito"]');

    botonesQuitar.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const targetId = btn.getAttribute('data-id');
            if (targetId) {
                quitarDeFavoritos(targetId, tipo);
            }
        });
    });
}

/**
 * Función para remover un perfil de la biblioteca.
 *
 * UNIFICACIÓN CON "SEGUIR": la biblioteca del oyente es, en esencia, su
 * lista de seguidos. Delegamos en toggleSeguirArtista() (services/
 * interactions.js), la misma función que usan artista.js y productor.js
 * para el botón "Seguir". Como el oyente ya sigue a este perfil,
 * toggleSeguirArtista() detecta ese estado y ejecuta el camino de
 * "dejar de seguir": borra el documento en "seguidores", decrementa
 * seguidoresCount, Y hace el arrayRemove sobre el array de favoritos —
 * todo en un solo lugar de verdad, sin duplicar la escritura aquí.
 */
export async function quitarDeFavoritos(targetId, tipo) {
    if (!usuarioUid) return;

    try {
        const res = await toggleSeguirArtista(usuarioUid, targetId);

        if (!res || !res.exito) {
            console.error("No se pudo dejar de seguir:", res);
            alert("No se pudo quitar de tu biblioteca. Inténtalo de nuevo.");
            return;
        }

        // res.siguiendo === false confirma que el resultado fue "dejar de
        // seguir" (y no un "seguir" inesperado por datos desincronizados).
        if (res.siguiendo === false) {
            if (tipo === 'artista') {
                misArtistas = misArtistas.filter(a => a.id !== targetId);
            } else {
                misProductores = misProductores.filter(p => p.id !== targetId);
            }

            actualizarContadoresUI();
            renderizarVistaActual(filtroActivo);
        }

    } catch (error) {
        console.error("Error al quitar de favoritos:", error);
        alert("No se pudo quitar de favoritos. Inténtalo de nuevo.");
    }
}

/**
 * Configuración de eventos para Pestañas y Buscador local
 */
function configurarFiltrosYBuscador() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const searchInput = document.getElementById('searchInput');

    // Filtrado por pestañas
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabButtons.forEach(b => b.classList.remove('active'));
            
            const targetBtn = e.target.closest('.tab-btn');
            targetBtn.classList.add('active');
            
            filtroActivo = targetBtn.getAttribute('data-filter');
            ejecutarFiltro();
        });
    });

    // Buscador local en tiempo real
    if (searchInput) {
        searchInput.addEventListener('input', () => ejecutarFiltro());
    }
}

function ejecutarFiltro() {
    const termino = document.getElementById('searchInput').value.toLowerCase().trim();

    const artistasFiltrados = misArtistas.filter(a => 
        (a.nombre && a.nombre.toLowerCase().includes(termino)) || 
        (a.genero && a.genero.toLowerCase().includes(termino)) ||
        (a.zona && a.zona.toLowerCase().includes(termino))
    );

    const productoresFiltrados = misProductores.filter(p => 
        (p.nombre && p.nombre.toLowerCase().includes(termino)) ||
        (p.especialidad && p.especialidad.toLowerCase().includes(termino)) ||
        (p.zona && p.zona.toLowerCase().includes(termino))
    );

    renderizarVistaActual(filtroActivo, artistasFiltrados, productoresFiltrados);
}

function mostrarMensajeVacio(mensaje) {
    const contenedor = document.getElementById(profilesContainerId);
    contenedor.innerHTML = `
        <div style="text-align: center; color: #94a3b8; padding: 3rem 1rem; width: 100%; grid-column: 1 / -1;">
            <p style="font-size: 1.1rem;">${mensaje}</p>
        </div>`;
}