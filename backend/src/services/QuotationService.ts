import { QuotationStatus } from "@prisma/client";
import { quotationRepository } from "@/repositories/QuotationRepository";
import { quotationPdfService, QuotationWithDetails } from "./QuotationPdfService";
import { TenantContextManager } from "@/config/tenantContext";

export interface CreateQuotationItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
}

export interface CreateQuotationInput {
  companyId: string;
  createdById?: string;
  contactId?: string;
  dealId?: string;
  title: string;
  currency?: string;
  notes?: string;
  terms?: string;
  validUntil?: Date;
  items: CreateQuotationItemInput[];
}

export class QuotationService {
  async createQuotation(input: CreateQuotationInput) {
    const { companyId, createdById, contactId, dealId, title, currency = "COP", notes, terms, validUntil, items } = input;

    const nextNumber = await quotationRepository.getNextQuoteNumber(companyId);

    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    const preparedItems = items.map((item) => {
      const qty = item.quantity || 1;
      const price = item.unitPrice || 0;
      const discountPct = item.discount || 0;
      const taxPct = item.taxRate || 0;

      const baseLine = qty * price;
      const lineDiscount = (baseLine * discountPct) / 100;
      const lineSubtotal = baseLine - lineDiscount;
      const lineTax = (lineSubtotal * taxPct) / 100;
      const totalLine = lineSubtotal + lineTax;

      subtotal += lineSubtotal;
      totalTax += lineTax;
      totalDiscount += lineDiscount;

      return {
        productId: item.productId || null,
        description: item.description,
        quantity: qty,
        unitPrice: price,
        discount: discountPct,
        taxRate: taxPct,
        totalLine,
      };
    });

    const grandTotal = subtotal + totalTax;

    const quotation = await quotationRepository.create({
      data: {
        companyId,
        createdById: createdById || null,
        contactId: contactId || null,
        dealId: dealId || null,
        quoteNumber: nextNumber,
        title,
        currency,
        subtotal,
        taxAmount: totalTax,
        discount: totalDiscount,
        total: grandTotal,
        notes,
        terms,
        validUntil,
        status: QuotationStatus.DRAFT,
        items: {
          create: preparedItems,
        },
      },
      include: {
        company: true,
        contact: true,
        items: true,
      },
    });

    return quotation;
  }

  async getQuotations(companyId: string, filters?: { contactId?: string; dealId?: string; status?: QuotationStatus }) {
    return quotationRepository.findMany({
      where: {
        companyId,
        ...(filters?.contactId ? { contactId: filters.contactId } : {}),
        ...(filters?.dealId ? { dealId: filters.dealId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: {
        contact: { select: { id: true, name: true, phone: true, email: true } },
        deal: { select: { id: true, title: true, value: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getQuotationById(companyId: string, id: string): Promise<QuotationWithDetails | null> {
    const quotation = await quotationRepository.findFirst({
      where: { id, companyId },
      include: {
        company: true,
        contact: true,
        deal: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
    return quotation as QuotationWithDetails | null;
  }

  async getQuotationByPublicHash(hash: string) {
    return TenantContextManager.runAsSystem(async () => {
      return quotationRepository.findUnique({
        where: { publicHash: hash },
        include: {
          company: true,
          contact: true,
          items: true,
        },
      });
    });
  }

  async updateQuotationStatus(companyId: string, id: string, status: QuotationStatus) {
    return TenantContextManager.runAsSystem(async () => {
      // [SEC] This runs under runAsSystem (required for the unauthenticated
      // public accept/reject path), which bypasses the Prisma extension's
      // automatic companyId enforcement entirely. companyId must therefore
      // be filtered explicitly here — without it, any authenticated agent
      // could update another company's quotation by guessing/knowing its id.
      return quotationRepository.update({
        where: { id, companyId },
        data: { status },
        include: {
          company: true,
          contact: true,
          items: true,
        },
      });
    });
  }

  async generateHtml(companyId: string, id: string, publicBaseUrl: string) {
    const quotation = await this.getQuotationById(companyId, id);
    if (!quotation) {
      throw new Error("Cotización no encontrada");
    }
    return quotationPdfService.generateHtml(quotation, publicBaseUrl);
  }
}

export const quotationService = new QuotationService();
