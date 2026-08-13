// ==========================================
// APP.JS - Inicialización de la vista principal
// ==========================================

// 1. Importamos la función directamente desde el servicio de base de datos
import { obtenerTodosLosArtistas } from './services/db.js';

document.addEventListener('DOMContentLoaded', async () => {
    const contenedorGrid = document.getElementById('gridArtistas');
    
    if (contenedorGrid) {
        try {
            // 2. Pedimos los datos a Firestore
            const respuesta = await obtenerTodosLosArtistas(); 
            
            // 3. Verificamos si la petición fue exitosa
            if (respuesta.exito) {
                // Le pasamos a render.js ÚNICAMENTE el arreglo "datos", no el objeto completo
                renderizarArtistas(respuesta.datos, 'gridArtistas'); 
            } else {
                // Si la BD devuelve un error, lo lanzamos para que caiga en el catch
                throw new Error(respuesta.mensaje); 
            }
            
        } catch (error) {
            console.error("Error al cargar la data de Firestore: ", error);
            contenedorGrid.innerHTML = `
                <div class="col-span-full text-center py-10">
                    <p class="text-red-500 mb-2">Hubo un error al cargar los artistas.</p>
                    <p class="text-gray-500 text-sm">Revisa la consola para más detalles.</p>
                </div>
            `;
        }
    }
});
