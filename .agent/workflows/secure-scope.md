# [SEC] Strict Security & Multi-Tenancy Audit

Este workflow es el estándar de seguridad de SkyCode Agency para garantizar el aislamiento total entre inquilinos (Tenants).

## 1. [DB] Query Scoping Audit
- [ ] Escanear cada nueva consulta a Prisma.
- [ ] **REGLA DE ORO**: Toda consulta `findMany`, `findFirst`, `update`, `delete` debe contener `where: { companyId }`.
- [ ] Si se encuentra una consulta sin `companyId`, se debe refactorizar el Repositorio antes de proceder.

## 2. [SEC] Zod Validation Enforcement
- [ ] Todos los DTOs de entrada deben tener un esquema Zod asociado en `src/validators/`.
- [ ] El controlador debe invocar `.parse()` o `.safeParse()` antes de pasar los datos al servicio.
- [ ] No se permiten objetos literales sin validación previa.

## 3. [AUTH] Impersonation Safety
- [ ] Verificar que los tokens de impersonación contengan el `masterCompanyId` original.
- [ ] Asegurar que las acciones realizadas bajo impersonación se registren en el `AuditLog` con el ID del usuario real.

---
[OK] Aprobado para despliegue en entornos de alta seguridad.
