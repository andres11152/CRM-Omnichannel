import React from "react";
import { useTranslation } from "react-i18next";
import { Activity } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { WebhookForm } from "./WebhookForm";
import { WebhookList } from "./WebhookList";
import { DeliveryLogsSection } from "./DeliveryLogsSection";
import { DeveloperSettingsState } from "./useDeveloperSettings";

export const WebhooksTab: React.FC<{ ds: DeveloperSettingsState }> = ({ ds }) => {
  const { t } = useTranslation();
  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      {/* Header card */}
      <Card className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5">
        <div>
          <h3 className="font-bold text-reply-text-primary dark:text-white text-lg flex items-center gap-2">
            {t("developer_settings.webhooks_tab.endpoints_configured", "Endpoints Configurados")}
            <Badge variant="info">{ds.webhooks.length}</Badge>
          </h3>
          <p className="text-xs text-reply-text-secondary dark:text-reply-text-secondary-dark mt-1">
            {t("developer_settings.webhooks_tab.description", "Configura URLs externas donde Sentry enviará eventos en tiempo real vía HMAC-SHA256.")}
          </p>
        </div>
        <Button
          onClick={() => ds.setIsCreatingWebhook(!ds.isCreatingWebhook)}
          variant={ds.isCreatingWebhook ? "secondary" : "primary"}
          className="w-full sm:w-auto"
        >
          {ds.isCreatingWebhook ? (
            <span>{t("developer_settings.webhooks_tab.close", "Cerrar")}</span>
          ) : (
            <>
              <Activity className="w-4 h-4" />
              <span>{t("developer_settings.webhooks_tab.new_webhook", "Nuevo Webhook")}</span>
            </>
          )}
        </Button>
      </Card>

      {ds.isCreatingWebhook && (
        <WebhookForm
          newUrl={ds.newUrl}
          onUrlChange={ds.setNewUrl}
          newDesc={ds.newDesc}
          onDescChange={ds.setNewDesc}
          selectedEvents={ds.selectedEvents}
          onToggleEvent={ds.toggleEvent}
          onSave={ds.handleCreateWebhook}
          isSaving={ds.isSavingWebhook}
        />
      )}

      <WebhookList
        webhooks={ds.webhooks}
        isCreatingWebhook={ds.isCreatingWebhook}
        visibleSecrets={ds.visibleSecrets}
        onToggleSecretVisibility={ds.toggleSecretVisibility}
        onToggleWebhook={ds.handleToggleWebhook}
        onDeleteWebhook={ds.handleDeleteWebhook}
      />

      <DeliveryLogsSection
        logs={ds.logs}
        isRefreshingLogs={ds.isRefreshingLogs}
        onRefresh={ds.handleRefreshLogs}
        onReplayLog={ds.handleReplayLog}
      />
    </div>
  );
};
