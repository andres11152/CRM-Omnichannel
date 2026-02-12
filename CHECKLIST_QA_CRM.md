# ✅ Checklist de Verificación de Funcionalidades CRM

Este documento detalla los casos de prueba necesarios para validar la refactorización completa del módulo CRM (Deals, Pipelines, Stages) y la implementación de validaciones estrictas con Zod.

## 🚀 1. Gestión de Pipelines (`/pipelines`)

### Consultas

- [ ] **Listar Pipelines**: `GET /api/crm/pipelines`
  - Debe retornar lista de pipelines de la compañía actual.
  - Ordenamiento: Primero `isDefault`.
  - Verificar conteo de deals (`_count.deals`).

### Creación / Edición

- [ ] **Crear Pipeline**: `POST /api/crm/pipelines`
  - Body: `{ "name": "Prueba" }` -> Crea stages por defecto.
  - Body: `{ "name": "Custom", "stages": [...] }` -> Crea stages específicos.
- [ ] **Actualizar Pipeline**: `PATCH /api/crm/pipelines/:id`
  - Probar cambiar nombre.
  - Probar cambiar `isDefault` (el anterior default debe desactivarse).

### Acciones Críticas

- [ ] **Duplicar Pipeline**: `POST /api/crm/pipelines/:id/duplicate`
  - Debe crear copia completa de stages.
- [ ] **Eliminar Pipeline**: `DELETE /api/crm/pipelines/:id`
  - 🔴 **Fail**: Si tiene Deals activos.
  - 🔴 **Fail**: Si es el último pipeline restante.
  - 🟢 **Success**: Pipeline vacío.

---

## 🎨 Gestión de Stages (`/pipelines/:pipelineId/stages`)

### CRUD Básico

- [ ] **Crear Stage**: `POST /api/crm/pipelines/:pipelineId/stages`
  - Body: `{ "name": "Stage Final" }` -> Orden automático al final.
- [ ] **Actualizar Stage**: `PATCH /api/crm/pipelines/:pipelineId/stages/:id`
  - Body: `{ "name": "Nuevo Nombre", "color": "#FFFFFF" }`
- [ ] **Eliminar Stage**: `DELETE /api/crm/pipelines/:pipelineId/stages/:id`
  - 🔴 **Fail**: Si tiene Deals.

### Reordenamiento

- [ ] **Reordenar Stages**: `PUT /api/crm/pipelines/:pipelineId/stages/reorder`
  - Body: `{ "stages": [{ "id": "...", "order": 0 }, ...] }`
  - Verificar persistencia del orden.

---

## 💼 Gestión de Deals (`/deals`)

### Creación

- [ ] **Crear Deal**: `POST /api/crm/deals`
  - Body mínimo requerido: `pipelineId`, `stageId`, `title`.
  - Body opcional: `value`, `currency`, `probability`, `expectedCloseDate`, relations (`accountId`, `contactId`).
  - 🟢 **Success**: Respuesta 201 con objeto Deal creado.

### Consultas

- [ ] **Listar Deals**: `GET /api/crm/deals`
  - Filtros Query: `pipelineId`, `stageId`, `accountId`.
  - Verificar que `accountId` funciona (corrección aplicada hoy).

### Modificación (Kanban)

- [ ] **Mover Deal (Stage Change)**: `PATCH /api/crm/deals/:id`
  - Body: `{ "stageId": "..." }`
  - Verificar cambio de stage y recálculo de orden.
- [ ] **Reordenar Deal**: `PUT /api/crm/deals/:id/reorder`
  - Body: `{ "stageId": "...", "order": ... }`
  - Verificar movimiento visual.

---

## 🛡️ Validaciones Zod Implementadas

- [ ] **Entradas inválidas**: Enviar `{ "name": "" }` o `{ "currency": "XY" }`.
  - Debe retornar 400 Bad Request con mensaje de Zod.
- [ ] **Tipos estrictos**: Enviar número como string en campos numéricos (si no hay coerce/transform configurado).

## 🛠️ Refactorización de Código (Verificación Interna)

- [ ] **Sin `any`**: Confirmar que no existen tipos `any` en `pipelineService.ts`, `stageService.ts`, `dealService.ts`.
- [ ] **Tipos de Esquema**: Verificar que los servicios usan `CreatePipelineInput`, `CreateDealInput`, etc.
- [ ] **Repositorios**: Confirmar limpieza de imports no usados en `DealRepository.ts`.
