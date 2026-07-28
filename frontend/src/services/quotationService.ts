import { api } from "@/lib/axios";

export interface QuotationItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
}

export interface CreateQuotationInput {
  contactId?: string;
  dealId?: string;
  title: string;
  currency?: string;
  notes?: string;
  terms?: string;
  validUntil?: string;
  items: QuotationItemInput[];
}

export interface Quotation {
  id: string;
  companyId: string;
  quoteNumber: number;
  title: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  currency: string;
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
  notes?: string;
  terms?: string;
  validUntil?: string;
  publicHash: string;
  pdfUrl?: string;
  createdAt: string;
  contact?: { id: string; name: string; phone?: string; email?: string };
  deal?: { id: string; title: string; value: number };
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxRate: number;
    totalLine: number;
    productId?: string;
  }>;
}

export const getQuotations = async (filters?: { contactId?: string; dealId?: string; status?: string }): Promise<Quotation[]> => {
  const res = await api.get("/quotations", { params: filters });
  return res.data.data;
};

export const getQuotationById = async (id: string): Promise<Quotation> => {
  const res = await api.get(`/quotations/${id}`);
  return res.data.data;
};

export const createQuotation = async (data: CreateQuotationInput): Promise<Quotation> => {
  const res = await api.post("/quotations", data);
  return res.data.data;
};

export const updateQuotationStatus = async (id: string, status: Quotation["status"]): Promise<Quotation> => {
  const res = await api.patch(`/quotations/${id}/status`, { status });
  return res.data.data;
};

export const getQuotationPublicByHash = async (hash: string): Promise<Quotation> => {
  const res = await api.get(`/quotations/public/${hash}`);
  return res.data.data;
};

export const respondQuotationPublic = async (hash: string, accept: boolean): Promise<Quotation> => {
  const res = await api.post(`/quotations/public/${hash}/respond`, { accept });
  return res.data.data;
};
