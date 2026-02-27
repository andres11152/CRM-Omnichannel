---
description: Auditoría automática de seguridad multi-tenant para asegurar que todas las consultas a la base de datos estén filtradas por companyId y validadas con Zod.
---

# 🛡️ Secure Scope - Multi-Tenant Security Audit

## Overview

This workflow audits ALL database queries across the codebase to ensure multi-tenant data isolation.

## Steps

### 1. Scan for Direct Prisma Usage Outside Repositories

```bash
# Find all direct prisma calls in services (violations of Repository pattern)
npx grep -rn "prisma\.\w\+\.\(findMany\|findFirst\|findUnique\|create\|update\|delete\)" src/services/ --include="*.ts"
```

### 2. Verify companyId Filter Exists

For each query found, verify:

- ✅ `where: { companyId }` is present in all `findMany`, `findFirst`, `findUnique` calls
- ✅ `data: { companyId }` is present in all `create` calls
- ✅ Deletion queries use `deleteMany({ where: { id, companyId } })` instead of `delete({ where: { id } })`

### 3. Red Flags to Check

- `findUnique({ where: { id } })` without companyId → **CRITICAL IDOR vulnerability**
- `delete({ where: { id } })` without companyId → **CRITICAL cross-tenant deletion**
- `findMany({})` without companyId → **CRITICAL full table leak**

### 4. Exceptions (Acceptable without companyId)

- `TenantContextManager.runAsSystem()` blocks (scheduler, cron jobs)
- Authentication middleware (verifying JWT, user lookup by email)
- Stripe webhook handlers (external ID lookup)

### 5. Validate Zod Schemas

```bash
# Ensure all controller endpoints use Zod validation
npx grep -rn "req.body" src/controllers/ --include="*.ts" | grep -v "schema\|parse\|validate"
```

### 6. Final Verification

```bash
npx tsc --noEmit
npx eslint src/ --ext .ts
```

Both should exit with code 0.
