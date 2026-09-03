// ==========================================
// ARTISTA.JS - Lógica del perfil individual (artista.html)
// ==========================================
import { auth } from './firebase-config.js';
import { obtenerPerfilArtista } from './services/db.js';
import { toggleSeguirArtista, esSeguidor, inicializarLikesEnTarjetas, aplicarEstadoDeLikesEnDOM, tieneLikeLocal } from './services/interactions.js'; 
import { reproducirEnFlotante, establecerCola, reanudarReproduccionAutomatica } from './services/floatingPlayer.js';

const cargando = document.getElementById('cargando-perfil');
const errorDiv = document.getElementById('error-perfil');
const contenido = document.getElementById('contenido-perfil');

function limitarTexto(valor, max) {
    return String(valor ?? '').slice(0, max);
}

function escapeHTML(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function esUrlValida(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url, window.location.href);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function renderizarPlaylistsPublicas(playlists) {
    const contenedor = document.getElementById('lista-playlists-publica');
    const seccion = document.getElementById('seccion-playlists');
    if (!contenedor || !seccion) return;

    const items = Array.isArray(playlists) ? playlists.filter(p => p && p.url && esUrlValida(p.url)) : [];

    if (items.length === 0) {
        seccion.classList.add('hidden');
        contenedor.innerHTML = '';
        return;
    }

    seccion.classList.remove('hidden');
    contenedor.innerHTML = items.map((playlist, index) => {
        const nombre = escapeHTML(limitarTexto(playlist.nombre || `Playlist ${index + 1}`, 15));
        const descripcion = escapeHTML(limitarTexto(playlist.descripcion || 'Selección musical recomendada por el artista.', 100));
        const url = escapeHTML(playlist.url.trim());

        return `
            <div class="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-lg">
                <button type="button" class="accordion-playlist w-full flex items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-slate-800/60" data-index="${index}" aria-expanded="false">
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C6.48 0 2 4.48 2 10c0 4.17 2.89 7.7 6.84 9.24.24.09.41.32.41.58v3.16a.75.75 0 0 0 1.24.53l2.16-2.16c.14-.14.35-.22.56-.22H12c5.52 0 10-4.48 10-10S17.52 0 12 0zm-1 5.5h2v5.09l3.19 1.89-.9 1.56L11 18.5V5.5z"/></svg>
                        </span>
                        <div class="min-w-0">
                            <div class="text-sm font-bold text-white truncate">${nombre}</div>
                            <div class="text-[11px] text-slate-400 line-clamp-2">${descripcion}</div>
                        </div>
                    </div>
                    <svg class="chevron w-5 h-5 text-slate-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                </button>

                <div class="playlist-contenido hidden px-4 pb-4 pt-0">
                    <div class="pt-3 border-t border-slate-800/60">
                        <p class="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-2">Temática</p>
                        <p class="text-sm text-slate-300 leading-relaxed">${descripcion}</p>
                        <a href="${url}" target="_blank" rel="noopener noreferrer" class="mt-4 inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-all shadow-lg shadow-emerald-500/20">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C6.48 0 2 4.48 2 10c0 4.17 2.89 7.7 6.84 9.24.24.09.41.32.41.58v3.16a.75.75 0 0 0 1.24.53l2.16-2.16c.14-.14.35-.22.56-.22H12c5.52 0 10-4.48 10-10S17.52 0 12 0zm-1 5.5h2v5.09l3.19 1.89-.9 1.56L11 18.5V5.5z"/></svg>
                            Abrir playlist en Spotify
                        </a>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    contenedor.querySelectorAll('.accordion-playlist').forEach((button) => {
        button.addEventListener('click', () => {
            const panel = button.parentElement.querySelector('.playlist-contenido');
            const chevron = button.querySelector('.chevron');
            const isOpen = !panel.classList.contains('hidden');

            panel.classList.toggle('hidden');
            chevron.classList.toggle('rotate-180', !isOpen);
            button.setAttribute('aria-expanded', String(!isOpen));
        });
    });
}
 
function obtenerIdYouTube(url) {
    if (!url) return null;
    if (url.includes('embed/')) return url.split('embed/')[1].split('?')[0];
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}
 
function formatearYoutubeUrl(url) {
    const id = obtenerIdYouTube(url);
    return id ? `https://www.youtube.com/embed/${id}` : null;
}
 
async function cargarPerfil() {
    try {
        const params = new URLSearchParams(window.location.search);
        const artistaId = params.get('id');
 
        if (!artistaId) throw new Error("No se proporcionó ID de artista en la URL");
 
        const res = await obtenerPerfilArtista(artistaId);
        if (!res.exito || !res.datos) throw new Error("No se encontraron datos del artista");
 
        const data = res.datos;
 
        // 1. Llenar Datos
        const avatarUrl = data.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.nombre || 'Artista')}&background=6366f1&color=fff`;
        const portadaUrl = data.fotoPortadaUrl || avatarUrl;
        document.getElementById('artista-avatar').src = avatarUrl;
        document.getElementById('hero-bg').style.backgroundImage = `url('${portadaUrl}')`;
        document.getElementById('artista-nombre').textContent = data.nombre || 'Artista Desconocido';
        document.title = `${data.nombre || 'Artista'} - GGmusic`;

        if (data.verificado === true) {
            document.getElementById('badge-verificado').classList.remove('hidden');
        }
 
        document.getElementById('badge-genero').textContent = data.genero || 'Música';
        if (data.generoSecundario) {
            const badgeSec = document.getElementById('badge-genero-sec');
            badgeSec.textContent = data.generoSecundario;
            badgeSec.classList.remove('hidden');
        }
        document.getElementById('badge-zona').textContent = `📍 ${data.zona || 'Local'}`;
        document.getElementById('contador-seguidores').textContent = data.seguidoresCount || '0';
 
        const cantidadTemas = Array.isArray(data.temas) ? data.temas.length : (data.temaDestacado ? 1 : 0);
        document.getElementById('contador-temas').textContent = cantidadTemas;

        // Total de "Me gusta" del perfil: suma de likesCount de todos los
        // temas. No es un campo aparte en Firestore — se deriva aquí mismo
        // a partir del array "temas" que ya viene incluido en la lectura
        // del perfil (obtenerPerfilArtista), así que no cuesta ninguna
        // lectura extra a la base de datos.
        const totalLikesPerfil = Array.isArray(data.temas)
            ? data.temas.reduce((suma, tema) => suma + (tema.likesCount || 0), 0)
            : 0;
        const elContadorLikesTotal = document.getElementById('contador-likes-total');
        if (elContadorLikesTotal) elContadorLikesTotal.textContent = totalLikesPerfil;
 
        // 2. Redes Sociales
        if (data.redesSociales) {
            const redesContenedor = document.getElementById('redes-sociales');
            let htmlRedes = '';
            const baseClass = "bg-white/10 hover:bg-white/20 text-white p-2 rounded-full backdrop-blur-md transition duration-200 border border-white/10 text-xs font-semibold px-4 flex items-center gap-2";
 
            if (data.redesSociales.instagram) htmlRedes += `<a href="${data.redesSociales.instagram}" target="_blank" class="${baseClass}">Instagram</a>`;
            if (data.redesSociales.tiktok) htmlRedes += `<a href="${data.redesSociales.tiktok}" target="_blank" class="${baseClass}">TikTok</a>`;
            if (data.redesSociales.spotify) htmlRedes += `<a href="${data.redesSociales.spotify}" target="_blank" class="${baseClass}">Spotify</a>`;
            if (data.redesSociales.youtube) htmlRedes += `<a href="${data.redesSociales.youtube}" target="_blank" class="${baseClass}">YouTube</a>`;
            if (data.redesSociales.facebook) htmlRedes += `<a href="${data.redesSociales.facebook}" target="_blank" class="${baseClass}">Facebook</a>`;
 
            if (htmlRedes !== '') {
                redesContenedor.innerHTML = htmlRedes;
                redesContenedor.classList.remove('hidden');
            }
        }
 
        const playlists = Array.isArray(data.playlists)
            ? data.playlists
            : (Array.isArray(data.redesSociales?.playlists)
                ? data.redesSociales.playlists
                : (data.redesSociales?.spotifyPlaylist
                    ? [{ nombre: 'Playlist recomendada', descripcion: '', url: data.redesSociales.spotifyPlaylist }]
                    : []));
        renderizarPlaylistsPublicas(playlists);

        // 3. Biografía
        if (data.biografia && data.biografia.trim() !== '') {
            document.getElementById('texto-biografia').textContent = `"${data.biografia}"`;
            document.getElementById('seccion-biografia').classList.remove('hidden');
        }
 
        // 4. Tema Destacado
        const embedUrl = formatearYoutubeUrl(data.temaDestacado);
        if (embedUrl) {
            const videoId = obtenerIdYouTube(data.temaDestacado);
            const cancionIdDestacada = `${artistaId}_${videoId}`;
            document.getElementById('btn-like-destacado').dataset.cancionId = cancionIdDestacada;

            const btnDestacado = document.getElementById('btn-flotante-destacado');
            document.getElementById('miniatura-destacado').src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            btnDestacado.dataset.cancionId = cancionIdDestacada;
            btnDestacado.dataset.videoId = videoId;
            btnDestacado.dataset.perfilId = artistaId;
            btnDestacado.dataset.paginaPerfil = 'artista.html';
            btnDestacado.dataset.subtitulo = data.nombre || 'Artista';
            btnDestacado.dataset.foto = avatarUrl;
            btnDestacado.dataset.titulo = 'Tema Destacado';
            btnDestacado.dataset.likes = 0;

            if (data.temas && data.temas.length > 0) {
                const temaEncontrado = data.temas.find(t => formatearYoutubeUrl(t.url) === embedUrl);
                if (temaEncontrado) {
                    document.getElementById('titulo-destacado').textContent = temaEncontrado.nombre || 'Tema sin título';
                    btnDestacado.dataset.titulo = temaEncontrado.nombre || 'Tema sin título';
                    btnDestacado.dataset.likes = temaEncontrado.likesCount || 0;

                    const spanLikesDestacado = document.querySelector('#btn-like-destacado .count-likes');
                    if (spanLikesDestacado) spanLikesDestacado.textContent = temaEncontrado.likesCount || 0;

                    const elGenero = document.getElementById('genero-destacado');
                    const elFecha = document.getElementById('fecha-destacado');
                    const elPunto = document.getElementById('punto-destacado');

                    if (temaEncontrado.genero) {
                        elGenero.textContent = temaEncontrado.genero;
                        elGenero.classList.remove('hidden');
                    } else {
                        elGenero.classList.add('hidden');
                    }

                    if (temaEncontrado.fecha) {
                        elFecha.textContent = temaEncontrado.fecha.split('-').reverse().join('/');
                        elFecha.classList.remove('hidden');
                    } else {
                        elFecha.classList.add('hidden');
                    }

                    if (temaEncontrado.genero && temaEncontrado.fecha) {
                        elPunto.classList.remove('hidden');
                    } else {
                        elPunto.classList.add('hidden');
                    }

                    document.getElementById('contenedor-meta-destacado').classList.remove('hidden');
                }
            }
        } else {
            document.getElementById('contenedor-video').classList.add('hidden');
            document.getElementById('sin-video').classList.remove('hidden');
        }
 
        // 5. Más Videos (Listas primero, Sencillos después)
        if (data.temas && data.temas.length > 0) {
            const gridVideos = document.getElementById('grid-mas-videos');
            gridVideos.className = "space-y-10"; 
            let htmlVideos = '';
            
            const temasAdicionales = data.temas.filter(t => t.url && formatearYoutubeUrl(t.url) !== embedUrl);

            if (temasAdicionales.length > 0) {
                const temasSinLista = temasAdicionales.filter(tema => !tema.lista || tema.lista.trim() === "");
                const temasConLista = temasAdicionales.filter(tema => tema.lista && tema.lista.trim() !== "");

                // --- SECCIÓN 1: ÁLBUMES / EPs ---
                if (temasConLista.length > 0) {
                    const gruposListas = {};
                    temasConLista.forEach(tema => {
                        const nombreLista = tema.lista.trim();
                        if (!gruposListas[nombreLista]) gruposListas[nombreLista] = [];
                        gruposListas[nombreLista].push(tema);
                    });

                    for (const [nombreLista, temasGrupo] of Object.entries(gruposListas)) {
                        if (temasGrupo.length === 0) continue;

                        htmlVideos += `
                            <div class="space-y-4">
                                <h3 class="text-xl font-bold text-white border-b border-slate-800/80 pb-2 flex items-center gap-2">
                                    <span class="w-2 h-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500"></span>
                                    ${nombreLista}
                                </h3>
                                <div class="flex overflow-x-auto gap-6 pb-6 snap-x scrollbar-thin scrollbar-thumb-slate-700">
                        `;

                        temasGrupo.forEach((tema) => {
                            const urlEmbedSec = formatearYoutubeUrl(tema.url);
                            if (urlEmbedSec) {
                                const vId = obtenerIdYouTube(tema.url);
                                const cancionCardId = `${artistaId}_${vId}`;
                                const fechaFormateada = tema.fecha ? tema.fecha.split('-').reverse().join('/') : '';
                                const generoTexto = tema.genero || '';
                                const miniaturaUrl = `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;

                                htmlVideos += `
                                    <div class="w-[280px] md:w-[320px] shrink-0 snap-center bg-slate-900/80 rounded-2xl overflow-hidden border border-slate-800 shadow-lg flex flex-col transition-transform hover:-translate-y-1 backdrop-blur-sm">
                                        <button type="button" class="btn-flotante relative w-full pb-[56.25%] bg-black block group/play focus:outline-none" data-cancion-id="${cancionCardId}" data-video-id="${vId}" data-titulo="${(tema.nombre || 'Sin título').replace(/"/g, '&quot;')}" data-subtitulo="${(data.nombre || 'Artista').replace(/"/g, '&quot;')}" data-foto="${avatarUrl}" data-likes="${tema.likesCount || 0}" data-perfil-id="${artistaId}" data-pagina-perfil="artista.html">
                                            <img src="${miniaturaUrl}" alt="${(tema.nombre || 'Miniatura').replace(/"/g, '&quot;')}" class="absolute top-0 left-0 w-full h-full object-cover" loading="lazy">
                                            <div class="absolute inset-0 bg-black/30 group-hover/play:bg-black/50 transition-colors flex items-center justify-center">
                                                <span class="w-14 h-14 rounded-full bg-indigo-600/90 group-hover/play:bg-indigo-500 shadow-xl flex items-center justify-center transition-transform group-hover/play:scale-110">
                                                    <svg class="w-6 h-6 text-white translate-x-0.5" fill="currentColor" viewBox="0 0 20 20"><path d="M6 4l10 6-10 6V4z"></path></svg>
                                                </span>
                                            </div>
                                        </button>
                                        <div class="p-4 border-t border-slate-800/50 bg-slate-900/30 flex-1 flex flex-col justify-between">
                                            <div>
                                                <div class="flex justify-between items-start gap-4">
                                                    <h4 class="text-[15px] font-bold text-white mb-0.5 line-clamp-1 flex-1">${tema.nombre || 'Sin título'}</h4>
                                                    <button class="btn-like flex items-center gap-1.5 text-slate-400 hover:text-rose-500 transition focus:outline-none shrink-0" data-cancion-id="${cancionCardId}">
                                                        <svg class="w-5 h-5 icono-like transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                                                        <span class="count-likes text-xs font-bold">${tema.likesCount || 0}</span>
                                                    </button>
                                                </div>
                                                
                                                ${(generoTexto || fechaFormateada) ? `
                                                    <div class="text-xs text-slate-400 mt-2 flex items-center gap-1.5 font-medium">
                                                        ${generoTexto ? `<span class="text-indigo-400">${generoTexto}</span>` : ''}
                                                        ${(generoTexto && fechaFormateada) ? `<span class="text-slate-600 text-[10px]">•</span>` : ''}
                                                        ${fechaFormateada ? `<span>${fechaFormateada}</span>` : ''}
                                                    </div>
                                                ` : ''}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }
                        });
                        htmlVideos += `</div></div>`; 
                    }
                }

                // --- SECCIÓN 2: SENCILLOS ---
                if (temasSinLista.length > 0) {
                    htmlVideos += `
                        <div class="space-y-4">
                            <h3 class="text-xl font-bold text-white border-b border-slate-800/80 pb-2 flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500"></span>
                                Sencillos
                            </h3>
                            <div class="max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2">
                    `;

                    temasSinLista.forEach((tema) => {
                        const urlEmbedSec = formatearYoutubeUrl(tema.url);
                        if (urlEmbedSec) {
                            const vId = obtenerIdYouTube(tema.url);
                            const cancionCardId = `${artistaId}_${vId}`;
                            const fechaFormateada = tema.fecha ? tema.fecha.split('-').reverse().join('/') : '';
                            const generoTexto = tema.genero || '';
                            const miniaturaUrl = `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;

                            htmlVideos += `
                                <div class="w-full bg-slate-900/80 rounded-2xl overflow-hidden border border-slate-800 shadow-lg flex flex-col transition-transform hover:-translate-y-1 backdrop-blur-sm">
                                    <button type="button" class="btn-flotante relative w-full pb-[56.25%] bg-black block group/play focus:outline-none" data-cancion-id="${cancionCardId}" data-video-id="${vId}" data-titulo="${(tema.nombre || 'Sin título').replace(/"/g, '&quot;')}" data-subtitulo="${(data.nombre || 'Artista').replace(/"/g, '&quot;')}" data-foto="${avatarUrl}" data-likes="${tema.likesCount || 0}" data-perfil-id="${artistaId}" data-pagina-perfil="artista.html">
                                        <img src="${miniaturaUrl}" alt="${(tema.nombre || 'Miniatura').replace(/"/g, '&quot;')}" class="absolute top-0 left-0 w-full h-full object-cover" loading="lazy">
                                        <div class="absolute inset-0 bg-black/30 group-hover/play:bg-black/50 transition-colors flex items-center justify-center">
                                            <span class="w-14 h-14 rounded-full bg-indigo-600/90 group-hover/play:bg-indigo-500 shadow-xl flex items-center justify-center transition-transform group-hover/play:scale-110">
                                                <svg class="w-6 h-6 text-white translate-x-0.5" fill="currentColor" viewBox="0 0 20 20"><path d="M6 4l10 6-10 6V4z"></path></svg>
                                            </span>
                                        </div>
                                    </button>
                                    <div class="p-4 border-t border-slate-800/50 bg-slate-900/30 flex-1 flex flex-col justify-between">
                                        <div>
                                            <div class="flex justify-between items-start gap-4">
                                                <h4 class="text-[15px] font-bold text-white mb-0.5 line-clamp-1 flex-1">${tema.nombre || 'Sin título'}</h4>
                                                <button class="btn-like flex items-center gap-1.5 text-slate-400 hover:text-rose-500 transition focus:outline-none shrink-0" data-cancion-id="${cancionCardId}">
                                                    <svg class="w-5 h-5 icono-like transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                                                    <span class="count-likes text-xs font-bold">${tema.likesCount || 0}</span>
                                                </button>
                                            </div>
                                            
                                            ${(generoTexto || fechaFormateada) ? `
                                                <div class="text-xs text-slate-400 mt-2 flex items-center gap-1.5 font-medium">
                                                    ${generoTexto ? `<span class="text-indigo-400">${generoTexto}</span>` : ''}
                                                    ${(generoTexto && fechaFormateada) ? `<span class="text-slate-600 text-[10px]">•</span>` : ''}
                                                    ${fechaFormateada ? `<span>${fechaFormateada}</span>` : ''}
                                                </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }
                    });

                    htmlVideos += `</div></div></div>`; 
                }

                if (htmlVideos !== '') {
                    gridVideos.innerHTML = htmlVideos;
                    document.getElementById('seccion-mas-videos').classList.remove('hidden');
                    document.getElementById('badge-total-temas').textContent = 
                        `${cantidadTemas} ${cantidadTemas === 1 ? 'tema' : 'temas'}`;
                }
            }
        }       
        cargando.classList.add('hidden');
        contenido.classList.remove('hidden');

        // Las tarjetas de tema (destacado + videografía) ya están en el
        // DOM en este punto — pintamos de una vez el estado de "me gusta"
        // ya conocido (si el caché de interactions.js ya se cargó antes
        // de que termináramos de renderizar) y quedará correcto también
        // si se carga después, porque inicializarLikesEnTarjetas() vuelve
        // a pintar todo el DOM en cuanto resuelve la sesión.
        aplicarEstadoDeLikesEnDOM();
 
        inicializarInteracciones(artistaId);
        inicializarReproductorFlotante(artistaId, data, avatarUrl);
 
    } catch (error) {
        mostrarError();
    }
}
 
function inicializarInteracciones(artistaId) {
    const btnSeguir = document.getElementById('btn-seguir');
    const contadorSeguidores = document.getElementById('contador-seguidores');
 
    if (!auth) return;
 
    // El estado de "me gusta" (detección inicial + pintado de las
    // tarjetas) ahora lo maneja services/interactions.js de forma
    // centralizada — ver inicializarLikesEnTarjetas() más abajo, llamada
    // una sola vez desde cargarPerfil(). Aquí solo queda la lógica de
    // "Seguir", que es propia de esta página.
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const siguiendo = await esSeguidor(user.uid, artistaId);
                actualizarEstiloBotonSeguir(siguiendo, btnSeguir);
            } catch (error) {
                console.error("Error al cargar estado de seguimiento:", error);
            }
        }
    });
 
    btnSeguir.addEventListener('click', async () => {
        try {
            const user = auth.currentUser;
            if (!user) return mostrarToast("Debes iniciar sesión para seguir a este artista.", 'warn');
 
            btnSeguir.disabled = true;
            const res = await toggleSeguirArtista(user.uid, artistaId);
 
            if (res && res.exito) {
                actualizarEstiloBotonSeguir(res.siguiendo, btnSeguir);
                let actual = parseInt(contadorSeguidores.textContent) || 0;
                contadorSeguidores.textContent = res.siguiendo ? actual + 1 : Math.max(0, actual - 1);
            }
        } catch (error) {
            mostrarToast("Ocurrió un error al intentar seguir al artista.", 'error');
        } finally {
            btnSeguir.disabled = false;
        }
    });
 
    // El clic en '.btn-like' (toggle en Firestore, marcado visual del
    // botón y sincronización con el reproductor flotante) lo maneja
    // inicializarLikesEnTarjetas() de forma centralizada — no se registra
    // ningún listener propio aquí para evitar un doble toggle por clic.
    //
    // Lo único específico de esta página es el contador agregado "Me
    // gusta" del perfil (suma de likes de TODOS los temas, mostrado junto
    // a Seguidores/Temas en la cabecera) — para eso escuchamos el evento
    // que emite el servicio central en cada toggle exitoso, filtrando
    // solo los que correspondan a una canción de ESTE perfil (para no
    // sumar/restar si el usuario da like a algo ajeno mientras esta
    // página sigue abierta, ej. desde la cola del reproductor flotante).
    document.addEventListener('gg:like-actualizado', (e) => {
        const { cancionId, liked } = e.detail || {};
        if (!cancionId || !cancionId.startsWith(`${artistaId}_`)) return;

        const elTotalLikes = document.getElementById('contador-likes-total');
        if (!elTotalLikes) return;

        const totalActual = parseInt(elTotalLikes.textContent) || 0;
        elTotalLikes.textContent = liked ? totalActual + 1 : Math.max(0, totalActual - 1);
    });
}
 
// ==========================================
// REPRODUCTOR FLOTANTE (Destacado + Más Videos)
// ==========================================
// Tanto el Tema Destacado como las tarjetas de "Más Videos"
// (álbumes/EPs y Sencillos) usan miniaturas clicables (.btn-flotante)
// que abren el reproductor flotante persistente — igual patrón que
// canciones.js. Ya no hay ningún <iframe> de YouTube incrustado
// directamente en la página.
function inicializarReproductorFlotante(artistaId, data, avatarUrl) {
    const gridVideos = document.getElementById('grid-mas-videos');
    const btnDestacado = document.getElementById('btn-flotante-destacado');

    // Cola con TODOS los temas del artista que tengan URL válida,
    // incluido el destacado (data.temas ya lo contiene si el usuario lo
    // marcó como tema), para que Siguiente/Anterior recorra la
    // videografía completa del perfil sin importar desde qué tarjeta
    // se empezó a reproducir.
    const colaCompleta = (Array.isArray(data.temas) ? data.temas : [])
        .map(tema => {
            const vId = obtenerIdYouTube(tema.url);
            if (!vId) return null;
            return {
                videoId: vId,
                cancionId: `${artistaId}_${vId}`,
                perfilId: artistaId,
                paginaPerfil: 'artista.html',
                titulo: tema.nombre || 'Sin título',
                subtitulo: data.nombre || 'Artista',
                fotoUrl: avatarUrl,
                likesCount: tema.likesCount || 0,
                meGusta: tieneLikeLocal(`${artistaId}_${vId}`)
            };
        })
        .filter(Boolean);

    function manejarClicBtnFlotante(btn) {
        const cancionId = btn.dataset.cancionId;
        const indice = colaCompleta.findIndex(item => item.cancionId === cancionId);

        if (indice >= 0) {
            establecerCola(colaCompleta, indice);
            reproducirEnFlotante(colaCompleta[indice]);
        } else {
            // Respaldo por si el tema no aparece en la cola (dato
            // incompleto): se reproduce igual con lo que trae el botón.
            reproducirEnFlotante({
                videoId: btn.dataset.videoId,
                cancionId,
                perfilId: btn.dataset.perfilId || artistaId,
                paginaPerfil: btn.dataset.paginaPerfil || 'artista.html',
                titulo: btn.dataset.titulo,
                subtitulo: btn.dataset.subtitulo,
                fotoUrl: btn.dataset.foto,
                likesCount: parseInt(btn.dataset.likes, 10) || 0,
                meGusta: tieneLikeLocal(cancionId)
            });
        }
    }

    if (gridVideos) {
        gridVideos.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-flotante');
            if (btn) manejarClicBtnFlotante(btn);
        });
    }

    if (btnDestacado && btnDestacado.dataset.cancionId) {
        btnDestacado.addEventListener('click', () => manejarClicBtnFlotante(btnDestacado));
    }

    // Reanuda automáticamente si el usuario venía de otra página con
    // el reproductor activo (ej. llegó a este perfil desde el botón
    // "Ver perfil" del propio widget flotante).
    reanudarReproduccionAutomatica();
}

function actualizarEstiloBotonSeguir(siguiendo, btn) {
    if (siguiendo) {
        btn.innerHTML = `
            <svg class="w-4 h-4 fill-indigo-400 group-hover:hidden transition-transform" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <svg class="w-4 h-4 hidden group-hover:block text-rose-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            <span class="group-hover:hidden text-indigo-400">Siguiendo</span>
            <span class="hidden group-hover:inline text-rose-400">Dejar de Seguir</span>
        `;
        btn.className = "group relative inline-flex items-center justify-center gap-2 px-6 py-2 rounded-full text-sm font-semibold transition-all duration-300 ease-out border backdrop-blur-md shadow-lg bg-indigo-500/10 border-indigo-500/30 hover:bg-rose-500/15 hover:border-rose-500/40 hover:shadow-rose-500/10 hover:scale-[1.02] active:scale-95";
    } else {
        btn.innerHTML = `Seguir`;
        btn.className = "px-6 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 transition-all duration-300 hover:scale-[1.02] active:scale-95";
    }
}
 
function mostrarError() {
    cargando.classList.add('hidden');
    errorDiv.classList.remove('hidden');
}

let toastTimeoutId = null;

function mostrarToast(mensaje, tipo = 'info') {
    const toast = document.getElementById('toast');
    const toastMensaje = document.getElementById('toast-mensaje');
    if (!toast || !toastMensaje) return;

    // Configuración de tonos (rojo carmesí #8d001c para warn/error)
    const estilosPorTipo = {
        info:  { clase: 'bg-indigo-600', icono: '' },
        warn:  { clase: 'bg-[#8d001c]',   icono: '🔔 ' },
        error: { clase: 'bg-[#DC143C]',   icono: '⚠️ ' }
    };
    const { clase, icono } = estilosPorTipo[tipo] || estilosPorTipo.info;

    // Limpiar clases de fondo previas para evitar solapamientos
    toast.classList.remove('bg-indigo-600', 'bg-amber-500', 'bg-red-600', 'bg-[#DC143C]');
    toast.classList.add(clase);
    
    toastMensaje.textContent = `${icono}${mensaje}`;

    // Mostrar elemento y permitir interacciones si fuera necesario
    toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
    toast.classList.add('translate-y-0', 'opacity-100');

    // Ocultar limpiando explícitamente las clases de visibilidad
    clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
    }, 2500);
}

document.getElementById('btn-compartir').addEventListener('click', () => {
    if (navigator.share) {
        navigator.share({ title: document.title, url: window.location.href }).catch(console.error);
    } else {
        navigator.clipboard.writeText(window.location.href);
        mostrarToast('¡Enlace copiado!');
    }
});

inicializarLikesEnTarjetas();
cargarPerfil();