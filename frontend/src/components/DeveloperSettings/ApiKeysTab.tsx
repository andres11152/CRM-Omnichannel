import React from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Key, Clipboard } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Badge } from "../ui/Badge";
import { copyToClipboard } from "./types";
import { DeveloperSettingsState } from "./useDeveloperSettings";

export const ApiKeysTab: React.FC<{ ds: DeveloperSettingsState }> = ({ ds }) => {
  const { t } = useTranslation();
  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <Card className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5">
        <div>
          <h3 className="font-bold text-reply-text-primary dark:text-white text-lg flex items-center gap-2">
            {t("developer_settings.api_keys_tab.title", "Claves API Activas")}
            <Badge variant="info">{ds.apiKeys.length}</Badge>
          </h3>
          <p className="text-xs text-reply-text-secondary dark:text-reply-text-secondary-dark mt-1">
            {t("developer_settings.api_keys_tab.description_prefix", "Autentifica peticiones externas con el header")}{" "}
            <code className="font-mono text-reply-brand dark:text-reply-brand-light">X-API-Key</code>.
          </p>
        </div>
        <Button
          onClick={() => ds.setIsCreatingKey(!ds.isCreatingKey)}
          variant={ds.isCreatingKey ? "secondary" : "primary"}
          className="w-full sm:w-auto"
        >
          {ds.isCreatingKey ? (
            <span>{t("developer_settings.api_keys_tab.close", "Cerrar")}</span>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              <span>{t("developer_settings.api_keys_tab.new_key", "Nueva API Key")}</span>
            </>
          )}
        </Button>
      </Card>

      {/* One-time key display */}
      {ds.generatedKey && (
        <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-200 dark:border-emerald-900/50 p-6 shadow-md">
          <div className="flex items-start gap-4">
            <div className="bg-emerald-100 dark:bg-emerald-900/50 p-3 rounded-2xl text-emerald-600 dark:text-emerald-400 shadow-sm">
              <Key className="w-6 h-6" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h4 className="font-bold text-emerald-800 dark:text-emerald-300 text-lg">{t("developer_settings.api_keys_tab.key_generated_title", "¡API Key Generada!")}</h4>
                <p className="text-emerald-700 dark:text-emerald-400/80 text-xs font-medium">
                  {t("developer_settings.api_keys_tab.key_generated_desc", "Copia esta clave inmediatamente. Por seguridad, no volverá a mostrarse.")}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="flex-1 bg-white dark:bg-black/40 px-4 py-3 rounded-xl border border-emerald-100 dark:border-emerald-900 shadow-inner font-mono text-xs break-all text-gray-800 dark:text-gray-200 select-all">
                  {ds.generatedKey}
                </div>
                <Button
                  onClick={() => copyToClipboard(ds.generatedKey as string, t("developer_settings.api_keys_tab.copied_toast", "Clave copiada"))}
                  variant="primary"
                  size="lg"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 border-none shrink-0"
                >
                  <Clipboard className="w-4 h-4" /> {t("developer_settings.api_keys_tab.copy", "Copiar")}
                </Button>
              </div>

              <button
                onClick={() => ds.setGeneratedKey(null)}
                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline uppercase tracking-widest cursor-pointer"
              >
                {t("developer_settings.api_keys_tab.saved_continue", "Ya la guardé — Continuar")}
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Creation form */}
      {ds.isCreatingKey && !ds.generatedKey && (
        <Card className="p-6 border border-reply-brand/20 shadow-md animate-in fade-in duration-300">
          <div className="mb-4">
            <Input
              type="text"
              label={t("developer_settings.api_keys_tab.key_name_label", "Nombre de la Clave")}
              value={ds.newKeyName}
              onChange={(e) => ds.setNewKeyName(e.target.value)}
              placeholder={t("developer_settings.api_keys_tab.key_name_placeholder", "Ej: Servidor de Producción")}
              onKeyDown={(e) => e.key === "Enter" && ds.handleCreateApiKey()}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={ds.handleCreateApiKey} variant="primary">
              {t("developer_settings.api_keys_tab.generate_key", "Generar Clave")}
            </Button>
          </div>
        </Card>
      )}

      {/* Key list */}
      <div className="grid grid-cols-1 gap-4">
        {ds.apiKeys.length === 0 && !ds.isCreatingKey && (
          <div className="text-center py-20 bg-white dark:bg-reply-panel-dark rounded-2xl border border-dashed border-gray-200 dark:border-reply-border-dark">
            <div className="w-16 h-16 bg-reply-bg dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4 text-gray-300">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 font-medium">{t("developer_settings.api_keys_tab.empty_state", "No hay claves API generadas aún.")}</p>
          </div>
        )}
        {ds.apiKeys.map((key) => (
          <Card key={key.id} hoverable className="p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-reply-brand/10 dark:bg-reply-brand/20 rounded-xl flex items-center justify-center text-reply-brand flex-shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-reply-text-primary dark:text-white mb-0.5">{key.name}</h4>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="info" className="font-mono text-[10px] font-black uppercase tracking-widest">
                    {key.keyPrefix}
                  </Badge>
                  <span className="text-[10px] text-reply-text-secondary/60 dark:text-reply-text-secondary-dark/60 uppercase font-bold tracking-tight">
                    {t("developer_settings.api_keys_tab.created_on", "Creada el {{date}}", { date: new Date(key.createdAt).toLocaleDateString() })}
                  </span>
                  {key.lastUsedAt && (
                    <span className="text-[10px] text-reply-text-secondary/60 dark:text-reply-text-secondary-dark/60 uppercase font-bold tracking-tight">
                      {t("developer_settings.api_keys_tab.used_on", "· Usada el {{date}}", { date: new Date(key.lastUsedAt).toLocaleDateString() })}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end border-t md:border-t-0 pt-3 md:pt-0 border-reply-border dark:border-reply-border-dark w-full md:w-auto">
              <Button
                onClick={() => ds.handleRevokeApiKey(key.id, key.name)}
                variant="ghost"
                className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 w-full md:w-auto text-xs uppercase tracking-widest font-black"
              >
                {t("developer_settings.api_keys_tab.revoke_access", "Revocar Acceso")}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
