import React, { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

// --- Shared Components ---
const ModalBackdrop: React.FC<{
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}> = ({ onClose, children, title }) => {
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      style={{ zIndex: 99999 }}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-reply-panel-dark rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-reply-border-dark transform transition-all scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 dark:border-reply-border-dark flex justify-between items-center bg-reply-bg dark:bg-gray-800/50">
          <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body,
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

  const handleConfirm = () => {
    if (!date || !time) return toast.error("Selecciona fecha y hora");
    if (!message.trim()) return toast.error("Escribe el mensaje a programar");

    const scheduledDate = new Date(`${date}T${time}`);
    if (scheduledDate < new Date())
      return toast.error("La fecha debe ser futura");

    onConfirm(scheduledDate, message);
  };

  return (
    <ModalBackdrop onClose={onClose} title="Programar Mensaje">
      <div className="space-y-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-start gap-3">
          <span className="text-xl">🕒</span>
          <p className="text-sm text-blue-700 dark:text-blue-200">
            El sistema enviar este mensaje automticamente en la fecha
            seleccionada.
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 uppercase">
            Mensaje
          </label>
          <textarea
            className="w-full p-3 bg-reply-bg dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-reply-border-dark focus:ring-2 focus:ring-purple-500 outline-none resize-none h-24 text-sm"
            placeholder="Escribe aquíí el mensaje a enviar..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">
              Fecha
            </label>
            <input
              type="date"
              className="w-full p-2.5 bg-reply-bg dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-reply-border-dark focus:ring-2 focus:ring-purple-500 outline-none"
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">
              Hora
            </label>
            <input
              type="time"
              className="w-full p-2.5 bg-reply-bg dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-reply-border-dark focus:ring-2 focus:ring-purple-500 outline-none"
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>
        <button
          onClick={handleConfirm}
          className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-colors shadow-lg shadow-purple-500/30 mt-2"
        >
          Programar Envío
        </button>
      </div>
    </ModalBackdrop>
  );
};

// --- 2. Product Picker ---
import { API_BASE_URL } from "@/services/apiConfig";

interface Product {
  id: string;
  name: string;
  price: number;
  currency: string;
  description?: string;
  imageUrl?: string;
  status?: string;
}

export const ProductPicker: React.FC<{
  onClose: () => void;
  onSelect: (product: Product) => void;
}> = ({ onClose, onSelect }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

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
        toast.error("Error cargando productos");
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
    <ModalBackdrop onClose={onClose} title="Enviar Producto">
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p className="font-medium">No hay productos disponibles</p>
            <p className="text-sm mt-1">Crea productos en el catlogo primero</p>
          </div>
        ) : (
          products.map((p) => (
            <div
              key={p.id}
              onClick={() => onSelect(p)}
              className="flex items-center gap-4 p-3 rounded-xl border border-gray-100 dark:border-reply-border-dark hover:border-purple-500 dark:hover:border-purple-500 cursor-pointer transition-all hover:bg-reply-bg dark:hover:bg-gray-800 group"
            >
              {p.imageUrl ? (
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  className="w-16 h-16 rounded-lg object-cover bg-gray-200"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center">
                  <span className="text-2xl">📦</span>
                </div>
              )}
              <div className="flex-1">
                <h4 className="font-bold text-gray-800 dark:text-gray-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                  {p.name}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                  {p.description || "Sin descripción"}
                </p>
                <span className="font-mono text-sm font-bold text-green-600 dark:text-green-400">
                  {formatPrice(p.price, p.currency)}
                </span>
              </div>
              <button className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full group-hover:bg-purple-100 dark:group-hover:bg-purple-900/50 text-gray-400 group-hover:text-purple-600 transition-colors">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </ModalBackdrop>
  );
};

// --- 3. Payment Creator ---
export const PaymentCreator: React.FC<{
  onClose: () => void;
  onCreate: (amount: string, concept: string) => void;
}> = ({ onClose, onCreate }) => {
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");

  return (
    <ModalBackdrop onClose={onClose} title="Generar Link de Pago">
      <div className="space-y-4">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">
            $
          </span>
          <input
            type="number"
            placeholder="0.00"
            autoFocus
            className="w-full pl-8 pr-4 py-4 text-3xl font-bold bg-transparent border-b-2 border-gray-200 dark:border-reply-border-dark focus:border-green-500 outline-none text-center"
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <input
          type="text"
          placeholder="Concepto (ej: Renovación Anual)"
          className="w-full p-3 bg-reply-bg dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-reply-border-dark focus:ring-2 focus:ring-green-500 outline-none resize-none"
          onChange={(e) => setConcept(e.target.value)}
        />
        <button
          onClick={() => {
            if (!amount) return toast.error("Ingresa un monto");
            onCreate(amount, concept || "Servicios Profesionales");
          }}
          className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-colors shadow-lg shadow-green-500/30"
        >
          Generar Link
        </button>
      </div>
    </ModalBackdrop>
  );
};

// --- 4. Data Request ---
export const DataRequestPicker: React.FC<{
  onClose: () => void;
  onSelect: (type: string) => void;
}> = ({ onClose, onSelect }) => {
  const options = [
    {
      id: "email",
      label: "Correo Electrónico",
      icon: "📧",
      desc: "Solicitar email al cliente",
    },
    {
      id: "phone",
      label: "Número de Teléfono",
      icon: "📱",
      desc: "Confirmar número de contacto",
    },
    {
      id: "location",
      label: "Ubicación Actual",
      icon: "📍",
      desc: "Pedir ubicación GPS",
    },
    {
      id: "id_doc",
      label: "Documento de Identidad",
      icon: "🪪",
      desc: "Foto del documento",
    },
  ];

  return (
    <ModalBackdrop onClose={onClose} title="Solicitar Datos">
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.label)}
            className="p-4 bg-reply-bg dark:bg-gray-800 border border-gray-100 dark:border-reply-border-dark rounded-xl hover:ring-2 hover:ring-teal-500 transition-all text-left group"
          >
            <div className="text-2xl mb-2 group-hover:scale-110 transition-transform origin-left">
              {opt.icon}
            </div>
            <div className="font-bold text-gray-800 dark:text-gray-100 text-sm">
              {opt.label}
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
              {opt.desc}
            </div>
          </button>
        ))}
      </div>
    </ModalBackdrop>
  );
};

// --- Main Manager Component ---
interface ActionModalsProps {
  type: "SCHEDULE" | "PRODUCT" | "PAYMENT" | "DATA" | null;
  onClose: () => void;
  onSchedule: (date: Date, message: string) => void;
  onProduct: (product: Product) => void;
  onPayment: (amount: string, concept: string) => void;
  onRequestData: (type: string) => void;
}

export const ActionModals: React.FC<ActionModalsProps> = ({
  type,
  onClose,
  onSchedule,
  onProduct,
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
      {type === "PAYMENT" && (
        <PaymentCreator onClose={onClose} onCreate={onPayment} />
      )}
      {type === "DATA" && (
        <DataRequestPicker onClose={onClose} onSelect={onRequestData} />
      )}
    </>
  );
};
