---
description: Linter de purismo de tipos y limpieza de código para asegurar el estándar de "Never use `any`".
---

# [VIP] Type & Clean Code Audit Workflow (Rule #2)

Este workflow garantiza que el código de SkyCode Agency sea de Clase Mundial, libre de tipos genéricos (`any`) y debilidades estructurales.

## 1. [SEARCH] Detección de `any` (Prohibido)

- [ ] Buscar instancias de `: any` o `as any` en el proyecto.
  ```bash
  grep -rn ": any" src/**/*.ts | grep -v "node_modules"
  grep -rn "as any" src/**/*.ts | grep -v "node_modules"
  ```
- [ ] Para cada `any` encontrado:
  - Definir una interfaz en `src/types/`.
  - Crear un tipo específico para el `payload`.
  - Usar `unknown` si el tipo no es conocido, pero validarlo con Zod antes de usarlo.

## 2.  Auditoría de `console.log` (Regla #5)

- [ ] Buscar `console.log` o `console.error` perdidos.
  ```bash
  grep -rn "console.log" src/**/*.ts | grep -v "node_modules"
  ```
- [ ] Reemplazar por `Logger.info`, `Logger.error`, `Logger.warn` (Winston/Pino).
- [ ] Asegurar que el `Logger.error` incluya el `stack trace` y el `companyId` del contexto.

## 3. [SEC] Manejo de Errores (Fail-Safe)

- [ ] Verificar que cada bloque `catch` realice loggeo del error.
- [ ] Asegurar que no haya `promises` sin `await` (a menos que sea intencional).
- [ ] Comprobar que los controladores devuelvan códigos de error coherentes (`400`, `401`, `403`, `404`, `500`).

## 4. [PKG] Verificación de Compilación (TypeScript)

- [ ] Ejecutar el chequeo de tipos estricto.
  ```bash
  npm run build # O npx tsc --noEmit
  ```
- [ ] Confirmar que no hay errores de tipado o de declaración de variables.

---
**Senior Reminder**: "Un `any` es una deuda técnica con interés compuesto que pagamos en producción."
