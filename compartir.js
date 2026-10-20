// Compartir fotos y texto con el menú del sistema (WhatsApp, Instagram, correo…).
// Donde no lo hay (muchos ordenadores) se descargan las imágenes y se copia el texto.

const ICONO_COMPARTIR = '<svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

// "Taza celadón" → "taza-celadon"
function nombreDeArchivo(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "el-almacen";
}

// avisar: función para enseñar un mensaje corto en la página
async function compartir({ titulo, texto, imagenes = [], avisar = () => {} }) {
  const base = nombreDeArchivo(titulo);
  const archivos = imagenes.map((blob, i) => {
    const extension = blob.type === "image/png" ? "png" : "jpg";
    const sufijo = imagenes.length > 1 ? `-${i + 1}` : "";
    return new File([blob], `${base}${sufijo}.${extension}`, { type: blob.type || "image/jpeg" });
  });

  const datos = { title: titulo, text: texto, ...(archivos.length && { files: archivos }) };
  if (navigator.share && (!archivos.length || navigator.canShare?.(datos))) {
    try {
      await navigator.share(datos);
    } catch (e) {
      if (e.name !== "AbortError") avisar("No se ha podido compartir");
    }
    return;
  }

  // Sin menú de compartir: descargar las imágenes y copiar el texto
  for (const archivo of archivos) {
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(archivo);
    enlace.download = archivo.name;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 10000);
  }
  let copiado = false;
  try {
    await navigator.clipboard.writeText(texto);
    copiado = true;
  } catch {}
  avisar(archivos.length
    ? copiado ? "He descargado las imágenes y copiado el texto" : "He descargado las imágenes"
    : copiado ? "Texto copiado: pégalo donde quieras" : "Tu navegador no deja compartir");
}
