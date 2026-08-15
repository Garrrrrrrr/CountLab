/** Minimal RFC4180-ish CSV encode/decode for the flat, known schemas CountLab exports (journal sessions/transactions, training history). */

function toCsvValue(value: unknown): string {
  const str = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const lines = rows.map((row) => columns.map((column) => toCsvValue(row[column])).join(","));
  return [columns.join(","), ...lines].join("\r\n");
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyField = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      sawAnyField = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
      sawAnyField = true;
    } else if (char === "\r") {
      // Line endings are handled on \n; a bare \r is dropped.
    } else if (char === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      sawAnyField = false;
    } else {
      field += char;
      sawAnyField = true;
    }
  }
  if (sawAnyField || field.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text.trim());
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  return body
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) => Object.fromEntries(header.map((column, index) => [column, row[index] ?? ""])));
}
