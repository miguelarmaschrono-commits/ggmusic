// js/services/db.js
import { db } from '../firebase-config.js';
import { 
    doc, 
    getDoc, 
    updateDoc, 
    setDoc, 
    collection, 
    getDocs,
    query, 
    where  
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// FUNCIONES PARA ARTISTAS
// ==========================================

// Obtener los datos del perfil desde la colección maestra
export async function obtenerPerfilArtista(uid) {
    try {
        const docRef = doc(db, "usuarios", uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { exito: true, datos: docSnap.data() };
        } else {
            return { exito: false, mensaje: "Perfil no encontrado" };
        }
    } catch (error) {
        return { exito: false, mensaje: error.message };
    }
}

// Actualizar los datos del perfil en la colección maestra
export async function actualizarPerfilArtista(uid, datosNuevos) {
    try {
        const docRef = doc(db, "usuarios", uid);
        await setDoc(docRef, datosNuevos, { merge: true });
        return { exito: true };
    } catch (error) {
        return { exito: false, mensaje: error.message };
    }
}

// ==========================================
// FUNCIONES PARA PRODUCTORES
// ==========================================

// Obtener los datos del perfil de un productor
export async function obtenerPerfilProductor(uid) {
    try {
        const docRef = doc(db, "usuarios", uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { exito: true, datos: docSnap.data() };
        } else {
            return { exito: false, mensaje: "Perfil no encontrado" };
        }
    } catch (error) {
        return { exito: false, mensaje: error.message };
    }
}

// Actualizar los datos del perfil de un productor
export async function actualizarPerfilProductor(uid, datosNuevos) {
    try {
        const docRef = doc(db, "usuarios", uid);
        await setDoc(docRef, datosNuevos, { merge: true });
        return { exito: true };
    } catch (error) {
        return { exito: false, mensaje: error.message };
    }
}

// ==========================================
// FUNCIONES PARA EL EXPLORADOR PÚBLICO
// ==========================================

// Obtener TODOS los artistas activos (para el feed de explorar.html / index.html)
// Filtra client-side los perfiles suspendidos por un admin — mismo enfoque
// de filtrado client-side que ya usa el resto del explorador (explorar.js).
export async function obtenerTodosLosArtistas() {
    try {
        const q = query(collection(db, "usuarios"), where("rol", "==", "artista"));
        const querySnapshot = await getDocs(q);
        
        const lista = [];
        querySnapshot.forEach((doc) => {
            const datos = doc.data();
            if (datos.suspendido === true) return; // no se renderiza en paneles públicos
            lista.push({ id: doc.id, ...datos });
        });
        return { exito: true, datos: lista };
    } catch (error) {
        return { exito: false, mensaje: error.message };
    }
}

// Obtener todos los productores activos (para explorar-productores.html / index.html)
export async function obtenerTodosLosProductores() {
    try {
        const q = query(collection(db, "usuarios"), where("rol", "==", "productor"));
        const querySnapshot = await getDocs(q);
        const productores = [];
        
        querySnapshot.forEach((doc) => {
            const datos = doc.data();
            if (datos.suspendido === true) return; // no se renderiza en paneles públicos
            productores.push({ id: doc.id, ...datos });
        });
        
        return { exito: true, datos: productores };
    } catch (error) {
        console.error("Error al obtener productores:", error);
        return { exito: false, mensaje: "Error al cargar los productores." };
    }
}