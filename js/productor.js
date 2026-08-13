// ==========================================
// PRODUCTOR.JS - Lógica del Perfil Público
// ==========================================
// NOTA DE CONSOLIDACIÓN: configurarMenuSesion() ya no vive duplicada aquí.
// Se importa desde ./ui/session-nav.js, la misma fuente única que ya usan
// explorar.js, explorar-productores.js e index.js.

import { db, auth } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { toggleSeguirArtista, esSeguidor } from './services/interactions.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Obtener el ID del productor desde la URL (Ej: productor.html?id=12345)
    const urlParams = new URLSearchParams(window.location.search);
    const idProductor = urlParams.get('id');

    if (!idProductor) {
        mostrarPantallaError("No se especificó ningún productor para mostrar.");
        return;
    }

    // 2. Consultar a Firebase y pintar los datos
    await cargarPerfilProductor(idProductor);
});

async function cargarPerfilProductor(id) {
    try {
        const docRef = doc(db, "usuarios", id);
        const docSnap = await getDoc(docRef);

        // Verificamos que exista y que realmente sea un productor
        if (docSnap.exists() && docSnap.data().rol === 'productor') {
            renderizarDatos(docSnap.data(), id);
        } else {
            mostrarPantallaError("Productor no encontrado o no disponible.");
        }
    } catch (error) {
        console.error("Error al obtener datos del productor:", error);
        mostrarPantallaError("Hubo un error de conexión al cargar el perfil.");
    }
}

function renderizarDatos(data, productorId) {
    // Para inyectar texto de forma segura (evitando inyección de código) usamos textContent
    document.getElementById('productor-nombre').textContent = data.nombre || 'Productor Desconocido';
    document.getElementById('productor-zona').textContent = data.zona || 'Guarenas / Guatire';
    document.getElementById('productor-especialidad').textContent = data.especialidad || 'Producción Musical';
    document.getElementById('productor-bio').textContent = data.biografia || 'Este productor aún no ha redactado su biografía.';
    document.getElementById('contador-seguidores').textContent = data.seguidoresCount || 0;

    // El badge solo aparece si un admin marcó verificado:true en Firestore
    const badgeVerificado = document.getElementById('badge-verificado');
    if (badgeVerificado && data.verificado === true) {
        badgeVerificado.classList.remove('hidden');
    }

    // Campo DAW en el perfil
    const dawElem = document.getElementById('productor-daw');
    if (dawElem) {
        dawElem.textContent = data.daw || 'No especificado';
    }

    // Foto de perfil y background difuminado
    const fotoElem = document.getElementById('productor-foto');
    const heroBgElem = document.getElementById('productor-hero-bg');
    
    let avatarUrl = '';
    
    if (data.fotoUrl) {
        avatarUrl = escapeUrl(data.fotoUrl);
    } else {
        // Fallback al avatar esmeralda si no tiene foto
        avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.nombre || 'Productor')}&background=10b981&color=fff&size=150`;
    }

    // Asignar imagen al elemento <img> del perfil
    fotoElem.src = avatarUrl;

    // Asignar la misma imagen al fondo del banner para el efecto difuminado
    if (heroBgElem) {
        heroBgElem.style.backgroundImage = `url('${avatarUrl}')`;
    }
    
    // Trabajos del portafolio
    const trabajos = Array.isArray(data.temas) && data.temas.length > 0
        ? data.temas
        : (data.temaDestacado ? [{ url: data.temaDestacado, nombre: 'Trabajo Destacado' }] : []);

    // Conteo de trabajos en el header del perfil y junto al encabezado del portafolio
    const contadorHeader = document.getElementById('productor-trabajos-count');
    if (contadorHeader) {
        contadorHeader.textContent = `${trabajos.length} ${trabajos.length === 1 ? 'Trabajo' : 'Trabajos'}`;
    }
    const badgePortafolio = document.getElementById('badge-total-trabajos');
    if (badgePortafolio) {
        badgePortafolio.textContent = `${trabajos.length} ${trabajos.length === 1 ? 'trabajo' : 'trabajos'}`;
    }

    // Redes Sociales
    if (data.redesSociales) {
        const redes = data.redesSociales;
        const mapaBotones = [
            { id: 'btn-instagram', url: redes.instagram },
            { id: 'btn-tiktok', url: redes.tiktok },
            { id: 'btn-beats', url: redes.spotify },   // BeatStars / SoundCloud
            { id: 'btn-youtube', url: redes.youtube },
            { id: 'btn-whatsapp', url: formatearWa(redes.whatsapp) }
        ];

        mapaBotones.forEach(({ id, url }) => {
            const btn = document.getElementById(id);
            if (btn && url && url.trim() !== '' && url !== '#') {
                btn.href = escapeUrl(url.trim());
                btn.classList.remove('hidden');
            }
        });
    }

    // Portafolio / Beats
    renderizarPortafolio(trabajos);

    // Servicios Ofrecidos
    renderizarServicios(data.servicios);

    // Seguir
    inicializarSeguimiento(productorId);
}

function renderizarServicios(serviciosTexto) {
    const contenedor = document.getElementById('productor-servicios');
    if (!contenedor) return;

    const lista = (serviciosTexto || '')
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    if (lista.length === 0) {
        contenedor.innerHTML = '<li class="text-gray-500">Este productor aún no ha especificado sus servicios.</li>';
        return;
    }

    contenedor.innerHTML = lista.map(servicio => `
        <li class="flex items-center gap-2"><i class="fas fa-check text-emerald-500"></i> ${escapeHTML(servicio)}</li>
    `).join('');
}

// ==========================================
// PORTAFOLIO (VIDEOS DE YOUTUBE)
// ==========================================

function obtenerIdYouTube(url) {
    if (!url) return null;

    let candidato = null;
    if (url.includes('embed/')) {
        candidato = url.split('embed/')[1].split('?')[0].split('&')[0];
    } else {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        candidato = match ? match[2] : null;
    }

    return (candidato && /^[a-zA-Z0-9_-]{11}$/.test(candidato)) ? candidato : null;
}

function formatearYoutubeEmbed(url) {
    const id = obtenerIdYouTube(url);
    return id ? `https://www.youtube.com/embed/${id}` : null;
}

/**
 * Construye el HTML de una sola tarjeta de trabajo/beat. Se usa tanto
 * dentro de un carrusel horizontal (agrupado por "lista") como en la
 * grilla normal para trabajos sueltos — la única diferencia entre ambos
 * contextos es el ancho de la tarjeta, así que se recibe como parámetro
 * en vez de duplicar el marcado dos veces.
 */
function construirTarjetaTrabajo(tema, dentroDeCarrusel) {
    const nombreSeguro = escapeHTML(tema.nombre || 'Trabajo sin título');
    const generoSeguro = escapeHTML(tema.genero || '');
    const fechaFormateada = tema.fecha ? escapeHTML(tema.fecha.split('-').reverse().join('/')) : '';
    const claseAncho = dentroDeCarrusel ? 'w-[280px] md:w-[320px] shrink-0 snap-center' : 'w-full';

    return `
        <div class="${claseAncho} bg-dark/60 rounded-xl overflow-hidden border border-gray-800 shadow-lg flex flex-col transition-transform hover:-translate-y-1">
            <div class="relative w-full pb-[56.25%] bg-black">
                <iframe class="absolute top-0 left-0 w-full h-full border-0" src="${tema.embedUrl}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
            <div class="p-4">
                <h4 class="text-sm font-bold text-white line-clamp-1">${nombreSeguro}</h4>
                ${(generoSeguro || fechaFormateada) ? `
                    <div class="text-xs text-gray-400 mt-1 flex items-center gap-1.5 font-medium">
                        ${generoSeguro ? `<span>${generoSeguro}</span>` : ''}
                        ${(generoSeguro && fechaFormateada) ? `<span class="text-gray-600">•</span>` : ''}
                        ${fechaFormateada ? `<span>${fechaFormateada}</span>` : ''}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Renderiza el portafolio del productor agrupando por el campo "lista"
 * (Álbum / Colección), igual que la videografía del artista en artista.js:
 * los trabajos que comparten un mismo nombre de lista se muestran juntos
 * en un carrusel horizontal con scroll-snap; los que no tienen agrupación
 * se muestran sueltos en una grilla normal debajo.
 */
function renderizarPortafolio(trabajos) {
    const contenedor = document.getElementById('productor-portafolio');
    if (!contenedor) return;

    const trabajosConVideo = (trabajos || [])
        .map(tema => ({ ...tema, embedUrl: formatearYoutubeEmbed(tema.url) }))
        .filter(tema => tema.embedUrl);

    if (trabajosConVideo.length === 0) {
        contenedor.className = "bg-dark/50 border border-gray-800 rounded-xl p-6 text-center text-gray-500";
        contenedor.textContent = 'Este productor aún no ha subido trabajos a su portafolio.';
        return;
    }

    const trabajosSinLista = trabajosConVideo.filter(t => !t.lista || t.lista.trim() === "");
    const trabajosConLista = trabajosConVideo.filter(t => t.lista && t.lista.trim() !== "");

    contenedor.className = "space-y-10";
    let html = '';

    // --- SECCIÓN 1: COLECCIONES / ÁLBUMES AGRUPADOS ---
    if (trabajosConLista.length > 0) {
        const gruposListas = {};
        trabajosConLista.forEach(tema => {
            const nombreLista = tema.lista.trim();
            if (!gruposListas[nombreLista]) gruposListas[nombreLista] = [];
            gruposListas[nombreLista].push(tema);
        });

        for (const [nombreLista, temasGrupo] of Object.entries(gruposListas)) {
            if (temasGrupo.length === 0) continue;

            html += `
                <div class="space-y-4">
                    <h3 class="text-lg font-bold text-white border-b border-gray-800 pb-2 flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500"></span>
                        ${escapeHTML(nombreLista)}
                    </h3>
                    <div class="flex overflow-x-auto gap-6 pb-6 snap-x scrollbar-thin scrollbar-thumb-gray-700">
                        ${temasGrupo.map(tema => construirTarjetaTrabajo(tema, true)).join('')}
                    </div>
                </div>
            `;
        }
    }

    // --- SECCIÓN 2: TRABAJOS SUELTOS (SIN AGRUPACIÓN) ---
    if (trabajosSinLista.length > 0) {
        html += `
            <div class="space-y-4">
                <h3 class="text-lg font-bold text-white border-b border-gray-800 pb-2 flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500"></span>
                    Trabajos Individuales
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    ${trabajosSinLista.map(tema => construirTarjetaTrabajo(tema, false)).join('')}
                </div>
            </div>
        `;
    }

    contenedor.innerHTML = html;
}

// ==========================================
// SEGUIR (SEGUIMIENTO DE PRODUCTOR)
// ==========================================

function inicializarSeguimiento(productorId) {
    const btnSeguir = document.getElementById('btn-seguir');
    const contadorSeguidores = document.getElementById('contador-seguidores');
    if (!btnSeguir) return;

    if (!auth) {
        console.error("🔥 Objeto 'auth' no encontrado. Revisa la importación de firebase-config.js");
        return;
    }

    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            actualizarEstiloBotonSeguir(false, btnSeguir);
            btnSeguir.classList.remove('hidden');
            return;
        }

        if (user.uid === productorId) {
            btnSeguir.classList.add('hidden');
            return;
        }

        btnSeguir.classList.remove('hidden');
        try {
            const siguiendo = await esSeguidor(user.uid, productorId);
            actualizarEstiloBotonSeguir(siguiendo, btnSeguir);
        } catch (error) {
            console.error("Error al verificar seguimiento:", error);
        }
    });

    btnSeguir.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return mostrarToast("Debes iniciar sesión para seguir a este productor.", 'warn');
        if (user.uid === productorId) return;

        btnSeguir.disabled = true;
        try {
            const res = await toggleSeguirArtista(user.uid, productorId);
            if (res && res.exito) {
                actualizarEstiloBotonSeguir(res.siguiendo, btnSeguir);
                const actual = parseInt(contadorSeguidores.textContent) || 0;
                contadorSeguidores.textContent = res.siguiendo ? actual + 1 : Math.max(0, actual - 1);
            }
        } catch (error) {
            console.error("Error al ejecutar toggleSeguirArtista:", error);
            mostrarToast("Ocurrió un error al intentar seguir al productor.", 'error');
        } finally {
            btnSeguir.disabled = false;
        }
    });
}

function actualizarEstiloBotonSeguir(siguiendo, btn) {
    if (siguiendo) {
        btn.innerHTML = `
            <svg class="w-4 h-4 fill-emerald-400 group-hover:hidden transition-transform" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <svg class="w-4 h-4 hidden group-hover:block text-rose-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            <span class="group-hover:hidden text-emerald-400">Siguiendo</span>
            <span class="hidden group-hover:inline text-rose-400">Dejar de Seguir</span>
        `;
        btn.className = "group relative inline-flex items-center justify-center gap-2 px-6 py-2 rounded-full text-sm font-semibold transition-all duration-300 ease-out border backdrop-blur-md shadow-lg bg-emerald-500/10 border-emerald-500/30 hover:bg-rose-500/15 hover:border-rose-500/40 hover:shadow-rose-500/10 hover:scale-[1.02] active:scale-95";
    } else {
        btn.innerHTML = `Seguir`;
        btn.className = "px-6 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/30 transition-all duration-300 hover:scale-[1.02] active:scale-95";
    }
}

function mostrarPantallaError(mensaje) {
    const main = document.querySelector('main');
    if (main) {
        main.innerHTML = `
            <div class="max-w-3xl mx-auto px-4 py-32 text-center">
                <span class="text-6xl block mb-6">🔌</span>
                <h2 class="text-3xl font-extrabold text-white mb-4">¡Oops!</h2>
                <p class="text-gray-400 mb-8 text-lg">${escapeHTML(mensaje)}</p>
                <a href="explorar-productores.html" class="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-medium transition shadow-lg shadow-emerald-500/20">
                    Volver a Productores
                </a>
            </div>
        `;
    }
}

// ==========================================
// UTILIDADES
// ==========================================

function formatearWa(wa) {
    if (!wa) return '';
    const valorLimpio = wa.trim();
    if (valorLimpio.startsWith('http://') || valorLimpio.startsWith('https://')) {
        return valorLimpio;
    }
    let numLimpio = valorLimpio.replace(/\D/g, '');
    if (numLimpio.startsWith('0')) {
        numLimpio = '58' + numLimpio.substring(1);
    }
    return numLimpio ? `https://wa.me/${numLimpio}` : '#';
}

function escapeHTML(texto) {
    if (!texto) return '';
    return String(texto).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
}

function escapeUrl(url) {
    try {
        const parsed = new URL(url, window.location.href);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return url;
        }
    } catch (e) {}
    return '#';
}

let toastTimeoutId = null;

function mostrarToast(mensaje, tipo = 'info') {
    const toast = document.getElementById('toast');
    const toastMensaje = document.getElementById('toast-mensaje');
    if (!toast || !toastMensaje) return;

    const estilosPorTipo = {
        info:  { clase: 'bg-emerald-600', icono: '' },
        warn:  { clase: 'bg-amber-500',   icono: '⚠️ ' },
        error: { clase: 'bg-red-600',     icono: '⚠️ ' }
    };
    const { clase, icono } = estilosPorTipo[tipo] || estilosPorTipo.info;

    toast.classList.remove('bg-emerald-600', 'bg-amber-500', 'bg-red-600');
    toast.classList.add(clase);
    toastMensaje.textContent = `${icono}${mensaje}`;

    toast.classList.remove('translate-y-20', 'opacity-0');

    clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 2500);
}

// ==========================================
// COMPARTIR PERFIL
// ==========================================

document.getElementById('btn-compartir')?.addEventListener('click', () => {
    if (navigator.share) {
        navigator.share({ title: document.title, url: window.location.href }).catch(console.error);
    } else {
        navigator.clipboard.writeText(window.location.href);
        mostrarToast('¡Enlace copiado!');
    }
});