import React from "react";
import { Product } from "../types";
import type { Property } from "@/types/property.types";
import { CrmContact } from "@/services/crmService";

import { ScheduleModal, AttachmentPayload } from "./crm/modals/ScheduleModal";
import { ProductPicker } from "./crm/modals/ProductPicker";
import { PropertyPicker } from "./crm/modals/PropertyPicker";
import { ContactPicker } from "./crm/modals/ContactPicker";
import { PaymentCreator } from "./crm/modals/PaymentCreator";
import { DataRequestPicker } from "./crm/modals/DataRequestPicker";

export interface ActionModalsProps {
  type: "SCHEDULE" | "PRODUCT" | "PROPERTY" | "PAYMENT" | "DATA" | "CONTACT" | null;
  onClose: () => void;
  onSchedule: (
    date: Date,
    message: string,
    mediaFile?: File | null,
    directAttachment?: AttachmentPayload | null
  ) => void;
  onProduct: (product: Product) => void;
  onProperty: (property: Property) => void;
  onPayment: (amount: string, concept: string, currency: string) => void;
  onRequestData: (data: string[]) => void;
  onContact: (contact: CrmContact) => void;
}

export const ActionModals: React.FC<ActionModalsProps> = ({
  type,
  onClose,
  onSchedule,
  onProduct,
  onProperty,
  onPayment,
  onRequestData,
  onContact,
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
      {type === "CONTACT" && (
        <ContactPicker onClose={onClose} onSelect={onContact} />
      )}
    </>
  );
};
