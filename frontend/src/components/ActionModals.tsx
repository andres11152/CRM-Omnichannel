import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { 
  DollarSign, 
  CreditCard, 
  Tag, 
  Wallet, 
  CheckCircle2, 
  BadgeDollarSign,
  AlertCircle,
  Mail,
  Phone,
  MapPin,
  IdCard,
  UserSquare2,
  Fingerprint,
  FileCheck,
  Calendar,
  Clock,
  Send,
  Package,
  ArrowRight,
  Info,
  Save,
  Loader2,
  Check,
  Plus,
  Trash2,
  Pencil,
  X,
  Search,
  Building2,
} from "lucide-react";
import { companyService, SuggestedField, CompanySettings } from "../services/companyService";
import { Product } from "../types";
import { API_BASE_URL } from "@/services/apiConfig";
import { useTranslation } from "react-i18next";
import { getProperties } from "@/services/propertyService";
import type { Property } from "@/types/property.types";
import { formatCOP, STATUS_COLORS } from "@/types/property.types";
import { usePropertyLabels } from "@/hooks/usePropertyLabels";

// --- Shared Components ---
const ModalBackdrop: React.FC<{
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}> = ({ onClose, children, title }) => {
  return (
    <Modal isOpen onClose={onClose} title={title} size="md">
      {children}
    </Modal>
  );
};

// --- 1. Schedule Modal ---
export const ScheduleModal: React.FC<{
  onClose: () => void;
  onConfirm: (date: Date, message: string) => void;
}> = ({ onClose, onConfirm }) => {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");
  const { t } = useTranslation();

  const handleConfirm = () => {
    if (!date || !time) return toast.error(t("actions.err_date_time", "Selecciona fecha y hora"));
    if (!message.trim()) return toast.error(t("actions.err_msg", "Escribe el mensaje a programar"));

    const scheduledDate = new Date(`${date}T${time}`);
    if (scheduledDate < new Date())
      return toast.error(t("actions.err_future", "La fecha debe ser futura"));

    onConfirm(scheduledDate, message);
  };

  return (
    <ModalBackdrop onClose={onClose} title={t("actions.schedule_title", "Programación Enterprise")}>
      <div className="space-y-5">
        <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-start gap-3 border border-indigo-100 dark:border-indigo-500/20">
          <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5" />
          <p className="text-[12px] text-indigo-800 dark:text-indigo-200 font-medium">
            {t("actions.schedule_desc", "El sistema procesará y enviará este mensaje automáticamente a través de la API oficial de WhatsApp en el momento exacto programado.")}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase ml-1">
            <Send className="w-3.5 h-3.5" />
            {t("actions.message_content", "Contenido del Mensaje")}
          </div>
          <textarea
            className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-white/5 focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-32 text-sm transition-all shadow-inner"
            placeholder={t("actions.message_placeholder", "Escribe aquí el mensaje que deseas programar...")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase ml-1">
              <Calendar className="w-3.5 h-3.5" />
              {t("actions.send_date", "Fecha de Envío")}
            </div>
            <input
              type="date"
              className="w-full p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-white/5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase ml-1">
              <Clock className="w-3.5 h-3.5" />
              {t("actions.local_time", "Hora Local")}
            </div>
            <input
              type="time"
              className="w-full p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-white/5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>

        <button
          onClick={handleConfirm}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black transition-all shadow-lg shadow-indigo-500/30 mt-2 flex items-center justify-center gap-2 group active:scale-[0.98]"
        >
          <Calendar className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          {t("actions.schedule_btn", "PROGRAMAR ENVÍO OFICIAL")}
        </button>
      </div>
    </ModalBackdrop>
  );
};

// --- 2. Product Picker ---

export const ProductPicker: React.FC<{
  onClose: () => void;
  onSelect: (product: Product) => void;
}> = ({ onClose, onSelect }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  React.useEffect(() => {
    const fetchProducts = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE_URL}/products`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          // API returns { status: 'success', data: [...products] }
          const productsArray = Array.isArray(data.data) ? data.data : [];
          // Filter only active products on frontend
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
  }, []);

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
    <ModalBackdrop onClose={onClose} title={t("actions.product_title", "Catálogo de Productos")}>
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
    </ModalBackdrop>
  );
};

// --- 2b. Property Picker ---

export const PropertyPicker: React.FC<{
  onClose: () => void;
  onSelect: (property: Property) => void;
}> = ({ onClose, onSelect }) => {
  const [query, setQuery] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();
  const { STATUS_LABELS } = usePropertyLabels();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await getProperties({ q: query || undefined, limit: 20, sort: "newest" });
        if (cancelled) return;
        // Los borradores no están listos para mostrarse a un cliente.
        setProperties(res.items.filter((p) => p.status !== "BORRADOR"));
      } catch (error) {
        if (!cancelled) {
          console.error("Error fetching properties:", error);
          toast.error(t("actions.err_properties", "Error cargando inmuebles"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <ModalBackdrop onClose={onClose} title={t("actions.property_title", "Catálogo de Inmuebles")}>
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
        <div className="sticky top-0 z-10 bg-white dark:bg-[#1f2c34] pb-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("actions.property_search_placeholder", "Buscar por título, ciudad, barrio, referencia…")}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-white/5 focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <Building2 className="absolute inset-0 m-auto w-5 h-5 text-indigo-500 animate-pulse" />
            </div>
            <p className="text-sm font-bold text-gray-400 animate-pulse">{t("actions.loading_catalog", "Cargando catálogo...")}</p>
          </div>
        ) : properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-gray-400">
              <Building2 size={32} />
            </div>
            <p className="font-black text-gray-800 dark:text-gray-100">{t("actions.no_properties", "No hay inmuebles")}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[220px]">
              {t("actions.no_properties_desc", "Ajusta la búsqueda o crea inmuebles en el módulo de Propiedades.")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 pb-4">
            {properties.map((p) => {
              const cover = p.images.find((img) => img.isCover) || p.images[0];
              const location = [p.neighborhood, p.city].filter(Boolean).join(", ");
              return (
                <div
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className="group flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-gray-800/40 border border-gray-100 dark:border-white/5 hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/10 cursor-pointer transition-all active:scale-[0.98]"
                >
                  <div className="relative w-20 h-20 shrink-0">
                    {cover ? (
                      <img
                        src={cover.url}
                        alt={p.title}
                        className="w-full h-full rounded-xl object-cover shadow-sm bg-gray-100"
                      />
                    ) : (
                      <div className="w-full h-full rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center">
                        <Building2 className="w-8 h-8 text-indigo-400 dark:text-indigo-600" />
                      </div>
                    )}
                    <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4 className="font-black text-gray-800 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                        {p.title}
                      </h4>
                      <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide ${STATUS_COLORS[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1 mb-2 font-medium">
                      {location || t("actions.no_location", "Ubicación sin especificar")}
                      {p.reference ? ` · Ref. ${p.reference}` : ""}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
                        {formatCOP(p.price, p.currency)}
                      </span>
                      <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModalBackdrop>
  );
};

// --- 3. Payment Creator ---
export const PaymentCreator: React.FC<{
  onClose: () => void;
  onCreate: (amount: string, concept: string, currency: string) => void;
}> = ({ onClose, onCreate }) => {
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [currency, setCurrency] = useState("COP");
  const [isFocused, setIsFocused] = useState(false);
  const { t } = useTranslation();

  const quickAmounts = currency === "COP" 
    ? ["50000", "100000", "200000", "500000"]
    : ["10", "20", "50", "100"];

  const handleGenerate = () => {
    if (!amount || parseFloat(amount) <= 0) return toast.error(t("actions.err_amount", "Ingresa un monto válido"));
    const formattedAmount = new Intl.NumberFormat(currency === "COP" ? "es-CO" : "en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0
    }).format(parseFloat(amount));

    onCreate(amount, concept || t("actions.pro_services", "Servicios Profesionales"), currency);
  };

  return (
    <ModalBackdrop onClose={onClose} title={t("actions.payment_title", "Generar Cobro Enterprise")}>
      <div className="space-y-6">
        {/* Market Selector / Currency Tabs */}
        <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
          <button
            onClick={() => setCurrency("COP")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${
              currency === "COP" 
                ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm" 
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Wallet className="w-4 h-4" />
            {t("actions.market_colombia", "Mercado Colombia (COP)")}
          </button>
          <button
            onClick={() => setCurrency("USD")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${
              currency === "USD" 
                ? "bg-white dark:bg-gray-700 text-green-600 dark:text-green-400 shadow-sm" 
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <DollarSign className="w-4 h-4" />
            {t("actions.dollars", "Dólares (USD)")}
          </button>
        </div>

        {/* Big Amount Input */}
        <div className={`relative transition-all duration-300 rounded-2xl p-6 border-2 ${
          isFocused ? "border-indigo-500 bg-indigo-50/30 dark:bg-indigo-500/5 shadow-inner" : "border-gray-100 dark:border-reply-border-dark bg-gray-50/50 dark:bg-gray-800/30"
        }`}>
          <div className="flex flex-col items-center justify-center gap-2">
             <span className={`text-sm font-bold uppercase tracking-widest ${currency === "COP" ? "text-indigo-500" : "text-green-500"}`}>
               {t("actions.total_amount", "Monto Total")}
             </span>
             <div className="flex items-center gap-1">
                <span className="text-2xl font-light text-gray-400">
                  {currency === "USD" ? "$" : "$"}
                </span>
                <input
                  type="number"
                  placeholder="0"
                  autoFocus
                  className="w-full max-w-[200px] text-5xl font-black bg-transparent outline-none text-center placeholder:text-gray-300 dark:placeholder:text-gray-700"
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
             </div>
             {currency === "COP" && amount && (
               <span className="text-[10px] text-gray-400 font-medium">
                 {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(parseFloat(amount) || 0)}
               </span>
             )}
          </div>
        </div>

        {/* Quick Selections */}
        <div className="grid grid-cols-4 gap-2">
          {quickAmounts.map(val => (
            <button
              key={val}
              onClick={() => setAmount(val)}
              className="py-2 px-1 text-[11px] font-bold border border-gray-200 dark:border-white/10 rounded-lg hover:bg-indigo-500 hover:text-white hover:border-indigo-500 transition-all dark:text-gray-400"
            >
              +{currency === "USD" ? "$" : ""}{parseInt(val).toLocaleString()}
            </button>
          ))}
        </div>

        {/* Concept Input */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase ml-1">
            <Tag className="w-3 h-3" />
            {t("actions.payment_ref", "Referencia de Pago")}
          </div>
          <div className="relative group">
            <input
              type="text"
              placeholder={t("actions.payment_placeholder", "Ej: Mensualidad SaaS, Servicios Cloud...")}
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-reply-border-dark focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
            />
            <Wallet className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
          </div>
        </div>

        {/* Security / Enterprise Badge */}
        <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl border border-emerald-100 dark:border-emerald-500/20">
          <div className="p-2 bg-emerald-500 text-white rounded-lg">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 leading-none">{t("actions.secure_link", "Link de Pago Seguro")}</p>
            <p className="text-[10px] text-emerald-600/70 dark:text-emerald-500/70 mt-1">{t("actions.secure_desc", "Soporta Tarjetas, PSE y Nequi/Daviplata")}</p>
          </div>
          <BadgeDollarSign className="ml-auto w-5 h-5 text-emerald-500 opacity-30" />
        </div>

        <button
          onClick={handleGenerate}
          className={`w-full py-4 rounded-xl font-black text-white transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 group overflow-hidden relative ${
            currency === "COP" 
              ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/30" 
              : "bg-green-600 hover:bg-green-700 shadow-green-500/30"
          }`}
        >
          <CreditCard className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          {t("actions.generate_payment_btn", "GENERAR LINK DE PAGO")} {currency}
        </button>
      </div>
    </ModalBackdrop>
  );
};

// --- 4. Data Request ---

const DEFAULT_FIELDS = [
  { id: "email", label: "Correo Electrónico", icon: Mail, color: "bg-blue-500" },
  { id: "phone", label: "Número de Teléfono", icon: Phone, color: "bg-emerald-500" },
  { id: "location", label: "Ubicación GPS", icon: MapPin, color: "bg-rose-500" },
  { id: "id_doc", label: "Documento Identidad", icon: IdCard, color: "bg-indigo-500" },
  { id: "fiscal", label: "Datos Fiscales / RUT", icon: FileCheck, color: "bg-amber-500" },
  { id: "kyc", label: "Validación KYC", icon: Fingerprint, color: "bg-purple-500" },
];

const ICON_MAP: Record<string, React.ElementType> = {
  Mail, Phone, MapPin, IdCard, FileCheck, Fingerprint, Tag
};

export const DataRequestPicker: React.FC<{
  onClose: () => void;
  onConfirm: (fields: string[]) => void;
}> = ({ onClose, onConfirm }) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [suggestedFields, setSuggestedFields] = useState<SuggestedField[]>(DEFAULT_FIELDS.map(f => ({ ...f, iconName: f.id })));
  const [newCustomField, setNewCustomField] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Premium Enterprise State Hooks
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);

  const { t } = useTranslation();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings: CompanySettings = await companyService.getSettings();
      if (settings?.dataRequest?.suggestedFields && settings.dataRequest.suggestedFields.length > 0) {
        // Map stored fields to include icons if they match defaults
        const mapped: SuggestedField[] = settings.dataRequest.suggestedFields.map((f: SuggestedField) => ({
          ...f,
          icon: f.iconName ? (ICON_MAP[f.iconName] || Tag) : Tag
        }));
        setSuggestedFields(mapped);
      }
    } catch (error) {
      console.error("Failed to load data request settings", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelection = (label: string) => {
    setSelectedIds(prev => 
      prev.includes(label) ? prev.filter(i => i !== label) : [...prev, label]
    );
  };

  const addCustomField = () => {
    if (!newCustomField.trim()) return;
    if (!customFields.includes(newCustomField.trim())) {
      setCustomFields([...customFields, newCustomField.trim()]);
      setSelectedIds([...selectedIds, newCustomField.trim()]);
    }
    setNewCustomField("");
  };

  const saveToConfig = async (label: string) => {
    setIsSaving(true);
    try {
      const newField = { 
        id: `custom_${Date.now()}`, 
        label, 
        iconName: "Tag", 
        color: "bg-purple-500" 
      };
      
      const updatedFields = [...suggestedFields.map(f => ({
        id: f.id,
        label: f.label,
        iconName: f.iconName || "Tag",
        color: f.color
      })), newField];

      await companyService.updateSettings({
        dataRequest: { suggestedFields: updatedFields }
      });
      
      toast.success(t("actions.field_saved", "Campo guardado"));
      setCustomFields(prev => prev.filter(f => f !== label));
      setSuggestedFields([...suggestedFields, { ...newField, icon: Tag }]);
    } catch (error) {
      toast.error(t("actions.err_save_config", "Error al guardar"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async (fieldId: string) => {
    if (!editingLabel.trim()) {
      toast.error(t("actions.err_empty_field", "El nombre del campo no puede estar vacío"));
      return;
    }

    const isDuplicate = suggestedFields.some(
      f => f.id !== fieldId && f.label.toLowerCase() === editingLabel.trim().toLowerCase()
    );
    if (isDuplicate) {
      toast.error(t("actions.err_duplicate_field", "Ya existe un campo con este nombre"));
      return;
    }

    setIsSaving(true);
    try {
      const oldField = suggestedFields.find(f => f.id === fieldId);
      const oldLabel = oldField ? oldField.label : "";

      const updatedFields = suggestedFields.map(f => {
        if (f.id === fieldId) {
          return {
            id: f.id,
            label: editingLabel.trim(),
            iconName: f.iconName || "Tag",
            color: f.color || "bg-purple-500"
          };
        }
        return {
          id: f.id,
          label: f.label,
          iconName: f.iconName || "Tag",
          color: f.color
        };
      });

      await companyService.updateSettings({
        dataRequest: { suggestedFields: updatedFields }
      });

      setSuggestedFields(prev => prev.map(f => {
        if (f.id === fieldId) {
          return { ...f, label: editingLabel.trim() };
        }
        return f;
      }));

      if (oldLabel && selectedIds.includes(oldLabel)) {
        setSelectedIds(prev => prev.map(lbl => lbl === oldLabel ? editingLabel.trim() : lbl));
      }

      toast.success(t("actions.field_updated", "Campo actualizado"));
      setEditingFieldId(null);
    } catch (error) {
      toast.error(t("actions.err_save_config", "Error al guardar"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    setIsSaving(true);
    try {
      const fieldToDelete = suggestedFields.find(f => f.id === fieldId);
      const labelToDelete = fieldToDelete ? fieldToDelete.label : "";

      const updatedFields = suggestedFields
        .filter(f => f.id !== fieldId)
        .map(f => ({
          id: f.id,
          label: f.label,
          iconName: f.iconName || "Tag",
          color: f.color
        }));

      await companyService.updateSettings({
        dataRequest: { suggestedFields: updatedFields }
      });

      setSuggestedFields(prev => prev.filter(f => f.id !== fieldId));
      if (labelToDelete) {
        setSelectedIds(prev => prev.filter(lbl => lbl !== labelToDelete));
      }

      toast.success(t("actions.field_deleted", "Campo eliminado"));
      setDeletingFieldId(null);
    } catch (error) {
      toast.error(t("actions.err_save_config", "Error al guardar"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirm = () => {
    if (selectedIds.length === 0) return toast.error(t("actions.err_select_data", "Selecciona al menos un dato"));
    onConfirm(selectedIds);
  };

  const handleSelectAll = () => {
    const allLabels = [...suggestedFields.map(o => o.label), ...customFields];
    setSelectedIds(allLabels);
  };

  return (
    <ModalBackdrop onClose={onClose} title={t("actions.data_title", "Solicitud Dinámica Configurable")}>
      <div className="space-y-6">
        {/* Info & Select All */}
        <div className="flex items-center justify-between gap-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex flex-1 items-center gap-3 border border-indigo-100 dark:border-indigo-500/20">
            <UserSquare2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <p className="text-[11px] text-indigo-800 dark:text-indigo-200 font-medium leading-tight">
              {t("actions.data_desc", "Configura y guarda los datos requeridos para tus procesos oficiales.")}
            </p>
          </div>
          <button 
            onClick={handleSelectAll}
            className="px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest transition-all shadow-sm"
          >
            {t("actions.select_all", "Seleccionar Todo")}
          </button>
        </div>

        {/* Suggested Grid */}
        {isLoading ? (
           <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
           </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
            {suggestedFields.map((opt) => {
              const isSelected = selectedIds.includes(opt.label);
              const Icon = opt.icon || Tag;
              const isCustom = !DEFAULT_FIELDS.some(df => df.id === opt.id);

              if (editingFieldId === opt.id) {
                return (
                  <div
                    key={opt.id}
                    className="p-3 border-2 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10 rounded-2xl transition-all text-left relative overflow-hidden flex flex-col justify-between min-h-[110px]"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-6 h-6 rounded-md ${opt.color || 'bg-purple-500'} flex items-center justify-center text-white shadow-sm`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Editar campo</span>
                    </div>
                    <input
                      type="text"
                      className="w-full bg-white dark:bg-gray-800 border border-indigo-300 dark:border-indigo-500/40 rounded-lg px-2 py-1 text-xs outline-none text-gray-800 dark:text-gray-100 font-bold focus:ring-2 focus:ring-indigo-500/20"
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit(opt.id);
                        if (e.key === "Escape") setEditingFieldId(null);
                      }}
                      autoFocus
                    />
                    <div className="flex gap-1.5 mt-2 justify-end">
                      <button
                        onClick={() => setEditingFieldId(null)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded text-gray-400 hover:text-gray-600 transition-colors"
                        title="Cancelar"
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={() => handleSaveEdit(opt.id)}
                        disabled={isSaving}
                        className="p-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors flex items-center justify-center"
                        title="Guardar"
                      >
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      </button>
                    </div>
                  </div>
                );
              }

              if (deletingFieldId === opt.id) {
                return (
                  <div
                    key={opt.id}
                    className="p-3 border-2 border-red-500 bg-red-50/50 dark:bg-red-500/10 rounded-2xl transition-all text-left relative overflow-hidden flex flex-col justify-between min-h-[110px] animate-in fade-in duration-200"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-md bg-red-500 flex items-center justify-center text-white shadow-sm">
                        <AlertCircle className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">¿Eliminar?</span>
                    </div>
                    <div className="text-[10px] text-red-600 dark:text-red-400 font-bold leading-tight mb-2">
                      Esta acción es permanente.
                    </div>
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={() => setDeletingFieldId(null)}
                        className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] font-bold rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      >
                        No
                      </button>
                      <button
                        onClick={() => handleDeleteField(opt.id)}
                        disabled={isSaving}
                        className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded shadow-sm hover:shadow transition-colors flex items-center gap-1"
                      >
                        {isSaving && <Loader2 size={10} className="animate-spin" />}
                        Sí, borrar
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={opt.id}
                  onClick={() => toggleSelection(opt.label)}
                  className={`p-3 border-2 rounded-2xl transition-all text-left group relative overflow-hidden flex flex-col justify-between min-h-[110px] ${
                    isSelected 
                      ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10 shadow-lg shadow-indigo-500/10" 
                      : "border-gray-100 dark:border-white/5 bg-white dark:bg-gray-800/40 hover:border-indigo-200 dark:hover:border-indigo-500/30"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg ${opt.color || "bg-purple-500"} flex items-center justify-center text-white mb-2 shadow-sm group-hover:scale-110 transition-transform`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  
                  <div className="font-bold text-gray-800 dark:text-gray-100 text-[12px] leading-tight break-words pr-4">
                    {opt.label}
                  </div>

                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center text-white animate-in zoom-in duration-200">
                      <Check size={12} strokeWidth={4} />
                    </div>
                  )}

                  {isCustom && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white/95 dark:bg-gray-800/95 p-1 rounded-lg border border-gray-100 dark:border-white/10 shadow-md z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setEditingFieldId(opt.id);
                          setEditingLabel(opt.label);
                        }}
                        className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 rounded transition-colors"
                        title="Editar campo"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setDeletingFieldId(opt.id);
                        }}
                        className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/20 rounded transition-colors"
                        title="Eliminar campo"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Custom Fields List */}
        {customFields.length > 0 && (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t("actions.temp_fields", "Campos Temporales (Sin Guardar)")}</label>
            <div className="flex flex-wrap gap-2">
              {customFields.map(field => (
                <div key={field} className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-500/20 px-3 py-1.5 rounded-full animate-in slide-in-from-left-2 duration-200">
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{field}</span>
                  <div className="flex items-center gap-1 ml-1 border-l border-amber-200 dark:border-amber-700/50 pl-2">
                    <button 
                      onClick={() => saveToConfig(field)}
                      disabled={isSaving}
                      title="Guardar permanentemente en configuración"
                      className="text-emerald-500 hover:text-emerald-600 transition-colors"
                    >
                      {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    </button>
                    <button onClick={() => {
                      setCustomFields(customFields.filter(f => f !== field));
                      setSelectedIds(selectedIds.filter(f => f !== field));
                    }} className="text-red-400 hover:text-red-500 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Custom Field Input */}
        <div className="flex gap-2 p-1 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-white/10">
          <input
            type="text"
            placeholder={t("actions.data_placeholder", "¿Qué más necesitas? (Ej: Dirección, NIT...)")}
            className="flex-1 bg-transparent px-3 py-2 text-xs outline-none text-gray-700 dark:text-gray-300"
            value={newCustomField}
            onChange={(e) => setNewCustomField(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomField()}
          />
          <button 
            onClick={addCustomField}
            className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all shadow-md active:scale-90"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Footer Actions */}
        <div className="flex gap-3 pt-2">
           <button
             onClick={onClose}
             className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold rounded-xl hover:bg-gray-200 transition-all"
           >
             {t("actions.cancel", "Cancelar")}
           </button>
           <button
             onClick={handleConfirm}
             className="flex-[2] py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
           >
             <Send size={18} />
             {t("actions.request_btn", "SOLICITAR")} {selectedIds.length > 0 ? `(${selectedIds.length})` : ""} {t("actions.data_btn", "DATOS")}
           </button>
        </div>
      </div>
    </ModalBackdrop>
  );
};

// --- Main Manager Component ---
interface ActionModalsProps {
  type: "SCHEDULE" | "PRODUCT" | "PROPERTY" | "PAYMENT" | "DATA" | null;
  onClose: () => void;
  onSchedule: (date: Date, message: string) => void;
  onProduct: (product: Product) => void;
  onProperty: (property: Property) => void;
  onPayment: (amount: string, concept: string, currency: string) => void;
  onRequestData: (data: string[]) => void;
}

export const ActionModals: React.FC<ActionModalsProps> = ({
  type,
  onClose,
  onSchedule,
  onProduct,
  onProperty,
  onPayment,
  onRequestData,
}) => {
  if (!type) return null;

  return (
    <>
      {type === "SCHEDULE" && (
        <ScheduleModal onClose={onClose} onConfirm={onSchedule} />
      )}
      {type === "PRODUCT" && (
        <ProductPicker onClose={onClose} onSelect={onProduct} />
      )}
      {type === "PROPERTY" && (
        <PropertyPicker onClose={onClose} onSelect={onProperty} />
      )}
      {type === "PAYMENT" && (
        <PaymentCreator onClose={onClose} onCreate={onPayment} />
      )}
      {type === "DATA" && (
        <DataRequestPicker onClose={onClose} onConfirm={onRequestData} />
      )}
    </>
  );
};
