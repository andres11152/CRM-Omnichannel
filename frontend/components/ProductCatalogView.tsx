import React, { useState, useEffect } from "react";
import { ProductCreationModal } from "./ProductCreationModal";
import { Product } from "../types";
import { toast } from "sonner";
import {
  getProducts,
  createProduct,
  deleteProduct,
} from "../services/productService";
import { ModuleHeader } from "./common/ModuleHeader";
import {
  Package,
  Search,
  Plus,
  Trash2,
  Edit2,
  Tag,
  Layers,
  Info,
  ChevronRight,
  Filter,
  ArrowUpRight,
  ShoppingCart,
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

export const ProductCatalogView: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProducts = async () => {
    try {
      setIsLoading(true);
      const data = await getProducts();
      setProducts(data);
    } catch (error) {
      console.error("Failed to fetch products", error);
      // toast.error("Error cargando productos"); // Optional: depends on error handling policy
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleCreateProduct = async (newProductData: any) => {
    try {
      const createdProduct = await createProduct(newProductData);
      setProducts((prev: Product[]) => [createdProduct, ...prev]);
      // toast success is handled in modal or service? The modal shows success.
      // In modal: toast.success('Producto creado exitosamente');
      // So we don't need duplicate toast here unless modal doesn't do it.
      // Modal calls onSave, assumes sync?
      // Modal currently: onSave(newProduct); toast.success...
      // We should update Modal to async or just fire and forget?
      // Ideally, we wait for creation. But let's keep it simple for now.
      // The modal calls onSave. We can make onSave async in modal but let's just trigger reload or optimistic update.
      // Optimistic is risky if it fails.
      // Let's reload or just prepend. Prepend is better.
    } catch (error) {
      console.error("Error creating product", error);
      toast.error("Error al guardar en base de datos");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Seguro que deseas eliminar este producto?")) return;
    try {
      await deleteProduct(id);
      setProducts((prev: Product[]) =>
        prev.filter((p: Product) => p.id !== id),
      );
      toast.success("Producto eliminado");
    } catch (error) {
      console.error("Error deleting product", error);
      toast.error("Error al eliminar producto");
    }
  };

  const filteredProducts = products.filter(
    (p: Product) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.category || "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const stats = {
    label: "Total Valor",
    value: formatPrice(
      products.reduce(
        (acc: number, p: Product) => acc + (p.price || 0) * (p.stock || 0),
        0,
      ),
      products[0]?.currency || "USD",
    ),
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-hidden">
      <ModuleHeader
        title="Catálogo de Productos"
        description="Gestiona tu inventario de productos y servicios."
        icon={<Package className="w-8 h-8 text-white" />}
        gradient="from-emerald-600 to-teal-600 dark:from-emerald-800 dark:to-teal-800"
        stats={{
          label: "Productos Activos",
          value: products.filter((p: Product) => p.status === "active").length,
        }}
        action={
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors backdrop-blur-sm border border-white/20 font-medium"
          >
            <Plus className="w-5 h-5" />
            Nuevo Producto
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* TOOLBAR */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-20 bg-gray-50/80 dark:bg-reply-bg-dark/80 backdrop-blur-xl py-2">
            <div className="relative group flex-1 max-w-2xl">
              <Search className="w-5 h-5 absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
              <input
                type="text"
                placeholder="Buscar por nombre, SKU o categoría..."
                className="w-full pl-12 pr-6 py-4 bg-white dark:bg-[#202c33] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none font-medium text-gray-900 dark:text-white"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="px-4 py-2 bg-white dark:bg-[#202c33] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {products.length} Items en Inventario
              </div>
            </div>
          </div>

          {/* CONTENT AREA */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-96 bg-white dark:bg-[#1c272f] rounded-[2.5rem] border border-gray-100 dark:border-gray-800 animate-pulse"
                />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-24 bg-white dark:bg-[#1c272f] rounded-[3rem] border border-dashed border-gray-200 dark:border-gray-800 shadow-inner">
              <div className="w-24 h-24 bg-gray-50 dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Package className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">
                Catálogo vacío
              </h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto text-base">
                {searchQuery
                  ? `No encontramos productos que coincidan con "${searchQuery}"`
                  : "Comienza agregando tu primer producto o servicio al catálogo."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-10">
              {filteredProducts.map((product: Product) => (
                <div
                  key={product.id}
                  className="group bg-white dark:bg-[#1c272f] rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden transition-all hover:scale-[1.02] hover:shadow-2xl flex flex-col"
                >
                  {/* Image Section */}
                  <div className="relative h-64 bg-gray-50 dark:bg-gray-900 overflow-hidden">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-200 dark:text-gray-800">
                        <Box className="w-24 h-24" />
                      </div>
                    )}

                    {/* Overlays */}
                    <div className="absolute top-4 left-4 flex gap-2">
                      <span className="px-3 py-1 bg-white/90 dark:bg-[#1c272f]/90 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-widest text-emerald-600 shadow-sm border border-emerald-100/20">
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
                      <div className="bg-white text-emerald-600 px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-2xl flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform">
                        Ver Detalle <ArrowUpRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* Content Section */}
                  <div className="p-8 flex flex-col flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                        {product.sku || "Sin SKU"}
                      </p>
                      <Tag className="w-4 h-4 text-emerald-500" />
                    </div>

                    <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2 group-hover:text-emerald-500 transition-colors">
                      {product.name}
                    </h3>

                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-6 flex-1">
                      {product.description ||
                        "Este producto no tiene una descripción detallada en el catálogo."}
                    </p>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-2xl border border-gray-100 dark:border-gray-800">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1">
                          Precio
                        </p>
                        <p className="text-lg font-black text-gray-900 dark:text-white tracking-tighter leading-none">
                          {formatPrice(product.price || 0, product.currency)}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-2xl border border-gray-100 dark:border-gray-800">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1">
                          Disponibilidad
                        </p>
                        <div className="flex items-center gap-2">
                          {product.type === "Physical" ? (
                            <p
                              className={`text-base font-black tracking-tighter ${product.stock > 0 ? "text-emerald-500" : "text-red-500"}`}
                            >
                              {product.stock > 0
                                ? `${product.stock} units`
                                : "Agotado"}
                            </p>
                          ) : (
                            <p className="text-base font-black text-blue-500 tracking-tighter">
                              Ilimitado
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[1.25rem] font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2">
                        <Edit2 className="w-3.5 h-3.5" /> Editar
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="p-4 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-[1.25rem] hover:bg-red-100 transition-all active:scale-95"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
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
        onClose={() => setIsModalOpen(false)}
        onSave={handleCreateProduct}
      />
    </div>
  );
};
