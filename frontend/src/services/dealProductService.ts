import { api } from "@/lib/axios";

export interface DealProduct {
  id: string;
  companyId: string;
  dealId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  createdAt: string;
  updatedAt: string;
  product?: {
    name: string;
    sku?: string;
    category?: string;
    imageUrl?: string;
  };
}

export interface AddProductToDealPayload {
  productId: string;
  quantity?: number;
  discount?: number;
}

export const getDealProducts = async (dealId: string): Promise<DealProduct[]> => {
  const res = await api.get(`/deals/${dealId}/products`);
  return res.data.data;
};

export const addProductToDeal = async (
  dealId: string,
  payload: AddProductToDealPayload
): Promise<DealProduct> => {
  const res = await api.post(`/deals/${dealId}/products`, payload);
  return res.data.data;
};

export const updateDealProduct = async (
  dealId: string,
  dealProductId: string,
  data: { quantity?: number; discount?: number; unitPrice?: number }
): Promise<DealProduct> => {
  const res = await api.patch(`/deals/${dealId}/products/${dealProductId}`, data);
  return res.data.data;
};

export const removeProductFromDeal = async (
  dealId: string,
  dealProductId: string
): Promise<void> => {
  await api.delete(`/deals/${dealId}/products/${dealProductId}`);
};
