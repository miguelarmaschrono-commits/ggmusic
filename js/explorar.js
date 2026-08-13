import { obtenerTodosLosArtistas } from './services/db.js';
import { configurarMenuSesion } from './ui/session-nav.js';
import { renderizarArtistas } from './ui/render.js';

let listaGlobalArtistas = [];

// Configuración de Caché
const CACHE_KEY = 'ggmusic_cache_artistas';
const CACHE_TIME_KEY = 'ggmusic_cache_artistas_time';
const CACHE_TTL = 10 * 60 * 1000; // 5 minutos en milisegundos

// Suma el likesCount...
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
    return lista;
}

document.addEventListener('DOMContentLoaded', async () => {
    configurarMenuSesion();
    const contenedorGrid = document.getElementById('gridArtistas');
    const inputBuscador = document.getElementById('buscadorNombre');
    const checkVerificado = document.getElementById('filtroVerificado');
    
    if (contenedorGrid) {
        // --- EVENTOS INTERFAZ ---
        inputBuscador.addEventListener('input', aplicarFiltros);
        const selectOrden = document.getElementById('ordenArtistas');
        if (selectOrden) selectOrden.addEventListener('change', aplicarFiltros);
        if (checkVerificado) checkVerificado.addEventListener('change', aplicarFiltros);
        
        function configurarSelectPersonalizado(idBoton, idLista, idTexto, idInputOculto) {
            const btn = document.getElementById(idBoton);
            const lista = document.getElementById(idLista);
            const texto = document.getElementById(idTexto);
            const input = document.getElementById(idInputOculto);

            if(!btn || !lista) return;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('ul[id^="lista"]').forEach(ul => {
                    if (ul.id !== idLista) ul.classList.add('hidden');
                });
                lista.classList.toggle('hidden');
            });

            const opciones = lista.querySelectorAll('li');
            opciones.forEach(opcion => {
                opcion.addEventListener('click', (e) => {
                    const valorElegido = e.target.getAttribute('data-value');
                    const textoElegido = e.target.textContent;

                    texto.textContent = textoElegido;
                    input.value = valorElegido;
                    lista.classList.add('hidden');

                    aplicarFiltros();
                });
            });
        }

        configurarSelectPersonalizado('btnGenero', 'listaGeneros', 'textoGeneroActual', 'filtroGenero');
        configurarSelectPersonalizado('btnZona', 'listaZonas', 'textoZonaActual', 'filtroZona');

        document.addEventListener('click', () => {
            const listaGeneros = document.getElementById('listaGeneros');
            const listaZonas = document.getElementById('listaZonas');
            if (listaGeneros) listaGeneros.classList.add('hidden');
            if (listaZonas) listaZonas.classList.add('hidden');
        });

        // --- LÓGICA DE CACHÉ Y FETCH ---
        const cachedData = localStorage.getItem(CACHE_KEY);
        const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
        const now = Date.now();

        // 1. Mostrar caché inmediatamente si existe
        if (cachedData) {
            listaGlobalArtistas = JSON.parse(cachedData);
            aplicarFiltros(); // Usa aplicarFiltros para renderizar y respetar cualquier input previo
        }

        // 2. Revalidar en segundo plano si el TTL expiró o no hay caché
        if (!cachedData || !cachedTime || (now - parseInt(cachedTime)) > CACHE_TTL) {
            try {
                const respuesta = await obtenerTodosLosArtistas(); 
                
                if (respuesta.exito) {
                    listaGlobalArtistas = respuesta.datos;
                    
                    // Actualizar caché
                    localStorage.setItem(CACHE_KEY, JSON.stringify(respuesta.datos));
                    localStorage.setItem(CACHE_TIME_KEY, now.toString());
                    
                    // Re-renderizar con datos frescos
                    aplicarFiltros();
                } else if (!cachedData) {
                    throw new Error(respuesta.mensaje); 
                }
            } catch (error) {
                console.error("Error al revalidar el catálogo de artistas: ", error);
                // Mostrar error solo si no teníamos caché para mostrar
                if (!cachedData) {
                    contenedorGrid.innerHTML = `
                        <div class="col-span-full text-center py-10">
                            <p class="text-red-500 mb-2">Hubo un error al cargar el catálogo de artistas.</p>
                        </div>
                    `;
                }
            }
        }
    }
});

function aplicarFiltros() {
    const textoBusqueda = document.getElementById('buscadorNombre').value.toLowerCase();
    const generoSeleccionado = document.getElementById('filtroGenero').value;
    const zonaSeleccionada = document.getElementById('filtroZona').value;
    
    // Capturamos el estado del checkbox
    const checkVerificado = document.getElementById('filtroVerificado');
    const soloVerificados = checkVerificado ? checkVerificado.checked : false; 

    const artistasFiltrados = listaGlobalArtistas.filter(artista => {
        
        // 1. Nombre
        const nombreArtista = (artista.nombre || "").toLowerCase();
        const coincideNombre = nombreArtista.includes(textoBusqueda);
        
        // 2. Género
        const generoPrincipal = artista.genero || "";
        const generoSecundario = artista.generoSecundario || "";
        const coincideGenero = generoSeleccionado === "Todos" || 
                               generoPrincipal === generoSeleccionado || 
                               generoSecundario === generoSeleccionado;
        
        // 3. Zona
        const coincideZona = zonaSeleccionada === "Todas" || artista.zona === zonaSeleccionada;

        // 4. Verificación
        const esVerificado = artista.verificado || artista.esVerificado || false;
        const coincideVerificado = !soloVerificados || esVerificado; 

        return coincideNombre && coincideGenero && coincideZona && coincideVerificado;
    });

    // Orden (Relevancia / Más seguidores / Más me gusta)
    const criterioOrden = document.getElementById('ordenArtistas')?.value || 'relevancia';
    const artistasOrdenados = ordenarLista(artistasFiltrados, criterioOrden);

    // Renderizado
    document.getElementById('gridArtistas').innerHTML = '';
    
    if (artistasOrdenados.length === 0) {
        document.getElementById('gridArtistas').innerHTML = `
            <div class="col-span-full flex justify-center py-12">
                <p class="text-gray-400 bg-gray-800 px-6 py-3 rounded-lg border border-gray-700">No se encontraron artistas con estos filtros.</p>
            </div>
        `;
    } else {
        renderizarArtistas(artistasOrdenados, 'gridArtistas');
    }
}