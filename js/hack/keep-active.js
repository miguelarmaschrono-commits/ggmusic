// 1. Sobrescribir las propiedades del DOM para simular que la app siempre está visible
Object.defineProperty(document, 'hidden', { value: false, writable: false });
Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: false });

// 2. Detener los eventos que le avisan al iFrame de YouTube que la pantalla se minimizó
window.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
window.addEventListener('blur', (e) => e.stopImmediatePropagation(), true);

// 3. Audio en silencio en bucle para forzar a Android a mantener el proceso de audio activo
const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
silentAudio.loop = true;

document.addEventListener('click', () => {
    silentAudio.play().catch(() => {});
}, { once: true });