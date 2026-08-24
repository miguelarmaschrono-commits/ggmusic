// ==========================================
// RENDER.JS - Motor Visual de GGmusic
// ==========================================

// Evita que datos guardados por un usuario (nombre, género, zona, etc.)
// puedan inyectar HTML/JS cuando se muestran en el navegador de otra persona.
function escapeHTML(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// Solo aceptamos imágenes servidas por http(s). Esto evita URLs tipo
// "javascript:" o similares en el atributo src de una imagen.
function esUrlImagenSegura(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url, window.location.href);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}

// Reduce el peso de las fotos de perfil insertando transformaciones de
// Cloudinary directamente en la URL (resize + crop + calidad/formato
// automáticos), sin volver a subir ninguna imagen. Las fotos se guardan
// en su resolución original al subirlas (cloudinary.js no aplica ningún
// preset de tamaño), pero en las tarjetas del feed/catálogo se muestran
// a ~150-200px — pedirlas ya redimensionadas ahorra una buena parte del
// ancho de banda que antes se descargaba y descartaba en el navegador.
// Si la URL no es de Cloudinary (ej. el fallback de ui-avatars.com), se
// devuelve intacta: esas ya vienen livianas y con su propio parámetro
// "size".
function optimizarUrlCloudinary(url, ancho = 400) {
    if (!url || !url.includes('res.cloudinary.com') || !url.includes('/upload/')) {
        return url;
    }
    const transformacion = `w_${ancho},h_${ancho},c_fill,g_auto,q_auto,f_auto`;
    return url.replace('/upload/', `/upload/${transformacion}/`);
}

// Formatea números grandes para las tarjetas (1200 -> "1.2K", 2500000 ->
// "2.5M"), igual criterio que redes sociales habituales. Números por
// debajo de 1000 se muestran tal cual, sin decimales inventados.
function formatearContador(numero) {
    const n = typeof numero === 'number' ? numero : 0;
    if (n < 1000) return String(n);
    if (n < 1_000_000) {
        const valor = n / 1000;
        return `${valor % 1 === 0 ? valor : valor.toFixed(1)}K`;
    }
    const valor = n / 1_000_000;
    return `${valor % 1 === 0 ? valor : valor.toFixed(1)}M`;
}

// El total de "Me gusta" de un perfil (suma de likesCount de todos sus
// temas) se resuelve de dos formas posibles:
//   1. Ya viene precalculado como "totalLikes" en el snapshot liviano de
//      feedHome (usado en index.html) — ver mapearSnapshotArtista /
//      mapearSnapshotProductor en adminDb.js y su espejo en el script
//      scripts/actualizar-feed.js que corre por GitHub Actions.
//   2. Si no viene ese campo pero sí el array "temas" completo (perfil
//      cargado entero, ej. explorar.html), se deriva sumando likesCount
//      de cada tema, igual que hace artista.js/productor.js al pintar la
//      cabecera del perfil individual.
// Si ninguna de las dos está disponible, se devuelve null y la tarjeta
// simplemente omite el badge de "Me gusta" en vez de mostrar un cero
// engañoso.
function calcularLikesTotalPerfil(perfil) {
    if (typeof perfil.totalLikes === 'number') return perfil.totalLikes;
    if (Array.isArray(perfil.temas)) {
        return perfil.temas.reduce((suma, tema) => suma + (tema.likesCount || 0), 0);
    }
    return null;
}

// Bloque compacto de estadísticas (Seguidores + opcionalmente Me gusta),
// pensado para ubicarse junto al nombre del perfil en la misma fila
// (ver uso con "flex justify-between" en renderizarArtistas/Productores).
// Seguidores siempre está disponible (seguidoresCount viene en ambos
// snapshots, el liviano y el completo); Me gusta solo se pinta cuando
// calcularLikesTotalPerfil() pudo derivarlo — ver esa función para el
// porqué. shrink-0 evita que este bloque se comprima cuando el nombre es
// largo; es el <h3> (con line-clamp-1) el que cede espacio primero.
function construirBloqueEstadisticas(perfil, colorAcento = 'indigo') {
    const seguidores = formatearContador(perfil.seguidoresCount || 0);
    const likesTotal = calcularLikesTotalPerfil(perfil);

    return `
        <div class="flex items-center gap-2.5 shrink-0 pl-2">
            <span class="flex items-center gap-1 bg-${colorAcento}-500/10 border border-${colorAcento}-500/20 text-${colorAcento}-300 text-[11px] font-bold px-2 py-1 rounded-lg" title="Seguidores">
                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                ${seguidores}
            </span>
            ${likesTotal !== null ? `
            <span class="flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] font-bold px-2 py-1 rounded-lg" title="Me gusta">
                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                ${formatearContador(likesTotal)}
            </span>
            ` : ''}
        </div>
    `;
}

export function renderizarArtistas(artistas, contenedorId, esBiblioteca = false) {
    const contenedor = document.getElementById(contenedorId);
    
    if (!contenedor) return;

    if (!artistas || artistas.length === 0) {
        contenedor.innerHTML = `
            <div class="col-span-full bg-[#1e293b] border border-gray-800 rounded-2xl p-12 text-center my-8">
                <span class="text-4xl mb-3 block">🎙</span>
                <h3 class="text-xl font-bold text-white mb-1">No se encontraron artistas</h3>
                <p class="text-gray-400 text-sm">Prueba ajustando los filtros de búsqueda o de zona.</p>
            </div>
        `;
        return;
    }

    let htmlTarjetas = '';
    
    artistas.forEach(artista => {
        const nombreSeguro = escapeHTML(artista.nombre || 'Artista Desconocido');
        const fotoCandidata = artista.fotoUrl || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(artista.nombre || 'Artista') + '&background=6366f1&color=fff');
        const fotoFallback = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(artista.nombre || 'Artista') + '&background=6366f1&color=fff';
        const fotoSegura = esUrlImagenSegura(fotoCandidata) ? fotoCandidata : fotoFallback;
        const foto = escapeHTML(optimizarUrlCloudinary(fotoSegura, 400));
        const genero = escapeHTML(artista.genero || 'Independiente');
        const generoSecundario = escapeHTML(artista.generoSecundario || '');
        const zona = escapeHTML(artista.zona || 'Local');
        const idArtista = encodeURIComponent(artista.id || ''); 
        
        htmlTarjetas += `
            <div class="bg-[#1e293b] border border-gray-800 rounded-2xl overflow-hidden hover:border-indigo-500/50 transition duration-300 shadow-xl flex flex-col justify-between group">
                <div>
                    <!-- Imagen de Portada y Badges (Se mantiene igual) -->
                    <div class="relative h-48 w-full overflow-hidden bg-gray-900">
                        <img src="${foto}" alt="${nombreSeguro}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                        <div class="absolute inset-0 bg-gradient-to-t from-[#1e293b] via-transparent to-transparent"></div>
                        <span class="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-gray-300 text-[11px] px-2.5 py-1 rounded-full border border-gray-700 font-medium">
                            📍 ${zona}
                        </span>
                    </div>

                    <!-- Información Principal (Se mantiene igual) -->
                    <div class="p-5 space-y-3">
                        ${artista.verificado === true ? `
                        <div class="flex items-center gap-1.5 text-xs text-indigo-400 font-semibold tracking-wide uppercase">
                            <svg class="w-3.5 h-3.5 fill-indigo-500" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                            <span>Creador Verificado</span>
                        </div>
                        ` : ''}
                        <div class="flex items-start justify-between gap-2">
                            <h3 class="text-xl font-bold text-white group-hover:text-indigo-400 transition line-clamp-1 min-w-0">${nombreSeguro}</h3>
                            ${construirBloqueEstadisticas(artista, 'indigo')}
                        </div>
                        <div class="flex flex-wrap gap-1.5 pt-1">
                            <span class="bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-[11px] px-2.5 py-0.5 rounded-full font-medium">${genero}</span>
                            ${generoSecundario ? `<span class="bg-gray-800 text-gray-400 border border-gray-700 text-[11px] px-2.5 py-0.5 rounded-full font-medium">${generoSecundario}</span>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Botones de Acción -->
                <div class="flex items-center gap-2 p-5 pt-0 mt-auto">
                    <a href="artista.html?id=${idArtista}" class="flex-1 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/30 hover:border-transparent font-semibold py-2.5 px-4 rounded-xl transition duration-200 flex items-center justify-center gap-2 text-sm group-hover:shadow-lg group-hover:shadow-indigo-600/20">
                        <span>Ver Perfil</span>
                        <svg class="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                    </a>

                    <!-- INYECCIÓN CONDICIONAL DEL BOTÓN -->
                    ${esBiblioteca ? `
                    <button data-action="quitar-favorito" 
                            data-id="${idArtista}" 
                            title="Quitar de Favoritos" 
                            class="bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/80 hover:border-rose-500/40 p-2.5 rounded-xl transition duration-200 flex items-center justify-center hover:scale-105 active:scale-95 shadow-sm group">
                        <svg class="w-5 h-5 group-hover:hidden transition-transform" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                        <svg class="w-5 h-5 hidden group-hover:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    });

    contenedor.innerHTML = htmlTarjetas;
}

export function renderizarProductores(productores, contenedorId, esBiblioteca = false) {
    const contenedor = document.getElementById(contenedorId);
    
    if (!contenedor) return;

    if (!productores || productores.length === 0) {
        contenedor.innerHTML = `
            <div class="col-span-full bg-[#1e293b] border border-gray-800 rounded-2xl p-12 text-center my-8">
                <span class="text-4xl mb-3 block">💽</span>
                <h3 class="text-xl font-bold text-white mb-1">No se encontraron productores</h3>
                <p class="text-gray-400 text-sm">Prueba ajustando los filtros de búsqueda o de zona.</p>
            </div>
        `;
        return;
    }

    let htmlTarjetas = '';
    
    productores.forEach(productor => {
        const nombreSeguro = escapeHTML(productor.nombre || 'Productor Desconocido');
        const fotoCandidata = productor.fotoUrl || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(productor.nombre || 'Productor') + '&background=10b981&color=fff');
        const fotoFallback = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(productor.nombre || 'Productor') + '&background=10b981&color=fff';
        const fotoSegura = esUrlImagenSegura(fotoCandidata) ? fotoCandidata : fotoFallback;
        const foto = escapeHTML(optimizarUrlCloudinary(fotoSegura, 400));
        const especialidad = escapeHTML(productor.especialidad || 'Producción Musical');
        const zona = escapeHTML(productor.zona || 'Local');
        const idProductor = encodeURIComponent(productor.id || '');
        // Acepta tanto el perfil completo (con array "temas", usado por
        // explorar-productores.js / biblioteca.js) como el snapshot liviano
        // del feed de inicio (que ya trae "cantidadTrabajos" precalculado
        // en vez del array completo — ver adminDb.js: actualizarFeedHome).
        const cantidadTrabajos = typeof productor.cantidadTrabajos === 'number'
            ? productor.cantidadTrabajos
            : (Array.isArray(productor.temas) && productor.temas.length > 0 ? productor.temas.length : (productor.temaDestacado ? 1 : 0));
        
        htmlTarjetas += `
            <div class="bg-[#1e293b] border border-gray-800 rounded-2xl overflow-hidden hover:border-emerald-500/50 transition duration-300 shadow-xl flex flex-col justify-between group">
                <div>
                    <!-- Imagen de Portada y Badges (Se mantiene igual) -->
                    <div class="relative h-48 w-full overflow-hidden bg-gray-900">
                        <img src="${foto}" alt="${nombreSeguro}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                        <div class="absolute inset-0 bg-gradient-to-t from-[#1e293b] via-transparent to-transparent"></div>
                        <span class="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-gray-300 text-[11px] px-2.5 py-1 rounded-full border border-gray-700 font-medium">
                            📍 ${zona}
                        </span>
                    </div>

                    <!-- Información Principal (Se mantiene igual) -->
                    <div class="p-5 space-y-3">
                        ${productor.verificado === true ? `
                        <div class="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold tracking-wide uppercase">
                            <svg class="w-3.5 h-3.5 fill-emerald-500" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                            <span>Productor Verificado</span>
                        </div>
                        ` : ''}
                        <div class="flex items-start justify-between gap-2">
                            <h3 class="text-xl font-bold text-white group-hover:text-emerald-400 transition line-clamp-1 min-w-0">${nombreSeguro}</h3>
                            ${construirBloqueEstadisticas(productor, 'emerald')}
                        </div>
                        <div class="flex flex-wrap gap-1.5 pt-1">
                            <span class="bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-[11px] px-2.5 py-0.5 rounded-full font-medium">${especialidad}</span>
                            ${cantidadTrabajos > 0 ? `<span class="bg-gray-800 text-gray-400 border border-gray-700 text-[11px] px-2.5 py-0.5 rounded-full font-medium">🎵 ${cantidadTrabajos} ${cantidadTrabajos === 1 ? 'trabajo' : 'trabajos'}</span>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Botones de Acción -->
                <div class="flex items-center gap-2 p-5 pt-0 mt-auto">
                    <a href="productor.html?id=${idProductor}" class="flex-1 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 hover:border-transparent font-semibold py-2.5 px-4 rounded-xl transition duration-200 flex items-center justify-center gap-2 text-sm group-hover:shadow-lg group-hover:shadow-emerald-600/20">
                        <span>Ver Perfil</span>
                        <svg class="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
                        </svg>
                    </a>

                    <!-- INYECCIÓN CONDICIONAL DEL BOTÓN -->
                    ${esBiblioteca ? `
                    <button data-action="quitar-favorito" 
                            data-id="${idProductor}" 
                            title="Quitar de Favoritos" 
                            class="bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/80 hover:border-rose-500/40 p-2.5 rounded-xl transition duration-200 flex items-center justify-center hover:scale-105 active:scale-95 shadow-sm group">
                        <svg class="w-5 h-5 group-hover:hidden transition-transform" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                        <svg class="w-5 h-5 hidden group-hover:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    });

    contenedor.innerHTML = htmlTarjetas;
}

// NOTA: Se eliminaron las funciones abrirModal y cerrarModal ya que ahora 
// delegamos la visualización al archivo artista.html o productor.html

// ==========================================
// RENDERIZAR CANCIONES (canciones.html)
// ==========================================
// Extrae el ID de video de YouTube (11 caracteres) de una URL en
// cualquiera de sus formatos habituales. Se replica aquí en vez de
// importarla de artista.js/interactions.js por la misma razón que ya
// documentan esos archivos: no crear una dependencia cruzada entre un
// módulo de UI y un servicio de datos solo por una función de 5 líneas.
function obtenerIdYouTubeRender(url) {
    if (!url) return null;
    if (url.includes('embed/')) {
        return url.split('embed/')[1].split('?')[0].split('&')[0];
    }
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2] && match[2].length === 11) ? match[2] : null;
}

function formatearYoutubeEmbedRender(url) {
    const id = obtenerIdYouTubeRender(url);
    return id ? `https://www.youtube.com/embed/${id}` : null;
}

// Mensaje reutilizado tanto por la grilla vertical (renderizarCanciones)
// como por el carrusel horizontal (renderizarCancionesHorizontal) cuando
// una sublista viene vacía.
function mensajeVacioCanciones() {
    return `
        <div class="col-span-full bg-[#1e293b] border border-gray-800 rounded-2xl p-12 text-center my-8">
            <span class="text-4xl mb-3 block">🎵</span>
            <h3 class="text-xl font-bold text-white mb-1">No se encontraron canciones</h3>
            <p class="text-gray-400 text-sm">Vuelve más tarde — el catálogo se sigue llenando.</p>
        </div>
    `;
}

// ==========================================
// RENDERIZADO DIFERIDO POR PROXIMIDAD (IntersectionObserver)
// ==========================================
// En vez de construir el HTML completo (imagen, botones, data-* de cada
// tarjeta) para TODAS las canciones apenas llega el feed, se pinta un
// placeholder liviano por canción y solo se construye la tarjeta real
// cuando ese placeholder se acerca al área visible. "Se acerca" incluye
// tanto el scroll vertical de la página como el scroll horizontal propio
// de cada carrusel (overflow-x-auto): el IntersectionObserver recorta
// automáticamente contra los contenedores con overflow que haya en el
// camino hasta la raíz, así que una tarjeta todavía oculta a la derecha
// de un carrusel no se considera "visible" aunque la sección sí lo sea.
//
// rootMargin agranda ese área "visible" un poco antes de que la tarjeta
// entre en pantalla, para que la carga (miniatura de YouTube, etc.)
// ya esté en curso cuando el usuario la alcanza con el scroll.

const OBSERVER_ROOT_MARGIN = '600px 300px 600px 300px'; // arriba/abajo, derecha, abajo, izquierda
let observadorTarjetas = null;

// Callback opcional para que la página que use este módulo pueda
// reaccionar cada vez que un placeholder se convierte en tarjeta real
// (ej. canciones.js lo usa para reaplicar el estado visual de "me gusta"
// sobre la tarjeta recién insertada — aplicarEstadoDeLikesEnDOM() solo
// alcanza a las tarjetas que ya existen en el DOM en el momento en que se
// llama, y con renderizado diferido eso ya no es "todas de una vez").
let notificarTarjetaRenderizada = null;

export function alRenderizarTarjetaDiferida(callback) {
    notificarTarjetaRenderizada = typeof callback === 'function' ? callback : null;
}

function obtenerObservadorTarjetas() {
    if (observadorTarjetas) return observadorTarjetas;
    if (typeof IntersectionObserver === 'undefined') return null;

    observadorTarjetas = new IntersectionObserver((entradas, observer) => {
        entradas.forEach(entrada => {
            if (!entrada.isIntersecting) return;
            observer.unobserve(entrada.target);
            reemplazarPlaceholderPorTarjeta(entrada.target);
        });
    }, {
        root: null,
        rootMargin: OBSERVER_ROOT_MARGIN,
        threshold: 0
    });

    return observadorTarjetas;
}

function reemplazarPlaceholderPorTarjeta(marcador) {
    const crudo = marcador.dataset.cancion;
    if (!crudo) { marcador.remove(); return; }

    let cancion;
    try {
        cancion = JSON.parse(crudo);
    } catch {
        marcador.remove();
        return;
    }

    const dentroDeCarrusel = marcador.dataset.carrusel === '1';
    const html = construirTarjetaCancion(cancion, dentroDeCarrusel);

    if (html) {
        marcador.outerHTML = html;
        notificarTarjetaRenderizada?.();
    } else {
        marcador.remove();
    }
}

// Alto aproximado de una tarjeta ya renderizada (miniatura 10rem + bloque
// de info), solo para que el placeholder reserve un espacio parecido y el
// reemplazo no produzca un salto de layout perceptible.
const ALTO_PLACEHOLDER_TARJETA = 'h-[21rem]';

function construirPlaceholderTarjeta(cancion, dentroDeCarrusel) {
    let cancionJSON;
    try {
        cancionJSON = JSON.stringify(cancion);
    } catch {
        return '';
    }
    const claseAncho = dentroDeCarrusel ? 'w-[280px] md:w-[320px] shrink-0 snap-center' : 'w-full';

    return `<div class="${claseAncho} ${ALTO_PLACEHOLDER_TARJETA} rounded-2xl bg-[#1e293b] border border-gray-800 animate-pulse" data-cancion="${escapeHTML(cancionJSON)}" data-carrusel="${dentroDeCarrusel ? '1' : '0'}"></div>`;
}

// Engancha el observador a todos los placeholders recién insertados dentro
// de un contenedor. Si el navegador no soporta IntersectionObserver (muy
// raro hoy en día), se renderizan de inmediato como respaldo.
function observarTarjetasEnContenedor(contenedor) {
    const marcadores = contenedor.querySelectorAll('[data-cancion]');
    const observer = obtenerObservadorTarjetas();

    if (!observer) {
        marcadores.forEach(reemplazarPlaceholderPorTarjeta);
        return;
    }

    marcadores.forEach(marcador => observer.observe(marcador));
}

/**
 * Construye el HTML de UNA tarjeta de canción a partir del snapshot ya
 * aplanado que genera actualizarFeedCanciones() (ver adminDb.js) y guarda
 * en feedCanciones/actual — cada elemento ya trae los datos del perfil
 * dueño denormalizados (perfilId, perfilNombre, perfilFotoUrl, perfilZona,
 * perfilEtiqueta, perfilVerificado, tipoPerfil).
 *
 * Se comparte entre renderizarCanciones() (grilla vertical, usada por
 * "Recién Publicado") y renderizarCancionesHorizontal() (carrusel con
 * scroll-snap, usado por los tres bloques de "Más Populares" — Top 1-10 /
 * 11-20 / 21-30). La única diferencia real entre ambos contextos es el
 * ancho de la tarjeta: fijo (280-320px) dentro de un carrusel, o 100% del
 * espacio de su celda dentro de una grilla — de ahí el parámetro
 * "dentroDeCarrusel".
 *
 * NOTA (reproductor flotante): además del botón de like ya existente
 * (.btn-like), cada tarjeta ahora también incluye un botón .btn-flotante
 * que envía este mismo tema al reproductor flotante persistente (ver
 * services/floatingPlayer.js), para que siga sonando aunque la tarjeta
 * salga del viewport por scroll o el usuario minimice la pestaña/PWA. El
 * listener real de este botón vive en la página que use este render
 * (ej. canciones.js), no aquí — render.js solo pinta el HTML con los
 * data-* necesarios para que ese listener no tenga que volver a buscar
 * los datos de la canción.
 *
 * @returns {string} HTML de la tarjeta, o cadena vacía si la canción no
 * tiene una URL de YouTube reconocible (nada que incrustar).
 */
function construirTarjetaCancion(cancion, dentroDeCarrusel) {
    // Extraemos el ID y generamos la miniatura automáticamente desde YouTube
    const videoIdSeguro = escapeHTML(obtenerIdYouTubeRender(cancion.url) || '');
    if (!videoIdSeguro) return '';
    const miniaturaYoutube = `https://i.ytimg.com/vi/${videoIdSeguro}/hqdefault.jpg`;

    const esProductor = cancion.tipoPerfil === 'productor';
    const colorAcento = esProductor ? 'emerald' : 'indigo';

    const nombreCancion = escapeHTML(cancion.nombre || 'Sin título');
    const nombrePerfil = escapeHTML(cancion.perfilNombre || (esProductor ? 'Productor' : 'Artista'));
    const zona = escapeHTML(cancion.perfilZona || 'Local');
    const etiqueta = escapeHTML(cancion.perfilEtiqueta || '');
    const genero = escapeHTML(cancion.genero || '');
    const fechaFormateada = cancion.fecha ? escapeHTML(cancion.fecha.split('-').reverse().join('/')) : '';

    const fotoCandidata = cancion.perfilFotoUrl || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(cancion.perfilNombre || 'GG') + `&background=${esProductor ? '10b981' : '6366f1'}&color=fff`);
    const fotoSegura = esUrlImagenSegura(fotoCandidata) ? fotoCandidata : fotoCandidata; 
    const fotoPerfil = escapeHTML(optimizarUrlCloudinary(fotoSegura, 80));

    const paginaPerfil = esProductor ? 'productor.html' : 'artista.html';
    const idPerfil = encodeURIComponent(cancion.perfilId || '');
    const cancionIdSeguro = escapeHTML(cancion.cancionId || '');

    const claseAncho = dentroDeCarrusel ? 'w-[280px] md:w-[320px] shrink-0 snap-center' : 'w-full';

    return `
        <div class="${claseAncho} bg-[#1e293b] border border-gray-800 rounded-2xl overflow-hidden hover:border-${colorAcento}-500/50 transition duration-300 shadow-xl flex flex-col group">
            
            <!-- PORTADA CON OVERLAY Y BOTÓN PLAY CENTRADO 3D (Tonos oscuros y gradiente fuerte) -->
            <div class="relative w-full h-40 bg-black shrink-0 overflow-hidden cursor-pointer">
                
                <img src="${miniaturaYoutube}" alt="Portada de ${nombreCancion}" class="w-full h-full object-cover transition duration-500 group-hover:scale-105 opacity-90 group-hover:opacity-100">
                
                <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    
                    <!-- BOTÓN PLAY PREMIUM OSCURO: De 500 a 900 para un contraste brutal -->
                   <button class="btn-flotante bg-gradient-to-br from-${colorAcento}-500 to-${colorAcento}-900 text-white rounded-full p-3 shadow-lg shadow-${colorAcento}-700/50 border border-white/20 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 hover:from-${colorAcento}-400 hover:to-${colorAcento}-800 hover:scale-110 focus:outline-none"
                        data-video-id="${videoIdSeguro}"
                        data-cancion-id="${cancionIdSeguro}"
                        data-perfil-id="${idPerfil}"
                        data-pagina-perfil="${paginaPerfil}"
                        data-titulo="${nombreCancion}"
                        data-subtitulo="${nombrePerfil}"
                        data-foto="${fotoPerfil}"
                        data-likes="${cancion.likesCount || 0}"
                        title="Reproducir en GGmusic">
                        <svg class="w-7 h-7 ml-1 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M4 4l12 6-12 6V4z"></path>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- CONTENIDO DE LA TARJETA -->
            <div class="p-4 space-y-3 flex-1 flex flex-col bg-[#1e293b]">
                
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                        <h3 class="text-white font-bold text-base line-clamp-1 truncate" title="${nombreCancion}">${nombreCancion}</h3>
                        <p class="text-slate-400 text-xs truncate mt-0.5">${nombrePerfil}</p>
                    </div>
                    
                    <button class="btn-like flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-rose-500 transition focus:outline-none shrink-0" data-cancion-id="${cancionIdSeguro}">
                        <svg class="w-5 h-5 icono-like transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                        <span class="count-likes text-[10px] font-bold leading-none">${cancion.likesCount || 0}</span>
                    </button>
                </div>

                ${(genero || fechaFormateada) ? `
                    <div class="text-[11px] text-${colorAcento}-400 flex items-center gap-1.5 font-medium -mt-1">
                        ${genero ? `<span>${genero}</span>` : ''}
                        ${(genero && fechaFormateada) ? `<span class="text-slate-600">•</span>` : ''}
                        ${fechaFormateada ? `<span class="text-slate-500">${fechaFormateada}</span>` : ''}
                    </div>
                ` : ''}

                <a href="${paginaPerfil}?id=${idPerfil}" class="flex items-center gap-2.5 pt-3 mt-auto border-t border-slate-800/80 hover:bg-slate-800/50 -mx-2 px-2 rounded-lg transition">
                    <img src="${fotoPerfil}" alt="${nombrePerfil}" loading="lazy" class="w-7 h-7 rounded-full object-cover border border-slate-700 shrink-0">
                    <div class="min-w-0 flex-1 flex items-center justify-between">
                        <div class="flex items-center gap-1">
                            <p class="text-[11px] font-semibold text-slate-300 truncate">Ver perfil</p>
                            ${cancion.perfilVerificado ? `<svg class="w-3 h-3 fill-${colorAcento}-400 shrink-0" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>` : ''}
                        </div>
                        <p class="text-[10px] text-slate-500 truncate">${etiqueta ? etiqueta + ' • ' : ''}📍 ${zona}</p>
                    </div>
                </a>
            </div>
        </div>
    `;
}

/**
 * Pinta una grilla vertical de tarjetas de canción. Usada por la sección
 * "Recién Publicado" de canciones.html. Firma sin cambios respecto a la
 * versión anterior de este archivo, así que no rompe a nadie que ya la
 * importaba.
 *
 * @param {Array} canciones - lista de objetos de canción del snapshot
 * @param {string} contenedorId - id del contenedor donde pintar la grilla
 */
export function renderizarCanciones(canciones, contenedorId) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    // Se descartan de entrada las canciones sin un video de YouTube
    // reconocible (construirTarjetaCancion tampoco las pintaría), así el
    // placeholder solo se crea para las que sí van a tener tarjeta.
    const validas = (canciones || []).filter(c => obtenerIdYouTubeRender(c.url));

    if (validas.length === 0) {
        contenedor.innerHTML = mensajeVacioCanciones();
        return;
    }

    contenedor.innerHTML = validas.map(c => construirPlaceholderTarjeta(c, false)).join('');
    observarTarjetasEnContenedor(contenedor);
}

/**
 * Pinta un carrusel horizontal con scroll-snap de tarjetas de canción —
 * usado por los tres bloques en los que se dividió "Más Populares" en
 * canciones.html (Top 1-10 / 11-20 / 21-30, ver canciones.js). Reasigna
 * la clase del contenedor a un flex horizontal con overflow-x-auto en
 * cada llamada, así el mismo <div> puede haber sido usado antes por
 * mensajeVacioCanciones() (que no necesita ese layout) sin dejar clases
 * residuales.
 *
 * @param {Array} canciones - lista de objetos de canción (ya recortada,
 * ej. un bloque de 10) a mostrar en este carrusel
 * @param {string} contenedorId - id del contenedor donde pintar el carrusel
 */
export function renderizarCancionesHorizontal(canciones, contenedorId) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    contenedor.className = "flex overflow-x-auto gap-6 pb-6 snap-x scrollbar-thin scrollbar-thumb-slate-700";

    const validas = (canciones || []).filter(c => obtenerIdYouTubeRender(c.url));

    if (validas.length === 0) {
        contenedor.innerHTML = mensajeVacioCanciones();
        return;
    }

    contenedor.innerHTML = validas.map(c => construirPlaceholderTarjeta(c, true)).join('');
    observarTarjetasEnContenedor(contenedor);
}