import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ProductCreationModal } from "./ProductCreationModal";
import { Product } from "@/types";
import { toast } from "sonner";
import { useModal } from "@/context/ModalContext";
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/services/productService";
import { ModuleHeader } from "./common/ModuleHeader";
import { getModuleCache, setModuleCache } from "@/lib/moduleCache";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Package,
  Search,
  Plus,
  Trash2,
  Edit2,
  Tag,
  ArrowUpRight,
  Box,
} from "lucide-react";

const formatPrice = (price: number, currency: string) => {
  let locale = "en-US";
  let fractionDigits = 2;

  if (currency === "COP") {
    locale = "es-CO";
    fractionDigits = 0;
  } else if (currency === "EUR") {
    locale = "es-ES";
  } else if (currency === "MXN") {
    locale = "es-MX";
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(price);
  } catch (error) {
    return `${currency} ${price}`;
  }
};

const PRODUCTS_CACHE_KEY = "products:default-view";

export const ProductCatalogView: React.FC = () => {
  const { t } = useTranslation();
  const { confirm } = useModal();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Stale-while-revalidate: instant render on module re-entry, silent refetch behind it.
  const cachedProducts = getModuleCache<Product[]>(PRODUCTS_CACHE_KEY);
  const [products, setProducts] = useState<Product[]>(cachedProducts ?? []);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(!cachedProducts);

  const fetchProducts = async () => {
    if (!getModuleCache<Product[]>(PRODUCTS_CACHE_KEY)) {
      setIsLoading(true);
    }
    try {
      const data = await getProducts();
      setProducts(data);
      setModuleCache<Product[]>(PRODUCTS_CACHE_KEY, data);
    } catch (error) {
      console.error("Failed to fetch products", error);
      toast.error(t("crm.products.save_error"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleCreateOrUpdateProduct = async (newProductData: Partial<Product>) => {
    try {
      if (selectedProduct) {
        // Edit mode
        const updated = await updateProduct(selectedProduct.id, newProductData);
        setProducts((prev: Product[]) =>
          prev.map((p: Product) => (p.id === selectedProduct.id ? updated : p))
        );
        toast.success(t("crm.products.save_success"));
      } else {
        // Create mode
        const created = await createProduct(newProductData);
        setProducts((prev: Product[]) => [created, ...prev]);
        toast.success(t("crm.products.save_success"));
      }
      handleModalClose();
    } catch (error) {
      console.error("Error saving product", error);
      toast.error(t("crm.products.save_error"));
    }
  };

  const handleEditClick = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleNewClick = () => {
    setSelectedProduct(null);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedProduct(null);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: t("crm.products.delete_confirm"),
      message: "Esta acción no se puede deshacer.",
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteProduct(id);
      setProducts((prev: Product[]) =>
        prev.filter((p: Product) => p.id !== id)
      );
      toast.success(t("crm.products.delete_success"));
    } catch (error) {
      console.error("Error deleting product", error);
      toast.error(t("crm.products.delete_error"));
    }
  };

  const filteredProducts = products.filter(
    (p: Product) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.category || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-hidden">
      <ModuleHeader
        title={t("crm.products.title")}
        description={t("crm.products.description")}
        icon={<Package className="w-8 h-8 text-white" strokeWidth={1.5} />}
        gradient="from-emerald-600 to-teal-600 dark:from-emerald-800 dark:to-teal-800"
        stats={{
          label: t("crm.products.active_products"),
          value: products.filter((p: Product) => p.status === "active").length,
        }}
        action={
          <Button
            onClick={handleNewClick}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10 hover:border-white/30 backdrop-blur-sm h-10 px-4 gap-2 font-bold bg-white/10"
          >
            <Plus className="w-4 h-4" />
            {t("crm.products.new_product")}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* TOOLBAR */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-20 bg-reply-bg/80 dark:bg-reply-bg-dark/80 backdrop-blur-xl py-2">
            <div className="flex-1 max-w-2xl">
              <Input
                type="text"
                placeholder={t("crm.products.search_placeholder")}
                icon={<Search className="w-5 h-5" />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="px-4 py-2.5 bg-white dark:bg-reply-panel-dark rounded-xl border border-reply-border dark:border-reply-border-dark shadow-sm text-[10px] font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {products.length} {t("crm.products.items_in_inventory")}
              </div>
            </div>
          </div>

          {/* CONTENT AREA */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-96 bg-white dark:bg-reply-surface-dark rounded-[2rem] border border-reply-border dark:border-reply-border-dark animate-pulse"
                />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-24 bg-white dark:bg-reply-surface-dark rounded-[2rem] border border-dashed border-reply-border dark:border-reply-border-dark shadow-inner">
              <div className="w-24 h-24 bg-reply-bg dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Package className="w-10 h-10 text-reply-text-secondary/40 dark:text-reply-text-secondary-dark/40" />
              </div>
              <h3 className="text-2xl font-black text-reply-text-primary dark:text-reply-text-primary-dark mb-2">
                {searchQuery
                  ? t("crm.products.empty_title")
                  : t("crm.products.empty_title")}
              </h3>
              <p className="text-reply-text-secondary dark:text-reply-text-secondary-dark max-w-sm mx-auto text-base">
                {searchQuery
                  ? t("crm.products.empty_search", { query: searchQuery })
                  : t("crm.products.empty_description")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-10">
              {filteredProducts.map((product: Product) => (
                <div
                  key={product.id}
                  className="group bg-white dark:bg-reply-surface-dark rounded-[2.5rem] border border-reply-border dark:border-reply-border-dark shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden transition-all hover:scale-[1.02] hover:shadow-2xl flex flex-col"
                >
                  {/* Image Section */}
                  <div className="relative h-64 bg-reply-bg dark:bg-gray-900 overflow-hidden">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-reply-text-secondary/30 dark:text-reply-text-secondary-dark/20">
                        <Box className="w-24 h-24" />
                      </div>
                    )}

                    {/* Overlays */}
                    <div className="absolute top-4 left-4 flex gap-2">
                      <span className="px-3 py-1 bg-white/90 dark:bg-reply-surface-dark/90 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 shadow-sm border border-emerald-100/20">
                        {product.category}
                      </span>
                    </div>

                    <div className="absolute top-4 right-4">
                      <div
                        className={`w-3 h-3 rounded-full shadow-lg ${product.status === "active" ? "bg-emerald-500 shadow-emerald-500/50" : "bg-gray-400"}`}
                      />
                    </div>

                    {/* Edit Hint */}
                    <div className="absolute inset-0 bg-emerald-600/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <div className="bg-white dark:bg-reply-panel-dark text-emerald-600 dark:text-emerald-400 px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-2xl flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform">
                        {t("crm.products.view_detail")} <ArrowUpRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* Content Section */}
                  <div className="p-8 flex flex-col flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-[10px] font-black text-reply-text-secondary/40 dark:text-reply-text-secondary-dark/40 uppercase tracking-[0.2em]">
                        {product.sku || "Sin SKU"}
                      </p>
                      <Tag className="w-4 h-4 text-emerald-500" />
                    </div>

                    <h3 className="text-xl font-black text-reply-text-primary dark:text-reply-text-primary-dark mb-2 group-hover:text-emerald-500 transition-colors">
                      {product.name}
                    </h3>

                    <p className="text-sm text-reply-text-secondary dark:text-reply-text-secondary-dark line-clamp-2 mb-6 flex-1">
                      {product.description || t("crm.products.no_description")}
                    </p>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-reply-bg dark:bg-white/5 p-3 rounded-2xl border border-reply-border dark:border-reply-border-dark">
                        <p className="text-[10px] font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-tighter mb-1">
                          {t("crm.products.price")}
                        </p>
                        <p className="text-lg font-black text-reply-text-primary dark:text-reply-text-primary-dark tracking-tighter leading-none">
                          {formatPrice(product.price || 0, product.currency)}
                        </p>
                      </div>
                      <div className="bg-reply-bg dark:bg-white/5 p-3 rounded-2xl border border-reply-border dark:border-reply-border-dark">
                        <p className="text-[10px] font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-tighter mb-1">
                          {t("crm.products.availability")}
                        </p>
                        <div className="flex items-center gap-2">
                          {product.type === "Physical" ? (
                            <p
                              className={`text-base font-black tracking-tighter ${product.stock > 0 ? "text-emerald-500" : "text-rose-500"}`}
                            >
                              {product.stock > 0
                                ? `${product.stock} units`
                                : t("crm.products.out_of_stock")}
                            </p>
                          ) : (
                            <p className="text-base font-black text-emerald-500 tracking-tighter">
                              {t("crm.products.unlimited")}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleEditClick(product)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/10 text-white rounded-[1.25rem] text-xs uppercase tracking-widest py-3 gap-2"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> {t("common.edit")}
                      </Button>
                      <Button
                        onClick={() => handleDelete(product.id)}
                        variant="ghost"
                        className="p-3.5 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-[1.25rem] hover:bg-rose-100 hover:text-rose-600 active:scale-95 transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ProductCreationModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSave={handleCreateOrUpdateProduct}
        product={selectedProduct}
      />
    </div>
  );
};
