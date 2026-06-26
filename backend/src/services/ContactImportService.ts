import { contactService } from "@/services/ContactService";
import { planLimitsService } from "@/services/PlanLimitsService";
import { AppError } from "@/utils/AppError";
import { parseFile, normalizeRows } from "@/services/CsvParserService";
import { CreateContactSchema } from "@/schemas/contactSchema";

export interface ImportContactsResult {
  totalRows: number;
  imported: number;
  duplicates: number;
  invalid: number;
  summary: {
    message: string;
    successRate: string;
  };
}

export class ContactImportService {
  async importFromCsv(
    companyId: string,
    file: Express.Multer.File,
  ): Promise<ImportContactsResult> {
    const { rows, totalRows } = parseFile(file);
    if (totalRows === 0) throw new AppError("File is empty", 400);

    const normalizedRows = normalizeRows(rows);
    const validContacts: Record<string, unknown>[] = [];
    const errors: string[] = [];
    const duplicates: string[] = [];
    const seenPhones = new Set<string>();
    const seenEmails = new Set<string>();

    for (let i = 0; i < normalizedRows.length; i++) {
      const rowNum = i + 2;
      const row = normalizedRows[i];
      try {
        const validated = await CreateContactSchema.shape.body.parseAsync(row);
        const phone = validated.phone?.replace(/\D/g, "");
        const email = validated.email?.toLowerCase();

        if (phone && seenPhones.has(phone)) {
          duplicates.push(`Row ${rowNum}: Duplicate phone ${validated.phone}`);
          continue;
        }
        if (email && seenEmails.has(email)) {
          duplicates.push(`Row ${rowNum}: Duplicate email ${validated.email}`);
          continue;
        }

        const isDuplicate = await contactService.checkDuplicate(
          companyId,
          phone,
          email,
        );

        if (isDuplicate) {
          duplicates.push(`Row ${rowNum}: Duplicate in database`);
          continue;
        }

        if (phone) seenPhones.add(phone);
        if (email) seenEmails.add(email);

        validContacts.push({ ...validated, companyId });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Validation error";
        errors.push(`Row ${rowNum}: ${msg}`);
      }
    }

    const canCreate = await planLimitsService.canCreateResource(
      companyId,
      "contacts",
      validContacts.length,
    );
    if (!canCreate) throw new AppError("Plan limit exceeded", 403);

    if (validContacts.length > 0) {
      await contactService.bulkCreate(validContacts);
    }

    return {
      totalRows,
      imported: validContacts.length,
      duplicates: duplicates.length,
      invalid: errors.length,
      summary: {
        message: `${validContacts.length} contacts imported`,
        successRate:
          totalRows > 0
            ? ((validContacts.length / totalRows) * 100).toFixed(1) + "%"
            : "0%",
      },
    };
  }
}

export const contactImportService = new ContactImportService();
