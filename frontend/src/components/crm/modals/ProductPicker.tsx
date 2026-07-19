import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Package, ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Product } from "@/types";
import { API_BASE_URL } from "@/services/apiConfig";

export interface ProductPickerProps {
  onClose: () => void;
  onSelect: (product: Product) => void;
}

export const ProductPicker: React.FC<ProductPickerProps> = ({ onClose, onSelect }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE_URL}/products`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const productsArray = Array.isArray(data.data) ? data.data : [];
          setProducts(
            productsArray.filter(
              (p: Product) => p.status === "active" || !p.status,
            ),
          );
        }
      } catch (error) {
        console.error("Error fetching products:", error);
        toast.error(t("actions.err_products", "Error cargando productos"));
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [t]);

  const formatPrice = (price: number, currency: string) => {
    if (currency === "COP") {
      return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
      }).format(price);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(price);
  };

  return (
    <Modal isOpen onClose={onClose} title={t("actions.product_title", "Catálogo de Productos")} size="md">
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
        <div className="sticky top-0 z-10 bg-white dark:bg-[#1f2c34] pb-2">
           <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl flex items-center gap-3 border border-gray-100 dark:border-white/5">
              <Package className="w-5 h-5 text-purple-500" />
              <p className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                {t("actions.product_desc", "Selecciona un producto para enviar")}
              </p>
           </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin" />
              <Package className="absolute inset-0 m-auto w-5 h-5 text-purple-500 animate-pulse" />
            </div>
            <p className="text-sm font-bold text-gray-400 animate-pulse">{t("actions.loading_catalog", "Cargando catálogo...")}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-gray-400">
               <Package size={32} />
            </div>
            <p className="font-black text-gray-800 dark:text-gray-100">{t("actions.no_products", "No hay productos")}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[200px]">{t("actions.no_products_desc", "Crea productos en el catálogo para verlos aquí.")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 pb-4">
            {products.map((p) => (
              <div
                key={p.id}
                onClick={() => onSelect(p)}
                className="group flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-gray-800/40 border border-gray-100 dark:border-white/5 hover:border-purple-500/50 hover:shadow-xl hover:shadow-purple-500/10 cursor-pointer transition-all active:scale-[0.98]"
              >
                <div className="relative w-20 h-20 shrink-0">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="w-full h-full rounded-xl object-cover shadow-sm bg-gray-100"
                    />
                  ) : (
                    <div className="w-full h-full rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center">
                      <Package className="w-8 h-8 text-purple-400 dark:text-purple-600" />
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/5" />
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-black text-gray-800 dark:text-gray-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">
                    {p.name}
                  </h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1 mb-2 font-medium">
                    {p.description || t("actions.no_desc", "Sin descripción detallada")}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
                      {formatPrice(p.price, p.currency)}
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-purple-500 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
