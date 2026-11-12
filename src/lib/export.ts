// Excel and PDF export. Libraries are loaded on demand so they do not slow the first page load.
export interface ReportColumn<T> {
  header: string;
  value: (row: T) => string | number;
  /** Right-align and format as a number in PDF. */
  numeric?: boolean;
}

export interface ReportSpec<T> {
  title: string;
  subtitle?: string;
  filename: string;
  columns: ReportColumn<T>[];
  rows: T[];
  /** Summary lines printed above the table, e.g. totals. */
  summary?: [string, string][];
  generatedBy: string;
}

export async function exportExcel<T>(spec: ReportSpec<T>) {
  const XLSX = await import('xlsx');
  const head = [[spec.title], ...(spec.subtitle ? [[spec.subtitle]] : []), [`Generated ${new Date().toLocaleString('en-GB')} by ${spec.generatedBy}`], []];
  const summary = spec.summary?.length ? [...spec.summary.map(([k, v]) => [k, v]), []] : [];
  const table = [spec.columns.map((c) => c.header), ...spec.rows.map((r) => spec.columns.map((c) => c.value(r)))];
  const ws = XLSX.utils.aoa_to_sheet([...head, ...summary, ...table]);
  ws['!cols'] = spec.columns.map((c, i) => ({
    wch: Math.min(48, Math.max(c.header.length, ...table.slice(1, 200).map((r) => String(r[i] ?? '').length)) + 2),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, spec.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  XLSX.writeFile(wb, `${spec.filename}.xlsx`);
}

export async function exportPdf<T>(spec: ReportSpec<T>) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: spec.columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(11, 37, 69);
  doc.rect(0, 0, w, 56, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('KBZ Life Insurance · L&D Department', 32, 24);
  doc.setFontSize(10);
  doc.text(spec.title, 32, 42);
  doc.setTextColor(60, 60, 60);
  let y = 76;
  doc.setFontSize(9);
  if (spec.subtitle) { doc.text(spec.subtitle, 32, y); y += 14; }
  doc.text(`Generated ${new Date().toLocaleString('en-GB')} by ${spec.generatedBy}`, 32, y);
  y += 10;
  if (spec.summary?.length) {
    autoTable(doc, {
      startY: y + 4, body: spec.summary, theme: 'plain', styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 200 } }, margin: { left: 32, right: 32 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }
  autoTable(doc, {
    startY: y + 4,
    head: [spec.columns.map((c) => c.header)],
    body: spec.rows.map((r) => spec.columns.map((c) => {
      const v = c.value(r);
      return typeof v === 'number' ? v.toLocaleString('en-US') : v;
    })),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [11, 37, 69], textColor: 255 },
    alternateRowStyles: { fillColor: [244, 246, 250] },
    columnStyles: Object.fromEntries(spec.columns.map((c, i) => [i, c.numeric ? { halign: 'right' } : {}])),
    margin: { left: 32, right: 32 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(`Page ${doc.getNumberOfPages()}`, w - 70, h - 16);
      doc.text('Confidential: for internal management, finance and audit use', 32, h - 16);
    },
  });
  doc.save(`${spec.filename}.pdf`);
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
