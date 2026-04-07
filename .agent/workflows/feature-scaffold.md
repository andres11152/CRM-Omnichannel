---
description: Standardized workflow for adding new features (Repository -> Service -> Controller) ensuring Layered Isolation.
---

# [BUILD] Feature Scaffolding Workflow - Layered Isolation (Rule #1)

Este workflow garantiza que cada nueva funcionalidad siga estrictamente el patrón **Repository-Service-Controller** y la validación con **Zod**, manteniendo la arquitectura "World-Class" de SkyCode Agency.

## 1.  Definición del Esquema (Zod)

- [ ] Crear el esquema de validación en `src/schemas/[entity].schema.ts`.
- [ ] Definir los tipos de entrada (`CreateDto`, `UpdateDto`) y de respuesta.
- [ ] **Auditoría**: ¿El esquema incluye validaciones de formato (email, phone, etc.)?

## 2. ️ Capa de Datos (Repository)

- [ ] Crear el repositorio en `src/repositories/[Entity]Repository.ts`.
- [ ] **IMPORTANTE**: Prisma SOLO se importa y usa aquí.
- [ ] Implementar métodos base (`findById`, `create`, `update`, `delete`).
- [ ] **Multi-Tenant (REGLA DE ORO)**: Cada query DEBE filtrar por `companyId`.
  ```typescript
  async findById(id: string, companyId: string) {
    return this.prisma.entity.findUnique({ where: { id, companyId } });
  }
  ```

## 3.  Lógica de Negocio (Service)

- [ ] Crear el servicio en `src/services/[Entity]Service.ts`.
- [ ] Inyectar el repositorio. No interactuar con Prisma directamente.
- [ ] Implementar la lógica (validaciones extra, transformaciones, triggers).
- [ ] Manejar errores usando el sistema de logging centralizado (Winston/Pino) en los bloques `catch`.

## 4. [WEB] Interfaz de Entrada (Controller)

- [ ] Crear el controlador en `src/controllers/[Entity]Controller.ts`.
- [ ] Concernes: Parseo del `req`, llamar al servicio, enviar `res` y `status codes`.
- [ ] **Validación**: Usar el esquema de Zod en el primer paso del método.
- [ ] No incluir lógica de negocio aquí.

## 5. ️ Registro de Rutas

- [ ] Registrar las nuevas rutas en `src/routes/[entity].routes.ts` (o en el router principal).
- [ ] Asegurar que el middleware de autenticación y `TenantContext` estén activos.

## 6. [TEST] Verificación de Aislamiento

- [ ] Intentar acceder a un registro con un `companyId` diferente desde el controlador (prueba manual o test).
- [ ] Confirmar que el sistema lanza un 404/403 y no fuga datos.

---
**Senior Audit**: "Si el Service interactúa con la DB directamente, el PR queda rechazado."
