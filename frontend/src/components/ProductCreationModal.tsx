import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MediaPicker } from "./MediaPicker";
import { uploadMedia } from "@/services/mediaService";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal, ModalButton } from "@/components/ui/Modal";
import { Product } from "@/types";
import { X, ImageIcon, Upload, Info, Package } from "lucide-react";

interface ProductCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (productData: Partial<Product>) => void;
  product?: Product | null;
}

const CATEGORIES_BY_TYPE = {
  Physical: [
    { id: "general", label: "General" },
    { id: "electronics", label: "Electrónica" },
    { id: "clothing", label: "Ropa y Accesorios" },
    { id: "home", label: "Hogar y Oficina" },
    { id: "parts", label: "Repuestos" },
  ],
  Service: [
    { id: "general", label: "General" },
    { id: "consulting", label: "Consultoría" },
    { id: "labor", label: "Mano de Obra" },
    { id: "support", label: "Soporte Técnico" },
    { id: "installation", label: "Instalación" },
    { id: "subscription", label: "Suscripción Recurrente" },
  ],
  Digital: [
    { id: "general", label: "General" },
    { id: "software", label: "Licencia de Software" },
    { id: "ebook", label: "E-book / PDF" },
    { id: "course", label: "Curso Online" },
    { id: "file", label: "Archivo Descargable" },
  ],
};

export const ProductCreationModal: React.FC<ProductCreationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  product,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [type, setType] = useState<"Physical" | "Service" | "Digital">("Physical");
  const [category, setCategory] = useState(CATEGORIES_BY_TYPE.Physical[0].label);
  const [sku, setSku] = useState("");
  const [stock, setStock] = useState("100");
  const [description, setDescription] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state with product prop for edit mode
  useEffect(() => {
    if (isOpen) {
      if (product) {
        setName(product.name || "");
        setPrice(product.price ? product.price.toString() : "");
        setCurrency(product.currency || "USD");
        const prodType = product.type || "Physical";
        setType(prodType);
        setCategory(product.category || CATEGORIES_BY_TYPE[prodType][0].label);
        setSku(product.sku || "");
        setStock(product.stock !== undefined ? product.stock.toString() : "0");
        setDescription(product.description || "");
        setImageUrl(product.imageUrl || null);
        setImagePreview(product.imageUrl || null);
      } else {
        setName("");
        setPrice("");
        setCurrency("USD");
        setType("Physical");
        setCategory(CATEGORIES_BY_TYPE.Physical[0].label);
        setSku("");
        setStock("100");
        setDescription("");
        setImageUrl(null);
        setImagePreview(null);
      }
    }
  }, [product, isOpen]);

  // Update category when type changes
  const handleTypeChange = (newType: "Physical" | "Service" | "Digital") => {
    setType(newType);
    if (newType !== "Physical") setStock("");
    setCategory(CATEGORIES_BY_TYPE[newType][0].label);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      try {
        toast.loading(t("common.loading"));
        const media = await uploadMedia({ file, category: "product" });
        setImageUrl(media.url);
        toast.dismiss();
        toast.success(t("common.success"));
        console.log("[Product] Image uploaded to S3 directly via uploadMedia service:", media.url);
      } catch (error) {
        console.error("Upload error:", error);
        toast.dismiss();
        toast.error(t("common.error"));
      }
    }
  };

  const handleSubmit = async () => {
    if (!name || !price) {
      toast.error(t("common.error"));
      return;
    }

    setIsSaving(true);

    try {
      const finalStock = type === "Physical" ? parseInt(stock) || 0 : 0;
      const finalImageUrl = imageUrl || null;

      const productData: Partial<Product> = {
        name,
        price: parseFloat(price),
        currency,
        category,
        type,
        sku: sku || `SKU-${Date.now()}`,
        stock: finalStock,
        description,
        imageUrl: finalImageUrl || undefined,
        status: "active" as const,
      };

      onSave(productData);
    } catch (error) {
      console.error("Error saving product:", error);
      toast.error(t("crm.products.save_error"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={product ? t("crm.products.edit_product") : t("crm.products.new_product")}
      subtitle={product ? t("crm.products.description") : t("crm.products.empty_description")}
      icon={<Package className="w-5 h-5" />}
      size="xl"
      busy={isSaving}
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose}>
            {t("crm.products.form.cancel")}
          </ModalButton>
          <ModalButton variant="primary" onClick={handleSubmit} loading={isSaving}>
            {isSaving ? t("crm.products.form.saving") : t("crm.products.form.save")}
          </ModalButton>
        </>
      }
    >
        {/* Body */}
        <div className="space-y-6">
          {/* Image Upload */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-reply-text-secondary dark:text-reply-text-secondary-dark tracking-widest">
              {t("crm.products.form.image_label")}
            </label>

            {/* Preview Area */}
            <div className="border-2 border-dashed border-reply-border dark:border-reply-border-dark rounded-2xl p-8 flex flex-col items-center justify-center relative overflow-hidden group min-h-48 bg-reply-bg/10 dark:bg-white/5">
              {imagePreview || imageUrl ? (
                <>
                  <img
                    src={imageUrl || imagePreview || ""}
                    alt="Preview"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <Button
                    onClick={() => {
                      setImagePreview(null);
                      setImageUrl(null);
                    }}
                    variant="danger"
                    className="absolute top-3 right-3 p-2 rounded-full shadow-lg z-10 hover:scale-105 active:scale-95"
                    title={t("common.delete")}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-reply-bg dark:bg-white/5 rounded-full flex items-center justify-center mb-3">
                    <ImageIcon className="w-8 h-8 text-reply-text-secondary/40 dark:text-reply-text-secondary-dark/40" />
                  </div>
                  <span className="text-sm text-reply-text-secondary dark:text-reply-text-secondary-dark font-medium">
                    {t("crm.products.form.image_label")}
                  </span>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                type="button"
                onClick={() => setShowMediaPicker(true)}
                variant="primary"
                className="flex-1 rounded-xl text-xs uppercase tracking-widest py-3 gap-2"
              >
                <ImageIcon className="w-4 h-4" />
                {t("crm.products.form.select_library")}
              </Button>
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                variant="secondary"
                className="rounded-xl text-xs uppercase tracking-widest py-3 gap-2"
              >
                <Upload className="w-4 h-4" />
                {t("crm.products.form.upload_local")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleImageChange}
              />
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-5">
            <Input
              id="product-name"
              label={t("crm.products.form.name_label")}
              placeholder={t("crm.products.form.name_placeholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black uppercase text-reply-text-secondary dark:text-reply-text-secondary-dark tracking-widest mb-1.5">
                  {t("crm.products.price")} <span className="text-rose-500">*</span>
                </label>
                <div className="flex bg-reply-bg/20 dark:bg-white/5 border border-reply-border dark:border-reply-border-dark rounded-xl focus-within:ring-4 focus-within:ring-reply-brand/10 focus-within:border-reply-brand overflow-hidden text-reply-text-primary dark:text-reply-text-primary-dark transition-all">
                  <select
                    className="w-24 px-3 py-2.5 bg-transparent font-bold cursor-pointer outline-none border-r border-reply-border dark:border-reply-border-dark hover:bg-reply-bg dark:hover:bg-reply-bg-dark transition-colors text-sm text-reply-text-primary dark:text-reply-text-primary-dark"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="USD">USD</option>
                    <option value="COP">COP</option>
                    <option value="EUR">EUR</option>
                    <option value="MXN">MXN</option>
                  </select>
                  <div className="relative flex-1 flex items-center">
                    <span className="absolute left-3 text-reply-text-secondary dark:text-reply-text-secondary-dark font-black text-sm">
                      {currency === "EUR" ? "€" : "$"}
                    </span>
                    <input
                      type="number"
                      step="any"
                      className="w-full pl-8 pr-4 py-2.5 bg-transparent outline-none font-bold placeholder:text-reply-text-secondary/40 text-sm h-full"
                      placeholder="0.00"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <Input
                id="product-sku"
                label="SKU"
                placeholder={t("crm.products.form.sku_placeholder")}
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black uppercase text-reply-text-secondary dark:text-reply-text-secondary-dark tracking-widest mb-1.5">
                  {t("crm.products.form.type_label")}
                </label>
                <select
                  className="w-full bg-reply-bg/20 dark:bg-white/5 border border-reply-border dark:border-reply-border-dark rounded-xl py-2.5 px-4 text-sm font-medium transition-all outline-none text-reply-text-primary dark:text-reply-text-primary-dark focus:ring-4 focus:ring-reply-brand/10 focus:border-reply-brand"
                  value={type}
                  onChange={(e) =>
                    handleTypeChange(e.target.value as "Physical" | "Service" | "Digital")
                  }
                >
                  <option value="Physical">{t("crm.products.form.type_physical")}</option>
                  <option value="Service">{t("crm.products.form.type_service")}</option>
                  <option value="Digital">{t("crm.products.form.type_digital")}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-reply-text-secondary dark:text-reply-text-secondary-dark tracking-widest mb-1.5">
                  {t("crm.products.form.category_label")}
                </label>
                <select
                  className="w-full bg-reply-bg/20 dark:bg-white/5 border border-reply-border dark:border-reply-border-dark rounded-xl py-2.5 px-4 text-sm font-medium transition-all outline-none text-reply-text-primary dark:text-reply-text-primary-dark focus:ring-4 focus:ring-reply-brand/10 focus:border-reply-brand"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES_BY_TYPE[type].map((cat) => (
                    <option key={cat.id} value={cat.label}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {type === "Physical" ? (
              <Input
                id="product-stock"
                type="number"
                label={t("crm.products.form.stock_label")}
                placeholder="100"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            ) : (
              <div className="flex items-start gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                <Info className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                    {t("crm.products.form.unlimited_inventory")}
                  </h4>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 leading-relaxed">
                    {t("crm.products.form.unlimited_help")}
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-black uppercase text-reply-text-secondary dark:text-reply-text-secondary-dark tracking-widest mb-1.5">
                {t("crm.products.form.description_label")}
              </label>
              <textarea
                className="w-full bg-reply-bg/20 dark:bg-white/5 border border-reply-border dark:border-reply-border-dark rounded-xl py-2.5 px-4 text-sm font-medium transition-all outline-none text-reply-text-primary dark:text-reply-text-primary-dark focus:ring-4 focus:ring-reply-brand/10 focus:border-reply-brand placeholder:text-reply-text-secondary/40 h-28 resize-none"
                placeholder={t("crm.products.form.description_placeholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        </div>

      {/* MediaPicker Modal */}
      {showMediaPicker && (
        <MediaPicker
          onSelect={(media) => {
            setImageUrl(media.url);
            setImagePreview(media.url);
            setShowMediaPicker(false);
            toast.success(t("common.success"));
          }}
          onClose={() => setShowMediaPicker(false)}
          allowedTypes={["IMAGE"]}
          title={t("crm.products.form.select_library")}
        />
      )}
    </Modal>
  );
};
