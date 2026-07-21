import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, ShoppingBag, Percent, ShieldCheck } from "lucide-react";
import { getProducts } from "@/services/productService";
import {
  getDealProducts,
  addProductToDeal,
  removeProductFromDeal,
  updateDealProduct,
  type DealProduct
} from "@/services/dealProductService";
import { Product } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatCOP } from "@/types/property.types";
import { toast } from "sonner";

interface Props {
  dealId: string;
  onProductsChanged?: () => void;
}

export const DealProductsTab: React.FC<Props> = ({ dealId, onProductsChanged }) => {
  const { t } = useTranslation();
  const [dealProducts, setDealProducts] = useState<DealProduct[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states to add new product
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [adding, setAdding] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assigned, fullCatalog] = await Promise.all([
        getDealProducts(dealId),
        getProducts()
      ]);
      setDealProducts(assigned);
      setCatalog(fullCatalog.filter(p => p.status === "active"));
    } catch (error) {
      console.error("Error loading deal products:", error);
      toast.error(t("deal_products_tab.toast.load_error", "Error al cargar los productos"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dealId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return;
    setAdding(true);
    try {
      await addProductToDeal(dealId, {
        productId: selectedProductId,
        quantity,
        discount
      });
      toast.success(t("deal_products_tab.toast.linked", "Producto asociado correctamente"));
      setSelectedProductId("");
      setQuantity(1);
      setDiscount(0);
      await loadData();
      if (onProductsChanged) onProductsChanged();
    } catch (error) {
      console.error(error);
      toast.error(t("deal_products_tab.toast.link_error", "No se pudo asociar el producto"));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (dealProductId: string) => {
    try {
      await removeProductFromDeal(dealId, dealProductId);
      toast.success(t("deal_products_tab.toast.removed", "Producto removido"));
      await loadData();
      if (onProductsChanged) onProductsChanged();
    } catch (error) {
      console.error(error);
      toast.error(t("deal_products_tab.toast.remove_error", "Error al remover el producto"));
    }
  };

  const handleUpdate = async (dealProductId: string, quantity: number, discount: number) => {
    try {
      await updateDealProduct(dealId, dealProductId, { quantity, discount });
      await loadData();
      if (onProductsChanged) onProductsChanged();
    } catch (error) {
      console.error(error);
      toast.error(t("deal_products_tab.toast.update_error", "Error al actualizar la cantidad/descuento"));
    }
  };

  const subtotal = dealProducts.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  const totalDiscount = dealProducts.reduce((sum, item) => sum + (item.unitPrice * item.quantity * (item.discount / 100)), 0);
  const total = subtotal - totalDiscount;

  if (loading) {
    return <div className="text-center py-6 text-sm text-gray-500">{t("common.loading")}...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Add Product Form */}
      <form onSubmit={handleAdd} className="bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/60 p-4 rounded-xl space-y-4">
        <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
          <ShoppingBag className="w-4 h-4 text-blue-500" />
          Asociar Producto al Trato
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-6 flex flex-col gap-1">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Seleccionar Producto</span>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Seleccionar --</option>
              {catalog.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku || "Sin SKU"}) — {formatCOP(p.price, p.currency)}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Cantidad</span>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="py-1 px-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Dcto (%)</span>
            <Input
              type="number"
              min="0"
              max="100"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              className="py-1 px-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={!selectedProductId || adding}
              className="w-full py-2 px-3 flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Añadir
            </Button>
          </div>
        </div>
      </form>

      {/* Associated Products Table */}
      {dealProducts.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <ShoppingBag className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-xs text-gray-500">No hay productos asociados a este trato todavía.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto border border-gray-150 dark:border-gray-700/80 rounded-xl bg-white dark:bg-gray-800/20">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700/60 text-sm">
              <thead className="bg-gray-50/50 dark:bg-gray-800/60 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-center">Cantidad</th>
                  <th className="px-4 py-3 text-right">Precio Unitario</th>
                  <th className="px-4 py-3 text-center">Descuento</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {dealProducts.map((item) => {
                  const finalUnitPrice = item.unitPrice * (1 - item.discount / 100);
                  const totalItem = finalUnitPrice * item.quantity;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/40 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900 dark:text-gray-100">{item.product?.name}</div>
                        {item.product?.sku && <div className="text-[10px] text-gray-400 font-mono">SKU: {item.product.sku}</div>}
                      </td>
                      <td className="px-4 py-3 text-center w-24">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleUpdate(item.id, Number(e.target.value), item.discount)}
                          className="w-16 px-1.5 py-1 text-center bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-sm outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCOP(item.unitPrice, "COP")}
                      </td>
                      <td className="px-4 py-3 text-center w-24">
                        <div className="relative inline-block">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={item.discount}
                            onChange={(e) => handleUpdate(item.id, item.quantity, Number(e.target.value))}
                            className="w-16 pl-1.5 pr-5 py-1 text-center bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-sm outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-gray-100">
                        {formatCOP(totalItem, "COP")}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemove(item.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summation Footer (Enterprise Glassmorphism summary) */}
          <div className="flex justify-end">
            <div className="w-80 bg-gray-50/50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/60 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal:</span>
                <span className="font-semibold">{formatCOP(subtotal, "COP")}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span className="flex items-center gap-1">
                  <Percent className="w-3.5 h-3.5 text-rose-500" /> Descuentos:
                </span>
                <span className="font-semibold text-rose-500">-{formatCOP(totalDiscount, "COP")}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 dark:text-gray-100 border-t border-gray-200 dark:border-gray-700 pt-2 mt-1">
                <span>Total recalculado:</span>
                <span className="text-reply-brand">{formatCOP(total, "COP")}</span>
              </div>
              <div className="text-[10px] text-emerald-500 font-bold flex items-center gap-1.5 pt-1.5 leading-none">
                <ShieldCheck className="w-4 h-4" /> Sincronizado automáticamente con la oportunidad
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
