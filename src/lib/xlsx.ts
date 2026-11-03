// SOLO SERVIDOR. Generación de libros Excel con formato institucional (exceljs).
import ExcelJS from 'exceljs';

const BRAND = { dark: 'FF1E1B2E', teal: 'FF0D9488', tealSoft: 'FFCCFBF1', violet: 'FF6D28D9', gray: 'FF64748B', line: 'FFE2E8F0', zebra: 'FFF8FAFC' };
const FONT = 'Calibri';
const TZ = 'America/Mexico_City';

// Excel no guarda zona horaria: se convierte la fecha a la hora local de la Ciudad de México.
export function excelDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second));
}

export type Col = { header: string; key: string; width: number; type?: 'date' | 'int' | 'hours' | 'pct' | 'stars' | 'text' };

export function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'UDL Support';
  wb.company = 'Universidad de Londres';
  wb.created = new Date();
  return wb;
}

// Encabezado de hoja: título, subtítulo y línea de color. Devuelve la siguiente fila libre.
function sheetHeader(ws: ExcelJS.Worksheet, title: string, subtitle: string, span: number) {
  ws.mergeCells(1, 1, 1, span);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: FONT, size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.dark } };
  t.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 34;
  ws.mergeCells(2, 1, 2, span);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: FONT, size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.teal } };
  s.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 20;
  return 4;
}

const generated = () => `Generado el ${new Date().toLocaleString('es-MX', { timeZone: TZ, dateStyle: 'long', timeStyle: 'short' })} · UDL Support`;

/**
 * Hoja de datos: tabla de Excel con estilo, botones de filtro en cada columna, filas alternadas,
 * encabezado fijo y formatos por tipo (fecha, horas, porcentaje, estrellas).
 */
export function addDataSheet(wb: ExcelJS.Workbook, opts: {
  name: string; title: string; cols: Col[]; rows: Record<string, unknown>[];
  tabColor?: string; highlight?: { key: string; color: (row: Record<string, unknown>) => string | null }[];
}) {
  const { name, title, cols, rows } = opts;
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: opts.tabColor ?? BRAND.teal } }, views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
  const start = sheetHeader(ws, title, `${rows.length} registros · ${generated()}`, cols.length);
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  const value = (c: Col, v: unknown) => {
    if (v === null || v === undefined || v === '') return null;
    if (c.type === 'date') return excelDate(String(v));
    if (c.type === 'stars') return '★'.repeat(Number(v)) + '☆'.repeat(5 - Number(v));
    return v;
  };
  const tableRows = rows.length ? rows.map((r) => cols.map((c) => value(c, r[c.key]))) : [cols.map(() => null)];
  ws.addTable({
    name: name.replace(/[^A-Za-z]/g, '') || 'Datos',
    ref: `A${start}`,
    headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: cols.map((c) => ({ name: c.header, filterButton: true })),
    rows: tableRows,
  });

  const header = ws.getRow(start);
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.dark } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.type === 'date') col.numFmt = 'dd/mm/yyyy hh:mm';
    if (c.type === 'int') col.numFmt = '#,##0';
    if (c.type === 'hours') col.numFmt = '#,##0.0" h"';
    if (c.type === 'pct') col.numFmt = '0%';
    if (c.type === 'stars') col.font = { name: FONT, color: { argb: 'FFD97706' }, size: 12 };
    col.alignment = { vertical: 'top', wrapText: c.type === 'text' };
  });
  // Colorea celdas concretas (p. ej. SLA vencido en rojo); el texto sigue indicando el estado.
  for (const h of opts.highlight ?? []) {
    const ci = cols.findIndex((c) => c.key === h.key) + 1;
    if (!ci) continue;
    rows.forEach((r, i) => {
      const color = h.color(r);
      if (color) ws.getCell(start + 1 + i, ci).font = { name: FONT, color: { argb: color }, bold: true };
    });
  }
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${start}:${start}` };
  ws.headerFooter.oddFooter = '&L UDL Support · Mesa de ayuda&R Página &P de &N';
  return ws;
}

/** Hoja "Resumen": filtros aplicados, indicadores y tablas de desglose una debajo de otra. */
export function addSummarySheet(wb: ExcelJS.Workbook, opts: {
  title: string; filters: [string, string][]; kpis: [string, string | number | null, string?][];
  sections: { title: string; head: string[]; rows: (string | number | null)[][] }[];
}) {
  const ws = wb.addWorksheet('Resumen', { properties: { tabColor: { argb: BRAND.violet } }, views: [{ showGridLines: false }] });
  [34, 18, 18, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  let r = sheetHeader(ws, opts.title, generated(), 4);

  const label = (row: number, text: string) => {
    ws.mergeCells(row, 1, row, 4);
    const c = ws.getCell(row, 1);
    c.value = text.toUpperCase();
    c.font = { name: FONT, size: 11, bold: true, color: { argb: BRAND.teal } };
    c.border = { bottom: { style: 'medium', color: { argb: BRAND.teal } } };
  };

  label(r++, 'Filtros aplicados');
  for (const [k, v] of opts.filters) {
    ws.getCell(r, 1).value = k;
    ws.getCell(r, 1).font = { name: FONT, color: { argb: BRAND.gray } };
    ws.mergeCells(r, 2, r, 4);
    ws.getCell(r, 2).value = v;
    ws.getCell(r, 2).font = { name: FONT, bold: true };
    r++;
  }
  r++;

  label(r++, 'Indicadores');
  for (const [k, v, note] of opts.kpis) {
    const a = ws.getCell(r, 1), b = ws.getCell(r, 2);
    a.value = k; a.font = { name: FONT, color: { argb: BRAND.gray } };
    b.value = v ?? '—'; b.font = { name: FONT, size: 14, bold: true, color: { argb: BRAND.dark } }; b.alignment = { horizontal: 'right' };
    if (note) { ws.mergeCells(r, 3, r, 4); ws.getCell(r, 3).value = note; ws.getCell(r, 3).font = { name: FONT, italic: true, size: 9, color: { argb: BRAND.gray } }; }
    [a, b].forEach((c) => { c.border = { bottom: { style: 'hair', color: { argb: BRAND.line } } }; });
    ws.getRow(r).height = 20;
    r++;
  }

  for (const s of opts.sections) {
    r++;
    label(r++, s.title);
    s.head.forEach((h, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = h;
      c.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.dark } };
      c.alignment = { horizontal: i ? 'right' : 'left' };
    });
    r++;
    s.rows.forEach((row, ri) => {
      row.forEach((v, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = v;
        c.font = { name: FONT };
        if (i) { c.alignment = { horizontal: 'right' }; if (typeof v === 'number' && !Number.isInteger(v)) c.numFmt = '0.0'; }
        if (ri % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } };
        c.border = { bottom: { style: 'hair', color: { argb: BRAND.line } } };
      });
      r++;
    });
  }
  ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return ws;
}

export async function xlsxResponse(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const XL = { red: 'FFDC2626', amber: 'FFB45309', green: 'FF15803D' };
