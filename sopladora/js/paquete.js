// Monta el índice RPTB (documento + fotos) antes de cifrar. No escribe ficheros.

export function numeroDiapositiva(nombre) {
  const m = String(nombre).match(/slide(\d{2})(?!\d)/i);
  return m ? m[1] : null;
}

export function montarIndice(doc, fotosPorDiapositiva) {
  const clon = JSON.parse(JSON.stringify(doc));
  const imagenes = {};
  const trozos = [];
  let offset = 0;
  for (const botella of clon.botellas) {
    const slide = numeroDiapositiva(botella.imagen || '');
    const foto = slide ? fotosPorDiapositiva.get(slide) : null;
    if (!foto) {
      const err = new Error(`Falta la foto de la diapositiva ${slide || '?'}.`);
      err.code = 'foto';
      throw err;
    }
    const bytes = foto.bytes instanceof Uint8Array ? foto.bytes : new Uint8Array(foto.bytes);
    let sha = foto.sha256;
    if (!sha) throw new Error('Foto sin sha256.');
    if (!imagenes[sha]) {
      imagenes[sha] = {
        offset,
        longitud: bytes.length,
        mime: foto.mime,
        ancho: foto.ancho || 0,
        alto: foto.alto || 0,
      };
      trozos.push(bytes);
      offset += bytes.length;
    }
    botella.imagen_sha256 = sha;
  }
  const blob = new Uint8Array(offset);
  let o = 0;
  for (const t of trozos) {
    blob.set(t, o);
    o += t.length;
  }
  return {
    indice: { tipo: 'sopladora', doc: clon, imagenes },
    blob,
  };
}

export function completarFormato(formato, doc) {
  const fichas = doc.botellas.reduce((n, b) => n + b.fichas.length, 0);
  return {
    ...formato,
    edicion: doc.meta?.edicion || '15',
    fecha_portada: doc.meta?.fecha_portada || '24/11/2026',
    fuentes: ['Ed. 15 · adjunto 26/11/2026'],
    recuentos: {
      botellas: doc.botellas.length,
      fichas,
      imagenes: doc.botellas.length,
    },
  };
}
