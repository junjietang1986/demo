import ExcelJS from 'exceljs';
import { Response } from 'express';

export interface ColumnDef {
  key: string;
  header: string;
  width?: number;
  required?: boolean;
  type?: 'string' | 'number' | 'date' | 'boolean';
  enum?: string[];
}

export function createWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TRAC QMS';
  wb.created = new Date();
  return wb;
}

export function addSheet(wb: ExcelJS.Workbook, name: string, columns: ColumnDef[], data?: any[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name);

  ws.columns = columns.map(col => ({
    header: col.header + (col.required ? ' *' : ''),
    key: col.key,
    width: col.width || 18
  }));

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, size: 11 };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1677FF' }
  };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.height = 24;

  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  if (data && data.length > 0) {
    data.forEach((row, rowIdx) => {
      const excelRow = ws.addRow(row);
      excelRow.alignment = { vertical: 'middle', wrapText: true };
      columns.forEach((col, colIdx) => {
        const cell = excelRow.getCell(colIdx + 1);
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
        };
        if (col.type === 'date' && cell.value) {
          cell.numFmt = 'YYYY-MM-DD';
        }
      });
    });
  }

  ws.getColumn(1).eachCell((cell, rowNumber) => {
    if (rowNumber > 1) {
      cell.alignment = { vertical: 'middle' };
    }
  });

  return ws;
}

export async function sendWorkbook(wb: ExcelJS.Workbook, res: Response, filename: string) {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(filename)}"`
  );
  await wb.xlsx.write(res);
  res.end();
}

export async function parseUploadedFile(buffer: Buffer): Promise<{ columns: ColumnDef[]; rows: any[]; errors: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);

  const ws = wb.worksheets[0];
  if (!ws) {
    return { columns: [], rows: [], errors: ['Excel文件为空或无法读取'] };
  }

  const errors: string[] = [];
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers.push(String(cell.value || '').replace(' *', '').trim());
  });

  const rows: any[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: any = {};
    let hasData = false;
    headers.forEach((header, idx) => {
      const cell = row.getCell(idx + 1);
      let val: any = cell.value;
      if (val && typeof val === 'object' && 'text' in val) {
        val = val.text;
      }
      if (val && typeof val === 'object' && 'result' in val) {
        val = val.result;
      }
      if (val !== null && val !== undefined && val !== '') {
        hasData = true;
        if (val instanceof Date) {
          val = val.toISOString().split('T')[0];
        }
        obj[headers[idx]] = val;
      }
    });
    if (hasData) {
      obj._rowNumber = rowNumber;
      rows.push(obj);
    }
  });

  return { columns: [], rows, errors };
}

export function validateRows(rows: any[], columns: ColumnDef[]): { valid: any[]; errors: string[] } {
  const valid: any[] = [];
  const errors: string[] = [];

  rows.forEach((row, idx) => {
    const rowNum = row._rowNumber || idx + 2;
    const rowErrors: string[] = [];

    columns.forEach(col => {
      const val = row[col.header];
      if (col.required && (val === undefined || val === null || val === '')) {
        rowErrors.push(`第${rowNum}行: 「${col.header}」为必填项`);
      }
      if (val !== undefined && val !== null && val !== '' && col.enum && !col.enum.includes(String(val))) {
        rowErrors.push(`第${rowNum}行: 「${col.header}」值"${val}"不在允许范围[${col.enum.join('/')}]内`);
      }
    });

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      const mapped: any = {};
      columns.forEach(col => {
        mapped[col.key] = row[col.header];
      });
      mapped._rowNumber = rowNum;
      valid.push(mapped);
    }
  });

  return { valid, errors };
}
