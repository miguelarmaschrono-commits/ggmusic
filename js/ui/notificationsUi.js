import { solicitarPermisoNotificaciones } from '../services/notifications.js';

export function inicializarUINotificaciones(userId = null) {
    const banner = document.getElementById('banner-notificaciones');
    const btnActivarBanner = document.getElementById('btn-activar-banner-fcm');
    const btnCerrarBanner = document.getElementById('btn-cerrar-banner-fcm');
    
    const btnAjustes = document.getElementById('btn-notificaciones-ajustes');
    const txtEstadoAjustes = document.getElementById('txt-estado-fcm');

    // 1. Actualizar estado visual en el botón de ajustes
    actualizarEstadoBotonAjustes(txtEstadoAjustes);

    // 2. Control del Banner Flotante
    const fueDescartado = localStorage.getItem('fcm_banner_dismissed') === 'true';
    const permisoActual = "Notification" in window ? Notification.permission : "denied";

    // Solo mostrar el banner si no tiene permisos concedidos/denegados y no ha cerrado el banner manualmente
    if (permisoActual === 'default' && !fueDescartado && banner) {
        // Pequeño retardo de 3 segundos al cargar para no saturar al usuario inmediatamente
        setTimeout(() => {
            banner.classList.remove('hidden');
        }, 3000);
    }

    // Evento: Clic en 'Activar' desde el Banner
    if (btnActivarBanner) {
        btnActivarBanner.addEventListener('click', async () => {
            banner.classList.add('hidden');
            const exito = await solicitarPermisoNotificaciones(userId);
            actualizarEstadoBotonAjustes(txtEstadoAjustes);
            if (!exito) localStorage.setItem('fcm_banner_dismissed', 'true');
        });
    }

    // Evento: Clic en 'Ahora no' desde el Banner
    if (btnCerrarBanner) {
        btnCerrarBanner.addEventListener('click', () => {
            banner.classList.add('hidden');
            // Guardar preferencia para no insistir en la sesión actual
            localStorage.setItem('fcm_banner_dismissed', 'true');
        });
    }

    // Evento: Clic desde el botón de Ajustes
    if (btnAjustes) {
        btnAjustes.addEventListener('click', async () => {
            if (Notification.permission === 'granted') {
                alert('Las notificaciones ya están activadas en este navegador.');
                return;
            }
            if (Notification.permission === 'denied') {
                alert('Has bloqueado las notificaciones en tu navegador. Puedes reactivarlas desde el candado de la barra de direcciones de tu navegador.');
                return;
            }
            await solicitarPermisoNotificaciones(userId);
            actualizarEstadoBotonAjustes(txtEstadoAjustes);
        });
    }
}

function actualizarEstadoBotonAjustes(elementoTexto) {
    if (!elementoTexto || !("Notification" in window)) return;

    if (Notification.permission === 'granted') {
        elementoTexto.textContent = 'Activadas';
        elementoTexto.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold';
    } else if (Notification.permission === 'denied') {
        elementoTexto.textContent = 'Bloqueadas';
        elementoTexto.className = 'text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold';
    } else {
        elementoTexto.textContent = 'Desactivadas';
        elementoTexto.className = 'text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-400';
    }
}