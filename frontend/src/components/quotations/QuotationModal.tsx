import React, { useState, useEffect } from "react";
import { X, Plus, Trash2, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AxiosError } from "axios";
import { getProducts } from "@/services/productService";
import { createQuotation, Quotation, QuotationItemInput } from "@/services/quotationService";
import { Product } from "@/types";

interface QuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId?: string;
  dealId?: string;
  contactName?: string;
  onCreated?: (quotation: Quotation) => void;
}

export const QuotationModal: React.FC<QuotationModalProps> = ({
  isOpen,
  onClose,
  contactId,
  dealId,
  contactName,
  onCreated,
}) => {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("Propuesta Comercial");
  const [currency, setCurrency] = useState("COP");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Cotización válida por 15 días. Pago a la entrega o según acuerdo.");
  const [validUntil, setValidUntil] = useState("");
  
  const [items, setItems] = useState<QuotationItemInput[]>([
    { description: "", quantity: 1, unitPrice: 0, taxRate: 19, discount: 0 },
  ]);

  useEffect(() => {
    if (isOpen) {
      getProducts()
        .then((data) => setProducts(data))
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems([...items, { description: "", quantity: 1, unitPrice: 0, taxRate: 19, discount: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSelectProduct = (index: number, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      productId: prod.id,
      description: prod.name,
      unitPrice: prod.price,
    };
    setItems(newItems);
  };

  const handleItemChange = <K extends keyof QuotationItemInput>(
    index: number,
    field: K,
    value: QuotationItemInput[K]
  ) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const subtotal = items.reduce((acc, item) => {
    const base = item.quantity * item.unitPrice;
    const desc = (base * (item.discount || 0)) / 100;
    return acc + (base - desc);
  }, 0);

  const totalTax = items.reduce((acc, item) => {
    const base = item.quantity * item.unitPrice;
    const desc = (base * (item.discount || 0)) / 100;
    const sub = base - desc;
    return acc + (sub * (item.taxRate || 0)) / 100;
  }, 0);

  const grandTotal = subtotal + totalTax;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("El título de la cotización es requerido");
      return;
    }
    const validItems = items.filter((i) => i.description.trim() && i.quantity > 0);
    if (validItems.length === 0) {
      toast.error("Agrega al menos un producto o servicio válido");
      return;
    }

    try {
      setLoading(true);
      const created = await createQuotation({
        contactId,
        dealId,
        title,
        currency,
        notes,
        terms,
        validUntil: validUntil || undefined,
        items: validItems,
      });

      toast.success(`Cotización #${created.quoteNumber} creada exitosamente`);
      if (onCreated) onCreated(created);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof AxiosError ? err.response?.data?.message : undefined;
      toast.error(message || "Error al crear la cotización");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white dark:bg-[#111b21] w-full max-w-3xl rounded-3xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-white/10 flex items-center justify-between bg-gray-50/50 dark:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-reply-brand/10 text-reply-brand flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Nueva Cotización / Propuesta</h2>
              {contactName && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Cliente: <span className="font-semibold text-gray-700 dark:text-gray-300">{contactName}</span></p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">
                Título del Documento
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Cotización de Software / Servicios"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1f2c34] text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">
                Moneda
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1f2c34] text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="COP">COP ($)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="MXN">MXN ($)</option>
              </select>
            </div>
          </div>

          {/* Items Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">
                Ítems de la Cotización
              </h3>
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:bg-indigo-100 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar Ítem
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl border border-gray-200/80 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 space-y-3"
                >
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    <div className="md:col-span-5">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                        Producto / Descripción
                      </label>
                      <div className="space-y-1">
                        {products.length > 0 && (
                          <select
                            onChange={(e) => handleSelectProduct(idx, e.target.value)}
                            value={item.productId || ""}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1f2c34] text-xs text-gray-700 dark:text-gray-200 mb-1"
                          >
                            <option value="">-- Catálogo de Productos --</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} - ${p.price.toLocaleString("es-CO")}
                              </option>
                            ))}
                          </select>
                        )}
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                          placeholder="Descripción detallada del servicio o producto"
                          className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1f2c34] text-xs text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                        Cantidad
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, "quantity", parseInt(e.target.value) || 1)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1f2c34] text-xs text-gray-900 dark:text-white text-center"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                        Precio Unit.
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1f2c34] text-xs text-gray-900 dark:text-white text-right"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                        IVA %
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={item.taxRate}
                        onChange={(e) => handleItemChange(idx, "taxRate", parseFloat(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1f2c34] text-xs text-gray-900 dark:text-white text-right"
                      />
                    </div>

                    <div className="md:col-span-1 flex items-center justify-center pt-3">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        disabled={items.length <= 1}
                        className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals Summary Card */}
          <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
              <p>Subtotal: <span className="font-semibold text-gray-900 dark:text-white">{currency} ${subtotal.toLocaleString("es-CO")}</span></p>
              <p>Impuestos (IVA): <span className="font-semibold text-gray-900 dark:text-white">{currency} ${totalTax.toLocaleString("es-CO")}</span></p>
            </div>
            <div className="text-right">
              <span className="text-xs uppercase font-bold text-indigo-600 dark:text-indigo-400 block">Total Cotización</span>
              <span className="text-xl font-black text-indigo-700 dark:text-indigo-300">{currency} ${grandTotal.toLocaleString("es-CO")}</span>
            </div>
          </div>

          {/* Notes & Terms */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">
                Notas Adicionales
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Incluye soporte técnico por 3 meses"
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1f2c34] text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">
                Términos y Condiciones
              </label>
              <textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1f2c34] text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-gray-100 dark:border-white/10 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center gap-2"
            >
              {loading ? (
                <span>Creando...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Generar Cotización</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
