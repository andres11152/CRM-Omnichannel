import React, { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Wallet, DollarSign, Tag, CheckCircle2, BadgeDollarSign, CreditCard } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

export interface PaymentCreatorProps {
  onClose: () => void;
  onCreate: (amount: string, concept: string, currency: string) => void;
}

export const PaymentCreator: React.FC<PaymentCreatorProps> = ({ onClose, onCreate }) => {
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
    onCreate(amount, concept || t("actions.pro_services", "Servicios Profesionales"), currency);
  };

  return (
    <Modal isOpen onClose={onClose} title={t("actions.payment_title", "Generar Cobro Enterprise")} size="md">
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
                  $
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
    </Modal>
  );
};
