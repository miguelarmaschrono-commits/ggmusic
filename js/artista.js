// ==========================================
// ARTISTA.JS - Lógica del perfil individual (artista.html)
// ==========================================
import { auth } from './firebase-config.js';
import { obtenerPerfilArtista } from './services/db.js';
import { toggleSeguirArtista, esSeguidor, toggleLikeCancion, obtenerMisLikes } from './services/interactions.js'; 

const cargando = document.getElementById('cargando-perfil');
const errorDiv = document.getElementById('error-perfil');
const contenido = document.getElementById('contenido-perfil');
 
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
        document.getElementById('artista-avatar').src = avatarUrl;
        document.getElementById('hero-bg').style.backgroundImage = `url('${avatarUrl}')`;
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
 
        // 3. Biografía
        if (data.biografia && data.biografia.trim() !== '') {
            document.getElementById('texto-biografia').textContent = `"${data.biografia}"`;
            document.getElementById('seccion-biografia').classList.remove('hidden');
        }
 
        // 4. Tema Destacado
        const embedUrl = formatearYoutubeUrl(data.temaDestacado);
        if (embedUrl) {
            document.getElementById('iframe-youtube').src = embedUrl;
            const videoId = obtenerIdYouTube(data.temaDestacado);
            const cancionIdDestacada = `${artistaId}_${videoId}`;
            document.getElementById('btn-like-destacado').dataset.cancionId = cancionIdDestacada;

            if (data.temas && data.temas.length > 0) {
                const temaEncontrado = data.temas.find(t => formatearYoutubeUrl(t.url) === embedUrl);
                if (temaEncontrado) {
                    document.getElementById('titulo-destacado').textContent = temaEncontrado.nombre || 'Tema sin título';

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

                                htmlVideos += `
                                    <div class="w-[280px] md:w-[320px] shrink-0 snap-center bg-slate-900/80 rounded-2xl overflow-hidden border border-slate-800 shadow-lg flex flex-col transition-transform hover:-translate-y-1 backdrop-blur-sm">
                                        <div class="relative w-full pb-[56.25%] bg-black">
                                            <iframe class="absolute top-0 left-0 w-full h-full border-0" src="${urlEmbedSec}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                                        </div>
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

                            htmlVideos += `
                                <div class="w-full bg-slate-900/80 rounded-2xl overflow-hidden border border-slate-800 shadow-lg flex flex-col transition-transform hover:-translate-y-1 backdrop-blur-sm">
                                    <div class="relative w-full pb-[56.25%] bg-black">
                                        <iframe class="absolute top-0 left-0 w-full h-full border-0" src="${urlEmbedSec}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                                    </div>
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
 
        inicializarInteracciones(artistaId);
 
    } catch (error) {
        mostrarError();
    }
}
 
function inicializarInteracciones(artistaId) {
    const btnSeguir = document.getElementById('btn-seguir');
    const contadorSeguidores = document.getElementById('contador-seguidores');
    const contenedorPrincipal = document.getElementById('contenido-perfil');
 
    if (!auth) return;
 
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const [siguiendo, misLikes] = await Promise.all([
                    esSeguidor(user.uid, artistaId),
                    obtenerMisLikes(user.uid)
                ]);
                actualizarEstiloBotonSeguir(siguiendo, btnSeguir);

                document.querySelectorAll('.btn-like').forEach(btn => {
                    const cancionId = btn.dataset.cancionId;
                    if (cancionId && misLikes.includes(cancionId)) {
                        marcarBotonLike(btn, true);
                    }
                });
            } catch (error) {
                console.error("Error al cargar estados de like/follow:", error);
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
 
    contenedorPrincipal.addEventListener('click', async (e) => {
        const btnLike = e.target.closest('.btn-like');
        if (!btnLike) return;
 
        try {
            const user = auth.currentUser;
            if (!user) return mostrarToast("Debes iniciar sesión para dar me gusta.", 'warn');
 
            btnLike.disabled = true;
            const cancionId = btnLike.dataset.cancionId;
 
            const res = await toggleLikeCancion(user.uid, cancionId);
 
            if (res && res.exito) {
                marcarBotonLike(btnLike, res.liked);
                const contadorLike = btnLike.querySelector('.count-likes');
                let actual = parseInt(contadorLike.textContent) || 0;
                contadorLike.textContent = res.liked ? actual + 1 : Math.max(0, actual - 1);

                // Mantener sincronizado el total del perfil (Seguidores • Temas • Me gusta)
                const elTotalLikes = document.getElementById('contador-likes-total');
                if (elTotalLikes) {
                    let totalActual = parseInt(elTotalLikes.textContent) || 0;
                    elTotalLikes.textContent = res.liked ? totalActual + 1 : Math.max(0, totalActual - 1);
                }
            } else {
                mostrarToast(res?.mensaje || "No se pudo procesar el like.", 'error');
            }
        } catch (error) {
            console.error("Error al ejecutar toggleLikeCancion:", error);
        } finally {
            btnLike.disabled = false;
        }
    });
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
 
function marcarBotonLike(btn, liked) {
    const icono = btn.querySelector('.icono-like');
    if (liked) {
        icono.classList.add('text-red-500', 'fill-current');
        icono.classList.remove('text-gray-400');
    } else {
        icono.classList.remove('text-red-500', 'fill-current');
        icono.classList.add('text-gray-400');
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

    const estilosPorTipo = {
        info:  { clase: 'bg-indigo-600', icono: '' },
        warn:  { clase: 'bg-amber-500',  icono: '⚠️ ' },
        error: { clase: 'bg-red-600',    icono: '⚠️ ' }
    };
    const { clase, icono } = estilosPorTipo[tipo] || estilosPorTipo.info;

    toast.classList.remove('bg-indigo-600', 'bg-amber-500', 'bg-red-600');
    toast.classList.add(clase);
    toastMensaje.textContent = `${icono}${mensaje}`;

    toast.classList.remove('translate-y-20', 'opacity-0');

    clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
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

cargarPerfil();