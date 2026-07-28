import { Quotation, QuotationItem, Company, Contact, Product } from "@prisma/client";

export type QuotationWithDetails = Quotation & {
  company: Company;
  contact?: Contact | null;
  items: (QuotationItem & { product?: Product | null })[];
};

// [SEC] This HTML is served directly (Content-Type: text/html) to an
// authenticated agent's browser via the preview endpoint, and the same
// markup underlies the client-facing PDF/public page. Every field below can
// contain agent- or contact-supplied free text (quotation title/notes/terms,
// item descriptions, contact name/phone/email), so every one of them must be
// escaped before interpolation — otherwise a value like
// `<script>...</script>` in a quotation note becomes a stored XSS that runs
// in whoever views the preview.
const escapeHtml = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

export class QuotationPdfService {
  /**
   * Generates a clean, professional HTML string suitable for PDF conversion or direct browser printing.
   */
  public generateHtml(quotation: QuotationWithDetails, publicBaseUrl: string): string {
    const { company, contact, items, quoteNumber, title, currency, subtotal, taxAmount, discount, total, notes, terms, validUntil, publicHash, createdAt } = quotation;

    const formattedDate = new Date(createdAt).toLocaleDateString("es-CO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const formattedExpiry = validUntil
      ? new Date(validUntil).toLocaleDateString("es-CO", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "N/A";

    const publicUrl = `${publicBaseUrl}/quote/${publicHash}`;

    const itemRows = items
      .map(
        (item, idx) => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 16px; font-size: 14px; color: #374151;">${idx + 1}</td>
          <td style="padding: 12px 16px; font-size: 14px; color: #111827; font-weight: 500;">${escapeHtml(item.description)}</td>
          <td style="padding: 12px 16px; font-size: 14px; color: #374151; text-align: center;">${item.quantity}</td>
          <td style="padding: 12px 16px; font-size: 14px; color: #374151; text-align: right;">${currency} $${item.unitPrice.toLocaleString("es-CO")}</td>
          <td style="padding: 12px 16px; font-size: 14px; color: #374151; text-align: right;">${item.taxRate}%</td>
          <td style="padding: 12px 16px; font-size: 14px; color: #111827; font-weight: 600; text-align: right;">${currency} $${item.totalLine.toLocaleString("es-CO")}</td>
        </tr>
      `
      )
      .join("");

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Cotización #${quoteNumber} - ${escapeHtml(company.name)}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1f2937; margin: 0; padding: 40px; background-color: #ffffff; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #6366f1; padding-bottom: 20px; }
    .company-title { font-size: 24px; font-weight: 700; color: #4f46e5; margin: 0; }
    .quote-badge { font-size: 20px; font-weight: 700; color: #1e1b4b; background: #e0e7ff; padding: 8px 16px; border-radius: 12px; display: inline-block; }
    .grid { display: flex; justify-content: space-between; margin-bottom: 32px; gap: 24px; }
    .card { background: #f9fafb; padding: 16px 20px; border-radius: 12px; border: 1px solid #f3f4f6; flex: 1; }
    .card-title { font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .card-content { font-size: 14px; color: #1f2937; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
    th { background: #f3f4f6; padding: 12px 16px; font-size: 12px; font-weight: 700; color: #4b5563; text-transform: uppercase; text-align: left; }
    th.text-right { text-align: right; }
    th.text-center { text-align: center; }
    .totals { width: 320px; margin-left: auto; margin-bottom: 40px; }
    .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #4b5563; }
    .total-row.grand { font-size: 18px; font-weight: 700; color: #4f46e5; border-top: 2px solid #e5e7eb; padding-top: 12px; margin-top: 4px; }
    .footer { border-top: 1px solid #e5e7eb; padding-top: 24px; display: flex; justify-content: space-between; align-items: center; }
    .terms { font-size: 12px; color: #6b7280; max-width: 65%; }
    .approve-btn { display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="company-title">${escapeHtml(company.name)}</h1>
      <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">Cotización y Propuesta Comercial</p>
    </div>
    <div style="text-align: right;">
      <div class="quote-badge">Cotización #${quoteNumber}</div>
      <p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7280;">Fecha: <strong>${formattedDate}</strong></p>
      <p style="margin: 2px 0 0 0; font-size: 13px; color: #6b7280;">Válido hasta: <strong>${formattedExpiry}</strong></p>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Cliente / Destinatario</div>
      <div class="card-content">
        <strong>${escapeHtml(contact?.name) || "Cliente Contado"}</strong><br/>
        ${contact?.phone ? `Tel: ${escapeHtml(contact.phone)}<br/>` : ""}
        ${contact?.email ? `Email: ${escapeHtml(contact.email)}<br/>` : ""}
      </div>
    </div>
    <div class="card">
      <div class="card-title">Detalles del Negocio</div>
      <div class="card-content">
        <strong>${escapeHtml(title)}</strong><br/>
        Estado: <span style="color: #4f46e5; font-weight: 600;">${quotation.status}</span><br/>
        Moneda: ${currency}
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 40px;">#</th>
        <th>Descripción del Producto / Servicio</th>
        <th class="text-center" style="width: 80px;">Cant.</th>
        <th class="text-right" style="width: 120px;">Precio Unit.</th>
        <th class="text-right" style="width: 80px;">IVA</th>
        <th class="text-right" style="width: 130px;">Total Linea</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="totals">
    <div class="total-row">
      <span>Subtotal:</span>
      <span>${currency} $${subtotal.toLocaleString("es-CO")}</span>
    </div>
    ${
      discount > 0
        ? `<div class="total-row" style="color: #dc2626;">
            <span>Descuento:</span>
            <span>-${currency} $${discount.toLocaleString("es-CO")}</span>
          </div>`
        : ""
    }
    <div class="total-row">
      <span>Impuestos (IVA):</span>
      <span>${currency} $${taxAmount.toLocaleString("es-CO")}</span>
    </div>
    <div class="total-row grand">
      <span>Total a Pagar:</span>
      <span>${currency} $${total.toLocaleString("es-CO")}</span>
    </div>
  </div>

  ${notes ? `<div style="margin-bottom: 24px; background: #fffbe0; padding: 12px 16px; border-radius: 8px; border: 1px solid #fde68a; font-size: 13px;"><strong>Notas:</strong> ${escapeHtml(notes)}</div>` : ""}

  <div class="footer">
    <div class="terms">
      <strong>Términos y Condiciones:</strong><br/>
      ${terms ? escapeHtml(terms) : "Esta cotización es válida por el tiempo estipulado. Los precios están sujetos a disponibilidad de inventario."}
    </div>
    <div>
      <a href="${encodeURI(publicUrl)}" target="_blank" class="approve-btn">Revisar y Aceptar Online</a>
    </div>
  </div>
</body>
</html>
    `;
  }
}

export const quotationPdfService = new QuotationPdfService();
