import { api } from "../src/lib/axios";
import { Product } from "../types";

export const getProducts = async (): Promise<Product[]> => {
  const res = await api.get("/products");
  return res.data.data;
};

export const createProduct = async (
  productData: Partial<Product>
): Promise<Product> => {
  const res = await api.post("/products", productData);
  return res.data.data;
};

export const updateProduct = async (
  id: string,
  productData: Partial<Product>
): Promise<Product> => {
  const res = await api.put(`/products/${id}`, productData);
  return res.data.data;
};

export const deleteProduct = async (id: string): Promise<void> => {
  await api.delete(`/products/${id}`);
};
