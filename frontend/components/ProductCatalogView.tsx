import React, { useState, useEffect } from 'react';
import { ProductCreationModal } from './ProductCreationModal';
import { Product } from '../types';
import { toast } from 'sonner';
import { getProducts, createProduct, deleteProduct } from '../services/productService';

const formatPrice = (price: number, currency: string) => {
    let locale = 'en-US';
    let fractionDigits = 2;

    if (currency === 'COP') {
        locale = 'es-CO';
        fractionDigits = 0;
    } else if (currency === 'EUR') {
        locale = 'es-ES';
    } else if (currency === 'MXN') {
        locale = 'es-MX';
    }

    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits
        }).format(price);
    } catch (error) {
        return `${currency} ${price}`;
    }
};

export const ProductCatalogView: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
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
            setProducts(prev => [createdProduct, ...prev]);
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
            setProducts(prev => prev.filter(p => p.id !== id));
            toast.success("Producto eliminado");
        } catch (error) {
            console.error("Error deleting product", error);
            toast.error("Error al eliminar producto");
        }
    };

    const filteredProducts = products.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (p.sku || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="h-full flex flex-col bg-gray-50 dark:bg-[#0b141a]">
            {/* Header Toolbar */}
            <div className="bg-white dark:bg-[#202c33] border-b border-gray-200 dark:border-gray-700 p-6 flex justify-between items-center shadow-sm z-10">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Catálogo de Productos</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Gestiona tu inventario de productos y servicios.</p>
                </div>
                
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-lg shadow-green-600/20 active:scale-95 transition-all flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Nuevo Producto
                </button>
            </div>

            {/* Filter Bar */}
            <div className="px-6 py-4 bg-gray-100 dark:bg-[#111b21] border-b border-gray-200 dark:border-gray-800 flex items-center gap-4">
               <div className="relative flex-1 max-w-lg">
                    <span className="absolute left-3 top-2.5 text-gray-400">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </span>
                    <input 
                        type="text" 
                        placeholder="Buscar por nombre, SKU o categoría..." 
                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-[#2a3942] border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none dark:text-white"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
               </div>
               {/* Filters (Mock) */}
               <select className="px-4 py-2 bg-white dark:bg-[#2a3942] border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white outline-none">
                   <option>Todas las Categorías</option>
                   <option>Servicios</option>
                   <option>Físicos</option>
               </select>
               <select className="px-4 py-2 bg-white dark:bg-[#2a3942] border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white outline-none">
                   <option>Estado: Todos</option>
                   <option>Activos</option>
                   <option>Borradores</option>
               </select>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-auto p-6">
                
                {filteredProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <svg className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                        <p className="text-lg font-medium">No se encontraron productos</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredProducts.map(product => (
                            <div key={product.id} className="bg-white dark:bg-[#202c33] rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-xl transition-shadow group flex flex-col">
                                {/* Image / Thumbnail */}
                                <div className="h-48 bg-gray-100 dark:bg-gray-800 relative overflow-hidden">
                                     {product.imageUrl ? (
                                         <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                     ) : (
                                         <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
                                             <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                         </div>
                                     )}
                                     <div className={`absolute top-3 right-3 px-2 py-1 rounded text-xs font-bold uppercase ${product.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                         {product.status === 'active' ? 'Activo' : 'Borrador'}
                                     </div>
                                </div>

                                {/* Content */}
                                <div className="p-5 flex-1 flex flex-col">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-xs font-semibold text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-300 px-2 py-0.5 rounded uppercase tracking-wider">
                                            {product.category}
                                        </span>
                                        <span className="text-xs text-gray-500">{product.sku}</span>
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 line-clamp-1" title={product.name}>{product.name}</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2 flex-1">{product.description || 'Sin descripción'}</p>
                                    
                                    <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700 mt-auto">
                                        <div>
                                             <p className="text-xs text-gray-500">Precio</p>
                                             <p className="text-xl font-bold text-gray-800 dark:text-white">
                                                {formatPrice(product.price, product.currency)}
                                             </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-500">Stock</p>
                                            {product.type === 'Physical' ? (
                                                <p className={`font-semibold ${product.stock > 0 ? 'text-gray-700 dark:text-gray-300' : 'text-red-500'}`}>
                                                    {product.stock > 0 ? product.stock : 'Agotado'}
                                                </p>
                                            ) : (
                                                <span className="text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300 px-2 py-0.5 rounded">
                                                    Ilimitado
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Actions Overlay (Hover) - Optional cleanup trigger */}
                                <div className="bg-gray-50 dark:bg-[#111b21] p-3 flex justify-between items-center border-t border-gray-200 dark:border-gray-700">
                                    <button className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400">Editar</button>
                                    <button onClick={() => handleDelete(product.id)} className="text-sm font-medium text-red-500 hover:text-red-700">Eliminar</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}


            </div>

            <ProductCreationModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                onSave={handleCreateProduct} 
            />
        </div>
    );
};
