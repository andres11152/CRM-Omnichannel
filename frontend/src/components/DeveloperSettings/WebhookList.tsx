import React from "react";
import { Activity, Eye, EyeOff, Clipboard, XCircle } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { WebhookEndpoint } from "@/types";
import { copyToClipboard } from "./types";

interface WebhookListProps {
  webhooks: WebhookEndpoint[];
  isCreatingWebhook: boolean;
  visibleSecrets: Set<string>;
  onToggleSecretVisibility: (id: string) => void;
  onToggleWebhook: (id: string, current: boolean) => void;
  onDeleteWebhook: (id: string) => void;
}

export const WebhookList: React.FC<WebhookListProps> = ({
  webhooks,
  isCreatingWebhook,
  visibleSecrets,
  onToggleSecretVisibility,
  onToggleWebhook,
  onDeleteWebhook,
}) => {
  return (
    <div className="grid grid-cols-1 gap-4">
      {webhooks.length === 0 && !isCreatingWebhook && (
        <div className="text-center py-20 bg-white dark:bg-reply-panel-dark rounded-2xl border border-dashed border-gray-200 dark:border-reply-border-dark">
          <div className="w-16 h-16 bg-reply-bg dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4 text-gray-300">
            <Activity className="w-8 h-8" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">No hay webhooks configurados aún.</p>
        </div>
      )}
      {webhooks.map((wh) => (
        <Card key={wh.id} hoverable className="p-5 md:p-6 hover:shadow-md transition-all group overflow-hidden relative">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    wh.isActive ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-gray-400"
                  }`}
                />
                <h4 className="font-bold text-reply-text-primary dark:text-white font-mono text-sm break-all">{wh.url}</h4>
              </div>
              {wh.description && (
                <p className="text-sm text-reply-text-secondary dark:text-reply-text-secondary-dark pl-5">{wh.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-3 md:pt-0 border-reply-border dark:border-reply-border-dark">
              <Button
                onClick={() => onToggleWebhook(wh.id, wh.isActive)}
                variant="secondary"
                size="sm"
                className={
                  wh.isActive
                    ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-500/30 border-none"
                    : ""
                }
              >
                {wh.isActive ? "DESACTIVAR" : "ACTIVAR"}
              </Button>
              <Button
                onClick={() => onDeleteWebhook(wh.id)}
                variant="ghost"
                size="sm"
                className="p-1.5 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:hover:bg-rose-500/20"
              >
                <XCircle className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 bg-reply-bg dark:bg-black/20 p-4 rounded-xl border border-reply-border dark:border-reply-border-dark">
            <div>
              <span className="text-[10px] font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase mb-2 block tracking-widest">
                Eventos Suscritos
              </span>
              <div className="flex flex-wrap gap-1.5">
                {wh.events.map((evt) => (
                  <Badge
                    key={evt}
                    variant="info"
                    className="bg-white dark:bg-reply-surface-dark border-reply-border dark:border-reply-border-dark text-reply-brand dark:text-reply-brand-light"
                  >
                    {evt}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase mb-2 block tracking-widest">
                Signing Secret (HMAC-SHA256)
              </span>
              <div className="flex items-center gap-2 bg-white dark:bg-reply-surface-dark border border-reply-border dark:border-reply-border-dark rounded-lg px-3 py-2 font-mono text-xs shadow-sm">
                <span className="flex-1 truncate dark:text-gray-300">
                  {visibleSecrets.has(wh.id) ? wh.secretKey : "•".repeat(32)}
                </span>
                <button
                  onClick={() => onToggleSecretVisibility(wh.id)}
                  className="text-gray-400 hover:text-reply-brand dark:hover:text-reply-brand-light transition-colors cursor-pointer"
                  title={visibleSecrets.has(wh.id) ? "Ocultar" : "Mostrar"}
                >
                  {visibleSecrets.has(wh.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => copyToClipboard(wh.secretKey, "Secret copiado")}
                  className="text-gray-400 hover:text-reply-brand dark:hover:text-reply-brand-light transition-colors cursor-pointer"
                  title="Copiar"
                >
                  <Clipboard className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};
