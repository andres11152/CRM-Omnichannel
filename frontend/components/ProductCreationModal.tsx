import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { MediaPicker } from './MediaPicker';

interface ProductCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (productData: any) => void;
}

const CATEGORIES_BY_TYPE = {
    Physical: [
        { id: 'general', label: 'General' },
        { id: 'electronics', label: 'Electrónica' },
        { id: 'clothing', label: 'Ropa y Accesorios' },
        { id: 'home', label: 'Hogar y Oficina' },
        { id: 'parts', label: 'Repuestos' }
    ],
    Service: [
        { id: 'general', label: 'General' },
        { id: 'consulting', label: 'Consultoría' },
        { id: 'labor', label: 'Mano de Obra' },
        { id: 'support', label: 'Soporte Técnico' },
        { id: 'installation', label: 'Instalación' },
        { id: 'subscription', label: 'Suscripción Recurrente' }
    ],
    Digital: [
        { id: 'general', label: 'General' },
        { id: 'software', label: 'Licencia de Software' },
        { id: 'ebook', label: 'E-book / PDF' },
        { id: 'course', label: 'Curso Online' },
        { id: 'file', label: 'Archivo Descargable' }
    ]
};

export const ProductCreationModal: React.FC<ProductCreationModalProps> = ({ isOpen, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [type, setType] = useState<'Physical' | 'Service' | 'Digital'>('Physical');
    const [category, setCategory] = useState(CATEGORIES_BY_TYPE.Physical[0].label);
    const [sku, setSku] = useState('');
    const [stock, setStock] = useState('100');
    const [description, setDescription] = useState('');
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null); // ✅ S3 URL from MediaPicker
    const [showMediaPicker, setShowMediaPicker] = useState(false); // ✅ MediaPicker toggle
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Update category when type changes
    const handleTypeChange = (newType: 'Physical' | 'Service' | 'Digital') => {
        setType(newType);
        if (newType !== 'Physical') setStock('');
        // Reset category to the default for the new type to prevent invalid states
        setCategory(CATEGORIES_BY_TYPE[newType][0].label);
    };

    const [isSaving, setIsSaving] = useState(false);

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Show preview immediately
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);

            // Upload to S3 via media endpoint
            try {
                toast.loading('Subiendo imagen...');
                const token = localStorage.getItem('token');
                const formData = new FormData();
                formData.append('file', file);
                formData.append('category', 'product');

                const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
                const res = await fetch(`${API_BASE_URL}/api/media/upload`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });

                if (res.ok) {
                    const data = await res.json();
                    const s3Url = data.data?.media?.url || data.url;
                    setImageUrl(s3Url);
                    toast.dismiss();
                    toast.success('Imagen subida');
                    console.log('[Product] Image uploaded to S3:', s3Url);
                } else {
                    toast.dismiss();
                    toast.error('Error subiendo imagen');
                }
            } catch (error) {
                console.error('Upload error:', error);
                toast.dismiss();
                toast.error('Error de conexión');
            }
        }
    };

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!name || !price) {
            toast.error('Nombre y precio son obligatorios');
            return;
        }

        setIsSaving(true);

        try {
            // CRM Logic: Services and Digital items don't track stock quantity
            const finalStock = type === 'Physical' ? (parseInt(stock) || 0) : 0;

            // ✅ Use imageUrl from MediaPicker (already an S3 URL)
            // If user uploaded locally, imagePreview will be base64 but imageUrl will be null
            // Only use S3 URL from MediaPicker
            const finalImageUrl = imageUrl || null;

            const newProduct = {
                name,
                price: parseFloat(price),
                currency,
                category,
                type,
                sku: sku || `SKU-${Date.now()}`,
                stock: finalStock,
                description,
                imageUrl: finalImageUrl, // ✅ S3 URL from MediaPicker
                status: 'active',
                createdAt: new Date()
            };

            onSave(newProduct);
            onClose();
            toast.success('Producto creado exitosamente');
            
            // Reset form
            setName('');
            setPrice('');
            setCurrency('USD');
            setDescription('');
            setImagePreview(null);
            setImageUrl(null);
            setStock('100');
            
            // Reset type and dependent category
            const defaultType = 'Physical';
            setType(defaultType);
            setCategory(CATEGORIES_BY_TYPE[defaultType][0].label);
        } catch (error) {
            console.error('Error creating product:', error);
            toast.error('Error al crear producto');
        } finally {
            setIsSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex justify-end" role="dialog">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
                onClick={onClose}
            />

            {/* Drawer Panel */}
            <div className="relative w-full max-w-2xl h-full bg-white dark:bg-[#111b21] shadow-2xl flex flex-col transform transition-transform animate-in slide-in-from-right duration-300">
                
                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-[#202c33]">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Nuevo Producto</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Agrega un item a tu catálogo</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Body - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    
                    {/* Image Upload */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-gray-500">Imagen del Producto</label>
                        
                        {/* Preview Area */}
                        <div 
                            className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 flex flex-col items-center justify-center relative overflow-hidden group"
                        >
                            {(imagePreview || imageUrl) ? (
                                <>
                                    <img src={imageUrl || imagePreview || ''} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                                    <button 
                                        onClick={() => { setImagePreview(null); setImageUrl(null); }}
                                        className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg z-10"
                                        title="Quitar imagen"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
                                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    </div>
                                    <span className="text-sm text-gray-500 font-medium">Selecciona una imagen</span>
                                </>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setShowMediaPicker(true)}
                                className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Seleccionar de Biblioteca
                            </button>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="py-2.5 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                Subir
                            </button>
                            <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                        </div>
                    </div>

                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Nombre del Producto <span className="text-red-500">*</span></label>
                            <input 
                                type="text"
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-[#2a3942] border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-gray-800 dark:text-gray-100"
                                placeholder="Ej: Camiseta Premium"
                                value={name}
                                onChange={e => setName(e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Precio <span className="text-red-500">*</span></label>
                                {/* Unified Amount Input Group */}
                                <div className="flex bg-gray-50 dark:bg-[#2a3942] border border-gray-200 dark:border-gray-700 rounded-lg focus-within:ring-2 focus-within:ring-purple-500 overflow-hidden text-gray-800 dark:text-gray-100 transition-shadow">
                                     <select
                                        className="w-24 px-3 py-3 bg-transparent font-bold cursor-pointer outline-none border-r border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                                        value={currency}
                                        onChange={e => setCurrency(e.target.value)}
                                        title="Moneda"
                                     >
                                        <option value="USD">USD</option>
                                        <option value="COP">COP</option>
                                        <option value="EUR">EUR</option>
                                        <option value="MXN">MXN</option>
                                     </select>
                                    <div className="relative flex-1 flex items-center">
                                        <div className="absolute left-3 pointer-events-none">
                                            <span className="text-gray-400 dark:text-gray-500 font-bold text-lg">
                                                {currency === 'EUR' ? '€' : '$'}
                                            </span>
                                        </div>
                                        <input 
                                            type="number"
                                            className="w-full pl-8 pr-4 py-3 bg-transparent outline-none font-bold placeholder-gray-400 dark:placeholder-gray-600 h-full"
                                            placeholder="0.00"
                                            value={price}
                                            onChange={e => setPrice(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">SKU</label>
                                <input 
                                    type="text"
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-[#2a3942] border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-gray-800 dark:text-gray-100"
                                    placeholder="Auto"
                                    value={sku}
                                    onChange={e => setSku(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Tipo de Producto</label>
                                <select 
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-[#2a3942] border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-gray-800 dark:text-gray-100 appearance-none"
                                    value={type}
                                    onChange={e => handleTypeChange(e.target.value as any)}
                                >
                                    <option value="Physical">Bien Físico</option>
                                    <option value="Service">Servicio Profesional</option>
                                    <option value="Digital">Producto Digital</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Categoría</label>
                                <select 
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-[#2a3942] border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-gray-800 dark:text-gray-100 appearance-none transition-all duration-300"
                                    value={category}
                                    onChange={e => setCategory(e.target.value)}
                                >
                                    {CATEGORIES_BY_TYPE[type].map((cat) => (
                                        <option key={cat.id} value={cat.label}>{cat.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {type === 'Physical' ? (
                             <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Stock Disponible</label>
                                <input 
                                    type="number"
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-[#2a3942] border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-gray-800 dark:text-gray-100"
                                    value={stock}
                                    onChange={e => setStock(e.target.value)}
                                    placeholder="Cantidad disponible..."
                                />
                            </div>
                        ) : (
                            <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/30">
                                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <div>
                                    <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300">Inventario Ilimitado</h4>
                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                        Los {type === 'Service' ? 'servicios' : 'productos digitales'} no requieren gestión de stock en el sistema.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Descripción</label>
                            <textarea 
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-[#2a3942] border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-gray-800 dark:text-gray-100 h-24 resize-none"
                                placeholder={`Describe tu ${type === 'Physical' ? 'producto' : 'servicio'}...`}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                            />
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#202c33] flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={isSaving}
                        className="px-6 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold shadow-lg shadow-green-500/30 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Guardando...' : 'Guardar Producto'}
                    </button>
                </div>
            </div>

            {/* MediaPicker Modal */}
            {showMediaPicker && (
                <MediaPicker
                    onSelect={(media) => {
                        setImageUrl(media.url);
                        setImagePreview(media.url);
                        setShowMediaPicker(false);
                        toast.success('Imagen seleccionada');
                    }}
                    onClose={() => setShowMediaPicker(false)}
                    allowedTypes={['IMAGE']}
                    title="Seleccionar Imagen del Producto"
                />
            )}
        </div>,
        document.body
    );
};
