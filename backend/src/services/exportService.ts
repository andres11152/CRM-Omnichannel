import { createObjectCsvWriter } from "csv-writer";
import PDFDocument from "pdfkit";
import { promises as fs } from "fs";
import path from "path";
import { Logger } from "@/utils/logger";

/**
 * 📊 EXPORT SERVICE
 * Genera reportes en CSV y PDF para analytics
 * Enterprise-grade con validación y error handling
 */

interface ExportData {
  headers: Array<{ id: string; title: string }>;
  records: Array<Record<string, any>>;
  metadata?: {
    title?: string;
    companyName?: string;
    dateRange?: string;
    generatedBy?: string;
    totalRecords?: number;
  };
}

export const exportService = {
  /**
   * 📄 Generate CSV Export
   * Creates a CSV file with proper formatting
   */
  async generateCSV(
    data: ExportData,
    filename: string
  ): Promise<{ filePath: string; success: boolean }> {
    try {
      // Ensure exports directory exists
      const exportsDir = path.join(process.cwd(), "public", "exports");
      await fs.mkdir(exportsDir, { recursive: true });

      const timestamp = Date.now();
      const sanitizedFilename = filename.replace(/[^a-z0-9_-]/gi, "_");
      const filePath = path.join(
        exportsDir,
        `${sanitizedFilename}_${timestamp}.csv`
      );

      // Create CSV writer
      const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: data.headers,
      });

      // Write records
      await csvWriter.writeRecords(data.records);

      Logger.info(`[ExportService] CSV generated: ${filePath}`);

      return {
        filePath: `/exports/${sanitizedFilename}_${timestamp}.csv`,
        success: true,
      };
    } catch (error) {
      Logger.error("[ExportService] CSV generation failed:", error);
      throw new Error("Failed to generate CSV export");
    }
  },

  /**
   * 📕 Generate PDF Export
   * Creates a professional PDF report with branding
   */
  async generatePDF(
    data: ExportData,
    filename: string
  ): Promise<{ filePath: string; success: boolean }> {
    try {
      // Ensure exports directory exists
      const exportsDir = path.join(process.cwd(), "public", "exports");
      await fs.mkdir(exportsDir, { recursive: true });

      const timestamp = Date.now();
      const sanitizedFilename = filename.replace(/[^a-z0-9_-]/gi, "_");
      const filePath = path.join(
        exportsDir,
        `${sanitizedFilename}_${timestamp}.pdf`
      );

      // Create PDF document
      const doc = new PDFDocument({ margin: 50 });
      const writeStream = require("fs").createWriteStream(filePath);

      doc.pipe(writeStream);

      // Header Section
      doc
        .fontSize(24)
        .fillColor("#4F46E5")
        .text(data.metadata?.title || "Reporte de Analytics", {
          align: "center",
        });

      doc.moveDown(0.5);

      // Metadata
      doc.fontSize(10).fillColor("#6B7280");

      if (data.metadata?.companyName) {
        doc.text(`Empresa: ${data.metadata.companyName}`, { align: "center" });
      }

      if (data.metadata?.dateRange) {
        doc.text(`Periodo: ${data.metadata.dateRange}`, { align: "center" });
      }

      doc.text(`Generado: ${new Date().toLocaleString("es-ES")}`, {
        align: "center",
      });

      if (data.metadata?.generatedBy) {
        doc.text(`Por: ${data.metadata.generatedBy}`, { align: "center" });
      }

      doc.moveDown(1);

      // Separator line
      doc
        .strokeColor("#E5E7EB")
        .lineWidth(1)
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .stroke();

      doc.moveDown(1);

      // Summary Stats (if provided)
      if (data.metadata?.totalRecords) {
        doc
          .fontSize(12)
          .fillColor("#111827")
          .text(`Total de Registros: ${data.metadata.totalRecords}`, {
            align: "left",
          });
        doc.moveDown(0.5);
      }

      // Table Header
      const startY = doc.y;
      const columnWidth = 500 / data.headers.length;

      doc.fontSize(10).fillColor("#374151").font("Helvetica-Bold");

      data.headers.forEach((header, index) => {
        doc.text(header.title, 50 + index * columnWidth, startY, {
          width: columnWidth - 10,
          align: "left",
        });
      });

      doc.moveDown(0.5);

      // Separator
      doc
        .strokeColor("#E5E7EB")
        .lineWidth(0.5)
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .stroke();

      doc.moveDown(0.5);

      // Table Rows
      doc.fontSize(9).fillColor("#1F2937").font("Helvetica");

      const maxRows = 50; // Prevent PDF overflow
      const recordsToShow = data.records.slice(0, maxRows);

      recordsToShow.forEach((record, rowIndex) => {
        const rowY = doc.y;

        // Check for page break
        if (rowY > 700) {
          doc.addPage();
        }

        data.headers.forEach((header, colIndex) => {
          const value = record[header.id] || "-";
          const displayValue =
            typeof value === "number" ? value.toLocaleString("es-ES") : value;

          doc.text(
            String(displayValue).substring(0, 30), // Truncate long text
            50 + colIndex * columnWidth,
            doc.y,
            {
              width: columnWidth - 10,
              align: "left",
              continued: colIndex < data.headers.length - 1,
            }
          );
        });

        doc.moveDown(0.3);

        // Zebra striping
        if (rowIndex % 2 === 0) {
          doc
            .rect(45, rowY - 2, 510, 15)
            .fillColor("#F9FAFB")
            .fillOpacity(0.5)
            .fill();
          doc.fillColor("#1F2937").fillOpacity(1);
        }
      });

      // Footer
      if (data.records.length > maxRows) {
        doc.moveDown(1);
        doc
          .fontSize(9)
          .fillColor("#9CA3AF")
          .text(
            `Mostrando ${maxRows} de ${data.records.length} registros. Descarga CSV para ver todos.`,
            { align: "center" }
          );
      }

      // Finalize PDF
      doc.end();

      // Wait for write to complete
      await new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });

      Logger.info(`[ExportService] PDF generated: ${filePath}`);

      return {
        filePath: `/exports/${sanitizedFilename}_${timestamp}.pdf`,
        success: true,
      };
    } catch (error) {
      Logger.error("[ExportService] PDF generation failed:", error);
      throw new Error("Failed to generate PDF export");
    }
  },

  /**
   * 🧹 Cleanup old export files (Cron job helper)
   * Deletes files older than 24 hours to save space
   */
  async cleanupOldExports(): Promise<void> {
    try {
      const exportsDir = path.join(process.cwd(), "public", "exports");

      const files = await fs.readdir(exportsDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      for (const file of files) {
        const filePath = path.join(exportsDir, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filePath);
          Logger.info(`[ExportService] Deleted old export: ${file}`);
        }
      }
    } catch (error) {
      Logger.error("[ExportService] Cleanup failed:", error);
    }
  },
};
