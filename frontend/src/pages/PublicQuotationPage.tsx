import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AxiosError } from "axios";
import { CheckCircle2, XCircle, FileText, ShieldCheck, Loader2 } from "lucide-react";
import { getQuotationPublicByHash, respondQuotationPublic, Quotation } from "@/services/quotationService";

export const PublicQuotationPage: React.FC = () => {
  const { hash } = useParams<{ hash: string }>();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [accepted, setAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    if (hash) {
      getQuotationPublicByHash(hash)
        .then((data) => {
          setQuotation(data);
          if (data.status === "ACCEPTED") setAccepted(true);
          if (data.status === "REJECTED") setAccepted(false);
        })
        .catch(() => setError("Cotización no encontrada o expirada"))
        .finally(() => setLoading(false));
    }
  }, [hash]);

  const handleRespond = async (accept: boolean) => {
    if (!hash) return;
    try {
      setActionLoading(true);
      const res = await respondQuotationPublic(hash, accept);
      setQuotation(res);
      setAccepted(accept);
    } catch (err: unknown) {
      const message = err instanceof AxiosError ? err.response?.data?.message : undefined;
      alert(message || "Error al responder cotización");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-reply-brand" />
      </div>
    );
  }

  if (error || !quotation) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-center text-white">
        <XCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-xl font-bold mb-2">Cotización No Disponible</h1>
        <p className="text-slate-400 text-sm">{error || "No se pudo cargar la cotización"}</p>
      </div>
    );
  }

  const { quoteNumber, title, currency, subtotal, taxAmount, total, items, contact, notes, terms, createdAt, validUntil } = quotation;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-8 px-4 flex justify-center">
      <div className="w-full max-w-3xl space-y-6">
        {/* Header Bar */}
        <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/60 p-6 rounded-3xl shadow-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">{title}</h1>
              <p className="text-xs text-slate-400">Cotización #{quoteNumber}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {accepted === true ? (
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" />
                Propuesta Aceptada
              </span>
            ) : accepted === false ? (
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold">
                <XCircle className="w-4 h-4" />
                Propuesta Rechazada
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-xs font-bold animate-pulse">
                Pendiente de Aprobación
              </span>
            )}
          </div>
        </div>

        {/* Document Body */}
        <div className="bg-white text-slate-900 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6">
          <div className="flex justify-between items-start border-b border-slate-100 pb-6">
            <div>
              <h2 className="text-xl font-black text-indigo-600">PROPUESTA COMERCIAL</h2>
              {contact && <p className="text-xs text-slate-500 mt-1">Dirigido a: <strong>{contact.name}</strong></p>}
            </div>
            <div className="text-right text-xs text-slate-500 space-y-1">
              <p>Fecha: <strong>{new Date(createdAt).toLocaleDateString("es-CO")}</strong></p>
              {validUntil && <p>Válido hasta: <strong>{new Date(validUntil).toLocaleDateString("es-CO")}</strong></p>}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase">
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-3">Descripción</th>
                  <th className="py-3 px-3 text-center">Cant.</th>
                  <th className="py-3 px-3 text-right">Precio Unit.</th>
                  <th className="py-3 px-3 text-right">IVA</th>
                  <th className="py-3 px-3 text-right">Total Linea</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td className="py-3 px-3 text-slate-400">{idx + 1}</td>
                    <td className="py-3 px-3 font-semibold text-slate-800">{item.description}</td>
                    <td className="py-3 px-3 text-center text-slate-600">{item.quantity}</td>
                    <td className="py-3 px-3 text-right text-slate-600">{currency} ${item.unitPrice.toLocaleString("es-CO")}</td>
                    <td className="py-3 px-3 text-right text-slate-600">{item.taxRate}%</td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900">{currency} ${item.totalLine.toLocaleString("es-CO")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end pt-4 border-t border-slate-100">
            <div className="w-64 space-y-2 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{currency} ${subtotal.toLocaleString("es-CO")}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA:</span>
                <span>{currency} ${taxAmount.toLocaleString("es-CO")}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-base font-black text-indigo-600">
                <span>Total:</span>
                <span>{currency} ${total.toLocaleString("es-CO")}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {notes && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs">
              <strong>Notas:</strong> {notes}
            </div>
          )}

          {terms && (
            <div className="text-[11px] text-slate-400 border-t border-slate-100 pt-4">
              <strong>Términos y Condiciones:</strong> {terms}
            </div>
          )}
        </div>

        {/* Action Buttons for Client */}
        {accepted === null && (
          <div className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/60 p-6 rounded-3xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              <span>Aceptación segura con confirmación instantánea.</span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={() => handleRespond(false)}
                disabled={actionLoading}
                className="flex-1 sm:flex-none px-6 py-3 rounded-2xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition-all disabled:opacity-50"
              >
                Rechazar
              </button>
              <button
                onClick={() => handleRespond(true)}
                disabled={actionLoading}
                className="flex-1 sm:flex-none px-8 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Aceptar Propuesta</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
