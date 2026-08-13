import { obtenerTodosLosProductores } from './services/db.js';
import { configurarMenuSesion } from './ui/session-nav.js';
import { renderizarProductores } from './ui/render.js';

// Elementos del DOM (Catálogo Público)
const grid = document.getElementById('gridProductores');
const inputBuscador = document.getElementById('buscadorNombre');

// Filtro Zona
const btnZona = document.getElementById('btnZona');
const listaZonas = document.getElementById('listaZonas');
const inputFiltroZona = document.getElementById('filtroZona');
const textoZonaActual = document.getElementById('textoZonaActual');

// Filtro Especialidad
const btnEspecialidad = document.getElementById('btnEspecialidad');
const listaEspecialidades = document.getElementById('listaDashEspecialidades');
const inputFiltroEspecialidad = document.getElementById('filtroEspecialidad');
const textoEspecialidadActual = document.getElementById('textoEspecialidadActual');

// Filtro Verificado
const checkVerificado = document.getElementById('filtroVerificado');

let todosLosProductores = [];

// Configuración de Caché
const CACHE_KEY = 'ggmusic_cache_productores';
const CACHE_TIME_KEY = 'ggmusic_cache_productores_time';
const CACHE_TTL = 10 * 60 * 1000; // 5 minutos en milisegundos

// Suma el likesCount de cada tema del array "temas" del perfil — igual
// criterio que usa admin.html para la columna "Métricas".
function calcularTotalLikesPerfil(item) {
    const temas = Array.isArray(item.temas) ? item.temas : [];
    return temas.reduce((suma, tema) => suma + (tema.likesCount || 0), 0);
}

function ordenarLista(lista, criterio) {
    if (criterio === 'seguidores') {
        return [...lista].sort((a, b) => (b.seguidoresCount || 0) - (a.seguidoresCount || 0));
    }
    if (criterio === 'likes') {
        return [...lista].sort((a, b) => calcularTotalLikesPerfil(b) - calcularTotalLikesPerfil(a));
    }
    // 'relevancia' -> se conserva el orden en que llegó desde Firestore
    return lista;
}

async function cargarProductores() {
    const cachedData = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
    const now = Date.now();

    // 1. Mostrar caché inmediatamente si existe
    if (cachedData) {
        todosLosProductores = JSON.parse(cachedData);
        aplicarFiltros();
    }

    // 2. Revalidar si expiró el TTL o no hay caché
    if (!cachedData || !cachedTime || (now - parseInt(cachedTime)) > CACHE_TTL) {
        try {
            const respuesta = await obtenerTodosLosProductores();

            if (!respuesta.exito && !cachedData) {
                throw new Error(respuesta.mensaje);
            }

            if (respuesta.exito) {
                todosLosProductores = respuesta.datos;
                
                // Actualizar caché
                localStorage.setItem(CACHE_KEY, JSON.stringify(respuesta.datos));
                localStorage.setItem(CACHE_TIME_KEY, now.toString());

                if (todosLosProductores.length === 0) {
                    grid.innerHTML = '<p class="text-gray-400 col-span-full text-center py-10">Aún no hay productores registrados en el ecosistema.</p>';
                } else {
                    aplicarFiltros(); // Refrescar vista con datos actualizados
                }
            }

        } catch (error) {
            console.error("Error al revalidar productores:", error);
            if (!cachedData) {
                grid.innerHTML = '<p class="text-red-500 col-span-full text-center py-10">Error al cargar el ecosistema. Verifica las reglas de Firestore o tu conexión.</p>';
            }
        }
    } else if (todosLosProductores.length === 0 && !cachedData) {
        grid.innerHTML = '<p class="text-gray-400 col-span-full text-center py-10">Aún no hay productores registrados en el ecosistema.</p>';
    }
}

// 2. Función para filtrar por Texto, Zona, Verificación y Especialidad
function aplicarFiltros() {
    const textoBusqueda = inputBuscador.value.toLowerCase();
    const zonaSeleccionada = inputFiltroZona.value;
    
    // Capturar valor de especialidad (si existe el input)
    const especialidadSeleccionada = inputFiltroEspecialidad ? inputFiltroEspecialidad.value : 'Todas';
    
    // Capturar estado del checkbox
    const soloVerificados = checkVerificado ? checkVerificado.checked : false;

    const productoresFiltrados = todosLosProductores.filter(productor => {
        const nombre = productor.nombre ? productor.nombre.toLowerCase() : '';
        const coincideNombre = nombre.includes(textoBusqueda);
        
        // Verifica si la zona coincide
        const coincideZona = zonaSeleccionada === 'Todas' || productor.zona === zonaSeleccionada;
        
        // Verifica si la especialidad coincide
        // Se valida contra "especialidad" o "rol" dependiendo de cómo lo guardes en Firebase
        const especialidadProductor = productor.especialidad || productor.rol || "";
        const coincideEspecialidad = especialidadSeleccionada === 'Todas' || especialidadProductor === especialidadSeleccionada;
        
        const esVerificado = productor.verificado || productor.esVerificado || false;
        const coincideVerificado = !soloVerificados || esVerificado;

        return coincideNombre && coincideZona && coincideEspecialidad && coincideVerificado;
    });

    // Orden (Relevancia / Más seguidores / Más me gusta)
    const selectOrden = document.getElementById('ordenProductores');
    const criterioOrden = selectOrden ? selectOrden.value : 'relevancia';
    const productoresOrdenados = ordenarLista(productoresFiltrados, criterioOrden);

    renderizarProductores(productoresOrdenados, grid.id);
}

// 3. Configurar Eventos de la Interfaz
function configurarEventos() {
    inputBuscador.addEventListener('input', aplicarFiltros);

    const selectOrden = document.getElementById('ordenProductores');
    if (selectOrden) {
        selectOrden.addEventListener('change', aplicarFiltros);
    }
    
    if (checkVerificado) {
        checkVerificado.addEventListener('change', aplicarFiltros);
    }

    // --- EVENTOS DEL MENÚ DE ZONAS ---
    if (btnZona && listaZonas) {
        btnZona.addEventListener('click', (e) => {
            e.stopPropagation();
            if (listaEspecialidades) listaEspecialidades.classList.add('hidden'); // Ocultar el otro menú
            listaZonas.classList.toggle('hidden');
        });

        // Gracias a la delegación de eventos, leerá cualquier <li> que esté en tu HTML
        listaZonas.addEventListener('click', (e) => {
            const item = e.target.closest('li');
            if (!item) return;

            const valor = item.getAttribute('data-value');
            inputFiltroZona.value = valor;
            textoZonaActual.textContent = item.textContent; 
            listaZonas.classList.add('hidden'); 
            
            aplicarFiltros(); 
        });
    }

    // --- EVENTOS DEL MENÚ DE ESPECIALIDAD ---
    if (btnEspecialidad && listaEspecialidades) {
        btnEspecialidad.addEventListener('click', (e) => {
            e.stopPropagation();
            if (listaZonas) listaZonas.classList.add('hidden'); // Ocultar el otro menú
            listaEspecialidades.classList.toggle('hidden');
        });

        listaEspecialidades.addEventListener('click', (e) => {
            const item = e.target.closest('li');
            if (!item) return;

            const valor = item.getAttribute('data-value');
            inputFiltroEspecialidad.value = valor;
            textoEspecialidadActual.textContent = item.textContent; 
            listaEspecialidades.classList.add('hidden'); 
            
            aplicarFiltros(); 
        });
    }

    // Cerrar los menús si se hace clic afuera
    document.addEventListener('click', () => {
        if (listaZonas) listaZonas.classList.add('hidden');
        if (listaEspecialidades) listaEspecialidades.classList.add('hidden');
    });
}

// 4. Inicializar
document.addEventListener('DOMContentLoaded', () => {
    configurarMenuSesion();
    configurarEventos();
    cargarProductores();
});