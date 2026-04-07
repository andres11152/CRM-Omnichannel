---
description: CRM and Sales Pipeline Validation Workflow (Trace WhatsApp Message)
---

# [AI] WhatsApp Trace Workflow - Omnichannel Debugging (Rule #4)

Garantiza la trazabilidad total de los mensajes de Baileys/WhatsApp, evitando errores de asignación o fugas de datos en grupos.

## 1.  Evento de Entrada (Inbound)

- [ ] Identificar el evento crudo de Baileys (`messages.upsert`, `messages.update`).
- [ ] Validar que el `companyId` se extrae correctamente de la sesión de WhatsApp activa.

## 2.  Orquestación (Orchestrator Service)

- [ ] Seguir el flujo en `InboundOrchestratorService.ts`.
- [ ] **Acciones Críticas**:
  - ¿Se identifica correctamente si es un chat individual o de grupo?
  - ¿Se resuelve el remitente (sender) basado en el número de teléfono real (+57...)?
  - ¿Se crea o asocia el `Contact` con el `companyId` correcto?

## 3. [SAVE] Persistencia (Message Persister)

- [ ] Seguir el flujo en `MessagePersister.ts`.
- [ ] Verificar que el mensaje se guarde en la DB (`prisma.message.create`).
- [ ] **Auditoría Multi-Tenant**: Confirmar que el `message.companyId` es igual al `context.companyId`.

## 4. ️ Procesamiento de Media (Media Processor)

- [ ] Si el mensaje incluye imágenes/audio:
  - Verificar que el `MediaProcessor` suba el archivo al bucket indicado (`storage.types.ts`).
  - Asegurar que la URL generada sea segura y que el archivo tenga los tags de `companyId` en el bucket.

## 5. ️ Gestión de Tickets (Ticket Service)

- [ ] Comprobar si el mensaje genera un nuevo `Ticket` o se añade a uno existente.
- [ ] **Asignación**: ¿El ticket aparece en la cola del agente correcto (`queue.types.ts`)?
- [ ] Verificar notificación de Socket al frontend (Optimistic UI).

## 6. [TEST] Verificación Final

- [ ] Enviar mensaje de prueba -> Verificar en el Frontend (Agent Workspace).
- [ ] Revisar logs de Pino/Winston: "Message processed for company [ID]".

---
**Senior Reminder**: "Un mensaje mal asignado es un fallo de seguridad en un SaaS multi-tenant."
