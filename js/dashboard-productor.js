import { protegerRuta } from './ui/auth-guard.js';
import { obtenerPerfilProductor, actualizarPerfilProductor } from './services/db.js';
import { logoutProductor, eliminarCuentaPropia } from './services/auth.js';
import { subirImagenCloudinary } from './services/cloudinary.js';

let uidUsuarioActual = null;
let listaTemas = []; 
let MAX_TEMAS = 10; // valor por defecto hasta que carguen los datos reales del productor

const alerta = document.getElementById('alerta-dash');
const containerTemas = document.getElementById('lista-temas-container');
const btnAgregarTema = document.getElementById('btn-agregar-tema');
const msgLimite = document.getElementById('msg-limite-alcanzado');
const contadorTemas = document.getElementById('contador-temas');
const inputFoto = document.getElementById('input-cambiar-foto');
const textoBtnFoto = document.getElementById('texto-btn-foto');
const form = document.getElementById('form-dashboard');

// Normalizar Enlaces a Embed
function normalizarUrlYouTube(url) {
    if (!url) return '';
    url = url.trim();

    if (url.includes('youtube.com/embed/')) return url.split('?')[0];

    const regExpWatch = /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+)/;
    const matchWatch = url.match(regExpWatch);
    if (matchWatch && matchWatch[1]) return `https://www.youtube.com/embed/${matchWatch[1]}`;

    const regExpShort = /(?:youtu\.be\/)([a-zA-Z0-9_-]+)/;
    const matchShort = url.match(regExpShort);
    if (matchShort && matchShort[1]) return `https://www.youtube.com/embed/${matchShort[1]}`;

    const regExpShorts = /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/;
    const matchShorts = url.match(regExpShorts);
    if (matchShorts && matchShorts[1]) return `https://www.youtube.com/embed/${matchShorts[1]}`;

    return url;
}

// Renderizar Portafolio
function renderizarListaTemas() {
    containerTemas.innerHTML = '';
    containerTemas.className = "flex overflow-x-auto gap-4 pb-4 snap-x mb-4 scrollbar-thin scrollbar-thumb-gray-700";

    const opcionesGeneros = [
        'Multigénero', 'Musica Urbana', 'Rap / Hip-Hop', 'Trap / Drill', 
        'Reggaeton', 'Afrobeat', 'Pop / Rock', 'R&B'
    ];

    listaTemas.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = "w-[280px] md:w-[320px] shrink-0 snap-center bg-gray-900/60 border border-gray-700/80 p-4 rounded-xl space-y-3 relative group flex flex-col";

        card.innerHTML = `
            <div class="flex justify-between items-center mb-1">
                <span class="text-xs font-bold text-purple-400">Trabajo #${index + 1}</span>
                <button type="button" class="btn-eliminar-tema text-red-400 hover:text-red-300 text-xs font-semibold px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 transition" data-index="${index}">
                    🗑️ Eliminar
                </button>
            </div>

            <div class="space-y-3 flex-1">
                <div>
                    <label class="block text-[11px] text-gray-400 mb-1">URL de YouTube (Beat o Tema)</label>
                    <input type="url" class="input-url-tema w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-white focus:border-purple-500 focus:outline-none" placeholder="https://www.youtube.com/watch?v=..." value="${item.url || ''}" data-index="${index}">
                </div>
                <div>
                    <label class="block text-[11px] text-gray-400 mb-1">Nombre del Trabajo o Beat</label>
                    <input type="text" class="input-nombre-tema w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-white focus:border-purple-500 focus:outline-none" placeholder="Ej: Beat Trap Oscuro / Mezcla Canción X" value="${item.nombre || ''}" data-index="${index}">
                </div>
                <div>
                    <label class="block text-[11px] text-gray-400 mb-1">Lista / Álbum (Agrupación)</label>
                    <input type="text" class="input-lista-tema w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-white focus:border-purple-500 focus:outline-none" placeholder="Ej: Beats Vol.1, Sesiones 2026..." value="${item.lista || ''}" data-index="${index}">
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-[11px] text-gray-400 mb-1">Fecha de publicación</label>
                        <input type="date" style="color-scheme: dark;" class="input-fecha-tema w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-white focus:border-purple-500 focus:outline-none" value="${item.fecha || ''}" data-index="${index}">
                    </div>
                    <div class="relative contenedor-genero-tema" data-index="${index}">
                        <label class="block text-[11px] text-gray-400 mb-1">Estilo Musical</label>
                        <input type="hidden" class="input-genero-tema" value="${item.genero || ''}" data-index="${index}">
                        
                        <button type="button" class="btn-genero-tema w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-purple-500 transition text-left flex justify-between items-center" data-index="${index}">
                            <span class="texto-genero-tema">${item.genero || 'Selecciona...'}</span>
                            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </button>
                        
                        <ul class="lista-generos-tema hidden absolute bottom-full mb-1 z-50 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-2xl max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600">
                            ${opcionesGeneros.map(g => 
                                `<li class="px-4 py-2.5 text-xs text-gray-200 hover:bg-purple-600 hover:text-white cursor-pointer transition border-b border-gray-700" data-value="${g}">${g}</li>`
                            ).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        `;
        containerTemas.appendChild(card);
    });

    contadorTemas.textContent = `${listaTemas.length} / ${MAX_TEMAS} trabajos`;
    document.getElementById('stat-temas').textContent = listaTemas.length;

    if (listaTemas.length >= MAX_TEMAS) {
        btnAgregarTema.classList.add('hidden');
        msgLimite.classList.remove('hidden');
    } else {
        btnAgregarTema.classList.remove('hidden');
        msgLimite.classList.add('hidden');
    }

    // Listeners del portafolio
    containerTemas.querySelectorAll('.input-url-tema').forEach(input => {
        input.addEventListener('input', (e) => listaTemas[e.target.getAttribute('data-index')].url = e.target.value.trim());
    });
    containerTemas.querySelectorAll('.input-nombre-tema').forEach(input => {
        input.addEventListener('input', (e) => listaTemas[e.target.getAttribute('data-index')].nombre = e.target.value);
    });
    containerTemas.querySelectorAll('.input-fecha-tema').forEach(input => {
        input.addEventListener('input', (e) => listaTemas[e.target.getAttribute('data-index')].fecha = e.target.value);
    });
    containerTemas.querySelectorAll('.input-lista-tema').forEach(input => {
        input.addEventListener('input', (e) => listaTemas[e.target.getAttribute('data-index')].lista = e.target.value);
    });

    containerTemas.querySelectorAll('.btn-genero-tema').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = btn.getAttribute('data-index');
            const ul = containerTemas.querySelector(`.contenedor-genero-tema[data-index="${idx}"] .lista-generos-tema`);
            
            containerTemas.querySelectorAll('.lista-generos-tema').forEach(lista => {
                if (lista !== ul) lista.classList.add('hidden');
            });
            document.querySelectorAll('ul[id^="listaDash"]').forEach(ulMain => ulMain.classList.add('hidden'));

            ul.classList.toggle('hidden');
        });
    });

    containerTemas.querySelectorAll('.lista-generos-tema li').forEach(li => {
        li.addEventListener('click', (e) => {
            const valor = e.target.getAttribute('data-value');
            const contenedor = e.target.closest('.contenedor-genero-tema');
            const idx = contenedor.getAttribute('data-index');
            
            contenedor.querySelector('.texto-genero-tema').textContent = e.target.textContent;
            contenedor.querySelector('.input-genero-tema').value = valor;
            contenedor.querySelector('.lista-generos-tema').classList.add('hidden');
            
            listaTemas[idx].genero = valor;
        });
    });

    containerTemas.querySelectorAll('.btn-eliminar-tema').forEach(btn => {
        btn.addEventListener('click', (e) => {
            listaTemas.splice(parseInt(e.target.getAttribute('data-index'), 10), 1);
            renderizarListaTemas();
        });
    });
}

btnAgregarTema.addEventListener('click', () => {
    if (listaTemas.length < MAX_TEMAS) {
        listaTemas.push({ url: '', nombre: '', lista: '', fecha: '', genero: '', likesCount: 0 });
        renderizarListaTemas();
    }
});

// Configurar Selects Principales
function configurarSelectDash(idBoton, idLista, idTexto, idInputOculto) {
    const btn = document.getElementById(idBoton);
    const lista = document.getElementById(idLista);
    const texto = document.getElementById(idTexto);
    const input = document.getElementById(idInputOculto);

    if(!btn || !lista) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('ul[id^="listaDash"]').forEach(ul => {
            if (ul.id !== idLista) ul.classList.add('hidden');
        });
        document.querySelectorAll('.lista-generos-tema').forEach(ul => ul.classList.add('hidden'));
        lista.classList.toggle('hidden');
    });

    lista.querySelectorAll('li[data-value]').forEach(opcion => {
        opcion.addEventListener('click', (e) => {
            texto.textContent = e.target.textContent;
            input.value = e.target.getAttribute('data-value');
            lista.classList.add('hidden');
        });
    });
}

function setSelectValue(idLista, idTexto, idInput, valor) {
    if (!valor) return;
    const opcion = document.getElementById(idLista).querySelector(`li[data-value="${valor}"]`);
    if (opcion) {
        document.getElementById(idTexto).textContent = opcion.textContent;
        document.getElementById(idInput).value = valor;
    }
}

configurarSelectDash('btnDashZona', 'listaDashZonas', 'textoDashZona', 'dash-zona');
configurarSelectDash('btnDashEspecialidad', 'listaDashEspecialidades', 'textoDashEspecialidad', 'dash-especialidad');
configurarSelectDash('btnDashGenero', 'listaDashGeneros', 'textoDashGenero', 'dash-genero');

document.addEventListener('click', () => {
    document.querySelectorAll('ul[id^="listaDash"]').forEach(ul => ul.classList.add('hidden'));
    document.querySelectorAll('.lista-generos-tema').forEach(ul => ul.classList.add('hidden'));
});

// 1. Cargar Datos y Proteger Ruta (Rol 'productor')
protegerRuta(async (user) => {
    uidUsuarioActual = user.uid;
    document.getElementById('email-header').textContent = user.email;
    
    const res = await obtenerPerfilProductor(user.uid);
    if (res.exito) {
        const data = res.datos;
        
        document.getElementById('nombre-header').textContent = data.nombre || 'Nuevo Productor';
        document.getElementById('zona-header').textContent = data.zona ? `📍 ${data.zona}` : 'Zona no definida';
        document.getElementById('stat-seguidores').textContent = data.seguidoresCount || 0;

        const badgeVerificado = document.getElementById('badge-verificado');
        if (badgeVerificado) {
            if (data.verificado === true) {
                badgeVerificado.textContent = 'Productor Verificado';
                badgeVerificado.className = "bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-semibold px-2.5 py-0.5 rounded-full";
            } else {
                badgeVerificado.textContent = 'Verificación Pendiente';
                badgeVerificado.className = "bg-gray-500/10 text-gray-400 border border-gray-500/20 text-[10px] font-semibold px-2.5 py-0.5 rounded-full";
            }
        }
        if (data.fotoUrl) document.getElementById('avatar-preview').src = data.fotoUrl;

        document.getElementById('dash-nombre').value = data.nombre || '';
        setSelectValue('listaDashZonas', 'textoDashZona', 'dash-zona', data.zona);
        setSelectValue('listaDashEspecialidades', 'textoDashEspecialidad', 'dash-especialidad', data.especialidad);
        setSelectValue('listaDashGeneros', 'textoDashGenero', 'dash-genero', data.genero);
        document.getElementById('dash-daw').value = data.daw || '';
        document.getElementById('dash-servicios').value = data.servicios || '';

        // Límite real del productor 
        if (typeof data.limiteCanciones === 'number') {
            MAX_TEMAS = data.limiteCanciones;
        }
        
        if (data.redesSociales) {
            document.getElementById('red-instagram').value = data.redesSociales.instagram || '';
            document.getElementById('red-tiktok').value = data.redesSociales.tiktok || '';
            document.getElementById('red-spotify').value = data.redesSociales.spotify || ''; 
            document.getElementById('red-youtube').value = data.redesSociales.youtube || '';
            document.getElementById('red-whatsapp').value = data.redesSociales.whatsapp || '';
        }
        
        // =========================================================
        // NUEVO: CONFIGURAR BOTÓN DE WHATSAPP CON EL NOMBRE
        // =========================================================
        const btnWhatsapp = document.getElementById('btn-whatsapp-limite');
        if (btnWhatsapp) {
            // Sacamos el nombre o usamos uno por defecto si está vacío
            const nombreUsuario = data.nombre || 'un usuario';
            
            // Creamos el mensaje concatenando el nombre
            const mensajeWa = `Hola, soy ${nombreUsuario}. He alcanzado el límite en mi perfil de GGmusic y quisiera información para expandir el catálogo.`;
            
            // encodeURIComponent transforma los espacios y caracteres especiales en formato URL (%20, etc.)
            const urlSegura = `https://wa.me/584129315220?text=${encodeURIComponent(mensajeWa)}`;
            
            // Le asignamos la URL terminada al botón
            btnWhatsapp.href = urlSegura;
        }
        // =========================================================

        // Se conserva likesCount aunque hoy el perfil de productor no
        // muestre botón de like en su UI pública: interactions.js ya es
        // agnóstico de rol (toggleLikeCancion opera sobre cualquier
        // usuarios/{id} con array "temas"), así que si en el futuro se
        // habilita, no habrá una migración sorpresa que perder.
        if (Array.isArray(data.temas) && data.temas.length > 0) {
            listaTemas = data.temas.map(t => ({
                url: t.url || '', nombre: t.nombre || t.descripcion || '', lista: t.lista || '', fecha: t.fecha || '', genero: t.genero || '',
                likesCount: t.likesCount || 0
            }));
        } else if (data.temaDestacado) {
            listaTemas = [{ url: data.temaDestacado, nombre: 'Trabajo Destacado', lista: '', fecha: '', genero: '', likesCount: 0 }];
        } else {
            listaTemas = [];
        }
        renderizarListaTemas();

        if (data.biografia) {
            const inputBio = document.getElementById('dash-biografia');
            inputBio.value = data.biografia || '';
            document.getElementById('contador-bio').textContent = inputBio.value.length;
        }
    }
}, 'productor');

// 2. Cambiar Foto
inputFoto.addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo || !uidUsuarioActual) return;

    try {
        textoBtnFoto.textContent = "Subiendo...";
        inputFoto.disabled = true;

        const nuevaFotoUrl = await subirImagenCloudinary(archivo);
        const res = await actualizarPerfilProductor(uidUsuarioActual, { fotoUrl: nuevaFotoUrl });

        if (res.exito) {
            document.getElementById('avatar-preview').src = nuevaFotoUrl;
            alerta.className = "mb-6 p-3 rounded-lg text-sm text-center bg-green-500/20 text-green-400 border border-green-500/30";
            alerta.textContent = "¡Logotipo de estudio actualizado!";
            alerta.classList.remove('hidden');
            setTimeout(() => alerta.classList.add('hidden'), 3000);
        } else {
            throw new Error(res.mensaje);
        }
    } catch (error) {
        alerta.className = "mb-6 p-3 rounded-lg text-sm text-center bg-red-500/20 text-red-400 border border-red-500/30";
        alerta.textContent = "Error al subir la imagen: " + error.message;
        alerta.classList.remove('hidden');
    } finally {
        textoBtnFoto.textContent = "📷 Cambiar";
        inputFoto.disabled = false;
        inputFoto.value = '';
    }
});

// 3. Guardar Formulario
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const zonaElegida = document.getElementById('dash-zona').value;
    const especialidadElegida = document.getElementById('dash-especialidad').value;
    const generoElegido = document.getElementById('dash-genero').value;

    if (!zonaElegida || !especialidadElegida) {
        alerta.className = "mb-6 p-3 rounded-lg text-sm text-center bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
        alerta.textContent = "Por favor, selecciona tu Zona y tu Especialidad Principal.";
        alerta.classList.remove('hidden');
        return;
    }

    const temasFiltrados = listaTemas
        .filter(t => t.url && t.url.trim() !== '')
        .map(t => ({
            url: normalizarUrlYouTube(t.url),
            nombre: t.nombre || '',
            lista: t.lista || '',
            fecha: t.fecha || '',
            genero: t.genero || '',
            likesCount: t.likesCount || 0
        }));

    const nuevosDatos = {
        nombre: document.getElementById('dash-nombre').value,
        especialidad: especialidadElegida,
        genero: generoElegido,
        zona: zonaElegida,
        daw: document.getElementById('dash-daw').value.trim(),
        servicios: document.getElementById('dash-servicios').value.trim(),
        redesSociales: {
            instagram: document.getElementById('red-instagram').value.trim(),
            tiktok: document.getElementById('red-tiktok').value.trim(),
            spotify: document.getElementById('red-spotify').value.trim(),
            youtube: document.getElementById('red-youtube').value.trim(),
            whatsapp: document.getElementById('red-whatsapp').value.trim()
        },
        temas: temasFiltrados,
        temaDestacado: temasFiltrados.length > 0 ? temasFiltrados[0].url : '',
        biografia: document.getElementById('dash-biografia').value.trim()
    };

    const res = await actualizarPerfilProductor(uidUsuarioActual, nuevosDatos);

    if (res.exito) {
        listaTemas = temasFiltrados;
        renderizarListaTemas();

        alerta.className = "mb-6 p-3 rounded-lg text-sm text-center bg-green-500/20 text-green-400 border border-green-500/30";
        alerta.textContent = "¡Perfil de estudio actualizado con éxito!";
        alerta.classList.remove('hidden');
        
        document.getElementById('nombre-header').textContent = nuevosDatos.nombre;
        document.getElementById('zona-header').textContent = `📍 ${nuevosDatos.zona}`;
        
        setTimeout(() => alerta.classList.add('hidden'), 3000);
    } else {
        alerta.className = "mb-6 p-3 rounded-lg text-sm text-center bg-red-500/20 text-red-400 border border-red-500/30";
        alerta.textContent = "Error al actualizar: " + res.mensaje;
        alerta.classList.remove('hidden');
    }
});

// Contador Biografía
const inputBiografia = document.getElementById('dash-biografia');
const contadorBio = document.getElementById('contador-bio');

if (inputBiografia && contadorBio) {
    inputBiografia.addEventListener('input', (e) => contadorBio.textContent = e.target.value.length);
}

// 4. Cerrar Sesión
document.getElementById('btn-logout').addEventListener('click', async () => {
    await logoutProductor();
    window.location.href = 'login.html';
});

// =======================================================
// 5. ELIMINAR CUENTA (ZONA DE PELIGRO)
// =======================================================
const btnMostrarEliminar = document.getElementById('btn-mostrar-eliminar');
const panelEliminarCuenta = document.getElementById('panel-eliminar-cuenta');
const btnCancelarEliminar = document.getElementById('btn-cancelar-eliminar');
const btnConfirmarEliminar = document.getElementById('btn-confirmar-eliminar');
const inputPasswordEliminar = document.getElementById('input-password-eliminar');

if (btnMostrarEliminar && panelEliminarCuenta) {
    btnMostrarEliminar.addEventListener('click', () => {
        panelEliminarCuenta.classList.remove('hidden');
        btnMostrarEliminar.classList.add('hidden');
        inputPasswordEliminar.focus();
    });
}

if (btnCancelarEliminar) {
    btnCancelarEliminar.addEventListener('click', () => {
        panelEliminarCuenta.classList.add('hidden');
        btnMostrarEliminar.classList.remove('hidden');
        inputPasswordEliminar.value = '';
        alerta.classList.add('hidden');
    });
}

if (btnConfirmarEliminar) {
    btnConfirmarEliminar.addEventListener('click', async () => {
        const password = inputPasswordEliminar.value;

        if (!password) {
            alerta.className = "mb-6 p-3 rounded-lg text-sm text-center bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
            alerta.textContent = "Ingresa tu contraseña para confirmar.";
            alerta.classList.remove('hidden');
            return;
        }

        if (!confirm("Esta acción es irreversible. ¿Seguro que deseas eliminar tu cuenta de GGmusic?")) {
            return;
        }

        btnConfirmarEliminar.disabled = true;
        btnCancelarEliminar.disabled = true;
        btnConfirmarEliminar.textContent = "Eliminando...";

        const res = await eliminarCuentaPropia(password);

        if (res.exito) {
            window.location.href = 'index.html';
        } else {
            btnConfirmarEliminar.disabled = false;
            btnCancelarEliminar.disabled = false;
            btnConfirmarEliminar.textContent = "Sí, eliminar mi cuenta";

            alerta.className = "mb-6 p-3 rounded-lg text-sm text-center bg-red-500/20 text-red-400 border border-red-500/30";
            alerta.textContent = res.mensaje || "No se pudo eliminar la cuenta. Inténtalo de nuevo.";
            alerta.classList.remove('hidden');
        }
    });
}