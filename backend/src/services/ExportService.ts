import { createObjectCsvWriter } from "csv-writer";
import PDFDocument from "pdfkit";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import * as fsSync from "fs";
import { Logger } from "@/utils/logger";
import { storageService } from "@/services/StorageService";

/**
 * [STAT] EXPORT SERVICE
 * Genera reportes en CSV y PDF para analytics
 * Enterprise-grade con validación y error handling
 * Almacenamiento en S3 (Stateless)
 */

interface ExportData {
  headers: Array<{ id: string; title: string }>;
  records: Array<Record<string, unknown>>;
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
   *  Generate CSV Export
   * Creates a CSV file and uploads to S3
   */
  async generateCSV(
    companyId: string,
    data: ExportData,
    filename: string,
  ): Promise<{ filePath: string; success: boolean }> {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-z0-9_-]/gi, "_");
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(
      tempDir,
      `${sanitizedFilename}_${timestamp}.csv`,
    );

    try {
      // Create CSV writer
      const csvWriter = createObjectCsvWriter({
        path: tempFilePath,
        header: data.headers,
      });

      // Write records
      await csvWriter.writeRecords(data.records);

      // Upload to S3
      const fileBuffer = await fs.readFile(tempFilePath);
      const uploadResult = await storageService.uploadFile(
        companyId,
        fileBuffer,
        `${sanitizedFilename}_${timestamp}.csv`,
        "text/csv",
      );

      Logger.info(
        `[ExportService] CSV generated and uploaded to S3: ${uploadResult.url}`,
      );

      // Cleanup temp file
      await fs
        .unlink(tempFilePath)
        .catch((e) => Logger.warn("Error deleting temp CSV", e));

      return {
        filePath: uploadResult.url,
        success: true,
      };
    } catch (error) {
      Logger.error("[ExportService] CSV generation failed:", error);
      // Ensure temp file is cleaned up on error
      if (fsSync.existsSync(tempFilePath)) {
        await fs.unlink(tempFilePath).catch(() => {});
      }
      throw new Error("Failed to generate CSV export");
    }
  },

  /**
   *  Generate PDF Export
   * Creates a professional PDF report and uploads to S3
   */
  async generatePDF(
    companyId: string,
    data: ExportData,
    filename: string,
  ): Promise<{ filePath: string; success: boolean }> {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-z0-9_-]/gi, "_");
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(
      tempDir,
      `${sanitizedFilename}_${timestamp}.pdf`,
    );

    try {
      // Create PDF document
      const doc = new PDFDocument({ margin: 50 });
      const writeStream = fsSync.createWriteStream(tempFilePath);

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
            },
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
            { align: "center" },
          );
      }

      // Finalize PDF
      doc.end();

      // Wait for write to complete
      await new Promise<void>((resolve, reject) => {
        writeStream.on("finish", () => resolve());
        writeStream.on("error", reject);
      });

      // Upload to S3
      const fileBuffer = await fs.readFile(tempFilePath);
      const uploadResult = await storageService.uploadFile(
        companyId,
        fileBuffer,
        `${sanitizedFilename}_${timestamp}.pdf`,
        "application/pdf",
      );

      Logger.info(
        `[ExportService] PDF generated and uploaded to S3: ${uploadResult.url}`,
      );

      // Cleanup temp file
      await fs
        .unlink(tempFilePath)
        .catch((e) => Logger.warn("Error deleting temp PDF", e));

      return {
        filePath: uploadResult.url,
        success: true,
      };
    } catch (error) {
      Logger.error("[ExportService] PDF generation failed:", error);
      // Ensure temp file is cleaned up on error
      if (fsSync.existsSync(tempFilePath)) {
        await fs.unlink(tempFilePath).catch(() => {});
      }
      throw new Error("Failed to generate PDF export");
    }
  },

  /**
   *  Cleanup (No longer needed for local files, S3 handles persistence)
   */
  async cleanupOldExports(): Promise<void> {
    // S3 lifecycle policies handle this more efficiently
    Logger.info("[ExportService] S3 Lifecycle policy handles cleanup.");
  },
};
