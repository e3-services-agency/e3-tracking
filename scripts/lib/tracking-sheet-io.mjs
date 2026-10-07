/** Workbook reader for the tracking-sheet importer (T-4-34). No shebang, so tests can import it. */
import ExcelJS from 'exceljs';

/** exceljs cell value -> plain value (text, number, boolean, Date, or an error string like "#REF!"). */
export function plainCell(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object' || v instanceof Date) return v;
  if (v.richText) return v.richText.map((t) => t.text).join('');
  if ('error' in v) return v.error;
  if ('result' in v) return plainCell(v.result);
  if ('formula' in v || 'sharedFormula' in v) return null;
  if ('text' in v) return plainCell(v.text);
  return null;
}

/** @param {string} file @returns {Promise<Record<string, unknown[][]>>} worksheet name -> rows of plain cells */
export async function readWorkbook(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  /** @type {Record<string, unknown[][]>} */
  const sheets = {};
  for (const ws of wb.worksheets) {
    const grid = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells = [];
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        cells[colNumber - 1] = plainCell(cell.value);
      });
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null;
      grid[rowNumber - 1] = cells;
    });
    for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
    sheets[ws.name] = grid;
  }
  return sheets;
}
