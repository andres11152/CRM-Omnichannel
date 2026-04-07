---
description: Arquitectura de responsabilidades simples para evitar "God Classes" en el backend.
---

#  SRP Audit Workflow - No "God Classes" (Rule #1)

Este workflow previene archivos masivos y clases con demasiadas responsabilidades, manteniendo el código de SkyCode Agency escalable y mantenible.

## 1.  Métrica de Tamaño (Regla de las 500+ líneas)

- [ ] Identificar archivos que superen las 500 líneas en el `src/`.
  ```bash
  find src/ -name "*.ts" | xargs wc -l | sort -nr | head -n 10
  ```
- [ ] Para cada archivo > 500 líneas (ej. `MessageHandler.ts`, `InboundOrchestratorService.ts`):
  - **Analizar**: ¿Hace demasiadas cosas (guardar, formatear, enviar, validar)?

## 2. ️ Estrategia de Fragmentación

- [ ] Identificar candidatos para extraer sub-servicios. Ejemplos comunes:
  - **Carga de Archivos**: Mover a `MediaProcessor.ts`.
  - **Persistencia**: Mover a `MessagePersister.ts`.
  - **Notificaciones**: Mover a `NotificationService.ts`.
  - **Reglas de Negocio**: Mover a `BusinessRulesManager.ts`.
- [ ] Refactorizar el servicio principal para que solo actúe como una **Facha** u **Orquestador**.

## 3. [SEC] Inyección de Dependencias

- [ ] Asegurar que las dependencias estén claramente definidas en el constructor.
- [ ] Evitar dependencias circulares (A necesita B, B necesita A).
- [ ] Mantener cada clase enfocada en **una sola meta de negocio**.

## 4. [TEST] Verificación de Refactor

- [ ] Correr tests unitarios (o `system_qa_test`) tras la fragmentación.
- [ ] Confirmar que los tipos siguen siendo coherentes y que no hay fugas de contexto.

---
**Senior Audit**: "Si tienes que usar un scroll infinito para leer un archivo, es momento de fragmentarlo."
