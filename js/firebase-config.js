// js/firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Credenciales de ggy-music
const firebaseConfig = {
    apiKey: "AIzaSyD-rskFuIGoF9KPXt3xvJQ1h32hHyFZQ-o",
    authDomain: "ggy-music.firebaseapp.com",
    projectId: "ggy-music",
    storageBucket: "ggy-music.firebasestorage.app",
    messagingSenderId: "1016536999603",
    appId: "1:1016536999603:web:3e8130bd1f0a2ff088b2c6",
    measurementId: "G-68TVZTS0ER"
};

// Inicialización de Firebase
const app = initializeApp(firebaseConfig);

// Exportación de los servicios activos (Auth y Firestore)
export const firebaseApp = app;
export const auth = getAuth(app);
export const db = getFirestore(app);
