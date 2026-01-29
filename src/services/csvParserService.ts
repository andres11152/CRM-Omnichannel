import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";

/**
 * 📊 CSV/EXCEL PARSER SERVICE
 *
 * Handles parsing of uploaded CSV and Excel files
 * Returns normalized array of objects
 */

export interface ParsedRow {
  [key: string]: any;
}

export interface ParseResult {
  rows: ParsedRow[];
  totalRows: number;
}

/**
 * Parse CSV file from buffer
 */
export function parseCSV(buffer: Buffer): ParseResult {
  try {
    const csvString = buffer.toString("utf-8");

    const rows = parse(csvString, {
      columns: true, // First row as headers
      skip_empty_lines: true,
      trim: true,
      cast: true, // Auto-cast types
      cast_date: false, // Don't auto-parse dates
      relax_quotes: true, // Handle quotes flexibly
      relax_column_count: true, // Allow variable column counts
    });

    Logger.info(`[CSV Parser] Parsed ${rows.length} rows`);

    return {
      rows,
      totalRows: rows.length,
    };
  } catch (error) {
    Logger.error("[CSV Parser] Parse error:", error);
    throw new AppError(
      "Failed to parse CSV file. Please ensure it is properly formatted.",
      400
    );
  }
}

/**
 * Parse Excel file (XLS/XLSX) from buffer
 */
export function parseExcel(buffer: Buffer): ParseResult {
  try {
    // Read workbook from buffer
    const workbook = XLSX.read(buffer, { type: "buffer" });

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new AppError("Excel file has no sheets", 400);
    }

    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON (array of objects with headers as keys)
    const rows: ParsedRow[] = XLSX.utils.sheet_to_json(worksheet, {
      raw: false, // Format values as strings
      defval: "", // Default value for empty cells
    });

    Logger.info(
      `[Excel Parser] Parsed ${rows.length} rows from sheet: ${sheetName}`
    );

    return {
      rows,
      totalRows: rows.length,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;

    Logger.error("[Excel Parser] Parse error:", error);
    throw new AppError(
      "Failed to parse Excel file. Please ensure it is a valid .xls or .xlsx file.",
      400
    );
  }
}

/**
 * Auto-detect file type and parse accordingly
 */
export function parseFile(file: Express.Multer.File): ParseResult {
  const filename = file.originalname.toLowerCase();
  const mimeType = file.mimetype;

  // Detect file type
  if (filename.endsWith(".csv") || mimeType === "text/csv") {
    return parseCSV(file.buffer);
  }

  if (
    filename.endsWith(".xlsx") ||
    filename.endsWith(".xls") ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  ) {
    return parseExcel(file.buffer);
  }

  throw new AppError(
    "Unsupported file type. Please upload a CSV or Excel file.",
    400
  );
}

/**
 * Normalize column names (handles common variations)
 *
 * @example
 * 'Phone Number' → 'phone'
 * 'E-mail' → 'email'
 * 'Full Name' → 'name'
 */
export function normalizeColumnName(column: string): string {
  const normalized = column
    .toLowerCase()
    .trim()
    .replace(/[\s-_]+/g, ""); // Remove spaces, dashes, underscores

  // Map common variations to standard field names
  const mappings: Record<string, string> = {
    phonenumber: "phone",
    "phone#": "phone",
    telephone: "phone",
    mobile: "phone",
    cel: "phone",
    celular: "phone",
    teléfono: "phone",

    email: "email",
    emailaddress: "email",
    mail: "email",
    correo: "email",
    "e-mail": "email",

    name: "name",
    fullname: "name",
    contactname: "name",
    nombre: "name",
    nombrecomplet: "name",

    note: "notes",
    comments: "notes",
    description: "notes",
    notas: "notes",
    comentarios: "notes",

    tag: "tags",
    etiqueta: "tags",
    category: "tags",
    categoría: "tags",
  };

  return mappings[normalized] || column.toLowerCase();
}

/**
 * Normalize parsed rows to standard Contact format
 */
export function normalizeRows(rows: ParsedRow[]): ParsedRow[] {
  return rows.map((row) => {
    const normalized: ParsedRow = {};

    // Normalize each column name and copy value
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = normalizeColumnName(key);
      normalized[normalizedKey] = value;
    }

    // Handle tags: convert string to array if needed
    if (normalized.tags && typeof normalized.tags === "string") {
      normalized.tags = normalized.tags
        .split(",")
        .map((tag: string) => tag.trim())
        .filter((tag: string) => tag.length > 0);
    }

    return normalized;
  });
}
