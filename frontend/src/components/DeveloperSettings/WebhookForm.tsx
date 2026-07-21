import React from "react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { WebhookEventType } from "@/types";
import { AVAILABLE_EVENTS } from "./types";

interface WebhookFormProps {
  newUrl: string;
  onUrlChange: (value: string) => void;
  newDesc: string;
  onDescChange: (value: string) => void;
  selectedEvents: WebhookEventType[];
  onToggleEvent: (evt: WebhookEventType) => void;
  onSave: () => void;
  isSaving: boolean;
}

export const WebhookForm: React.FC<WebhookFormProps> = ({
  newUrl,
  onUrlChange,
  newDesc,
  onDescChange,
  selectedEvents,
  onToggleEvent,
  onSave,
  isSaving,
}) => {
  return (
    <Card className="p-6 border border-reply-brand/20 shadow-xl space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          type="url"
          label="Endpoint URL (POST)"
          value={newUrl}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://api.empresa.com/webhook"
          className="font-mono"
        />
        <Input
          type="text"
          label="Descripción (opcional)"
          value={newDesc}
          onChange={(e) => onDescChange(e.target.value)}
          placeholder="Ej: Integración con ERP Interno"
        />
      </div>

      <div className="space-y-3">
        <label className="text-xs font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-widest block">
          Eventos a Suscribir
        </label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_EVENTS.map((evt) => (
            <button
              key={evt}
              onClick={() => onToggleEvent(evt)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                selectedEvents.includes(evt)
                  ? "bg-reply-brand text-white border-reply-brand shadow-sm"
                  : "bg-white dark:bg-reply-panel-dark text-reply-text-secondary dark:text-reply-text-secondary-dark border-reply-border dark:border-reply-border-dark hover:border-reply-brand"
              }`}
            >
              {evt.toUpperCase()}
            </button>
          ))}
        </div>
        {selectedEvents.length === 0 && (
          <p className="text-[10px] text-reply-text-secondary/70 dark:text-reply-text-secondary-dark/70">
            Sin selección → se suscribirá a <code className="font-mono">message.received</code>
          </p>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={onSave} variant="primary" size="lg" disabled={!newUrl || isSaving}>
          {isSaving ? "Guardando…" : "Guardar Configuración"}
        </Button>
      </div>
    </Card>
  );
};
