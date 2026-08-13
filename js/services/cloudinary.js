// js/services/cloudinary.js

// Configuración de Cloudinary
const CLOUD_NAME = "zcd2h7xr"; 
const UPLOAD_PRESET = "ggmusic_preset"; 

/**
 * Subir una imagen directamente a Cloudinary
 * @param {File} archivoImagen - Archivo seleccionado desde un input tipo file
 * @returns {Promise<string>} URL pública de la imagen subida
 */
export async function subirImagenCloudinary(archivoImagen) {
    const formData = new FormData();
    formData.append('file', archivoImagen);
    formData.append('upload_preset', UPLOAD_PRESET);

    try {
        const respuesta = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData
        });

        if (!respuesta.ok) {
            throw new Error('Error al subir la imagen a Cloudinary');
        }

        const data = await respuesta.json();
        return data.secure_url; // Devolvemos la URL HTTPS de la foto lista para Firestore
    } catch (error) {
        console.error("Error Cloudinary:", error);
        throw error;
    }
}
