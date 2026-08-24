// js/login.js
import { loginUsuario, esAdmin } from './services/auth.js'; 
import { db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const form = document.getElementById('form-login');
const alerta = document.getElementById('alerta-login');
const btnLogin = document.getElementById('btn-login');

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        btnLogin.disabled = true;
        btnLogin.textContent = "Verificando...";

        const email = document.getElementById('log-email').value;
        const password = document.getElementById('log-password').value;

        try {
            const res = await loginUsuario(email, password);

            if (res.exito) {
                alerta.className = "mb-4 p-3 rounded-lg text-sm text-center bg-green-500/20 text-green-400 border border-green-500/30";
                alerta.textContent = "¡Acceso concedido! Entrando...";
                alerta.classList.remove('hidden');
                
                // 1. Verificar si existe en la colección "admins"
                const checkAdmin = await esAdmin(res.user.uid);

                // 2. Obtener el rol general desde "usuarios"
                const docRef = doc(db, "usuarios", res.user.uid);
                const docSnap = await getDoc(docRef);
                
                let rolUsuario = 'oyente'; 
                if (docSnap.exists()) {
                    rolUsuario = docSnap.data().rol;
                }

                setTimeout(() => {
                    if (checkAdmin) {
                        window.location.href = 'admin.html';
                    } else {
                        if (rolUsuario === 'artista') {
                            window.location.href = 'dashboard.html';
                        } else if (rolUsuario === 'productor') {
                            window.location.href = 'dashboard-productor.html';
                        } else {
                            window.location.href = 'index.html'; 
                        }
                    }
                }, 1000);
                
            } else {
                throw new Error(res.mensaje);
            }
        } catch (error) {
            let mensajeError = "Error al iniciar sesión.";
            if (error.message.includes('auth/invalid-credential') || error.message.includes('auth/wrong-password')) {
                mensajeError = "Correo o contraseña incorrectos.";
            } else if (error.message.includes('auth/user-not-found')) {
                mensajeError = "No existe una cuenta con este correo.";
            }

            alerta.className = "mb-4 p-3 rounded-lg text-sm text-center bg-red-500/20 text-red-400 border border-red-500/30";
            alerta.textContent = mensajeError;
            alerta.classList.remove('hidden');
            
            btnLogin.disabled = false;
            btnLogin.textContent = "Entrar al Panel";
        }
    });
}

// Redirección al Instagram oficial en caso de usar el botón o ID de recupero
const btnOlvidePass = document.getElementById('btn-olvide-pass');
if (btnOlvidePass) {
    btnOlvidePass.addEventListener('click', (e) => {
        e.preventDefault();
        window.open('https://www.instagram.com/ggmusic_oficial?igsh=eTJiMXF1aWVhZ2Vu', '_blank', 'noopener,noreferrer');
    });
}