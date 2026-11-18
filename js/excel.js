// Libro .xlsx con la imagen Refresco 2026. Recibe ExcelJS (js/vendor/exceljs.min.js, empaquetado aquí, sin CDN).
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const NAVY = 'FF071A40';
const NARANJA = 'FFFF6633';
const GRIS = 'FFE0E0E0';
const HIELO = 'FFEAF6FB';
const FUENTE = 'Arial';

/**
 * hojas: [{ nombre, titulo, subtitulo, columnas: [[cabecera, ancho]], filas: [[texto…]] }]
 * Todas las celdas se escriben como texto (los códigos y EAN conservan los ceros a la izquierda).
 */
export async function libroXlsx(ExcelJS, { hojas, autor = 'Fichas Alcolea · Refresco Iberia', fecha = new Date() }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = autor;
  wb.lastModifiedBy = autor;
  wb.created = fecha;
  wb.modified = fecha;
  wb.title = hojas[0]?.titulo || 'Fichas Alcolea';
  wb.company = 'Refresco Iberia · Planta Alcolea';
  for (const h of hojas) {
    const nCol = h.columnas.length;
    const ws = wb.addWorksheet(h.nombre.slice(0, 31), {
      properties: { defaultRowHeight: 15 },
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '4:4' },
      views: [{ state: 'frozen', xSplit: 0, ySplit: 4, topLeftCell: 'A5', activeCell: 'A5', showGridLines: false }],
    });
    ws.columns = h.columnas.map(([, ancho]) => ({ width: ancho }));
    ws.mergeCells(1, 1, 1, nCol);
    ws.mergeCells(2, 1, 2, nCol);
    const t = ws.getCell(1, 1);
    t.value = h.titulo;
    t.font = { name: FUENTE, size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(1).height = 28;
    const s = ws.getCell(2, 1);
    s.value = h.subtitulo || '';
    s.font = { name: FUENTE, size: 9, italic: true, color: { argb: NAVY } };
    s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
    s.border = { bottom: { style: 'medium', color: { argb: NARANJA } } };
    ws.getRow(2).height = 30;
    const cab = ws.getRow(4);
    h.columnas.forEach(([texto], i) => {
      const c = cab.getCell(i + 1);
      c.value = texto;
      c.font = { name: FUENTE, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      c.border = { bottom: { style: 'thin', color: { argb: NARANJA } } };
    });
    cab.height = 20;
    h.filas.forEach((fila, j) => {
      const r = ws.getRow(5 + j);
      fila.forEach((v, i) => {
        const c = r.getCell(i + 1);
        c.value = v == null ? '' : String(v);
        c.numFmt = '@';
        c.font = { name: FUENTE, size: 10, color: { argb: NAVY } };
        c.alignment = { vertical: 'top', horizontal: 'left', wrapText: i === 5 };
        c.border = { bottom: { style: 'thin', color: { argb: GRIS } } };
        if (j % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HIELO } };
      });
    });
    if (h.filas.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + h.filas.length, column: nCol } };
  }
  return wb.xlsx.writeBuffer();
}
