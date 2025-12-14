# DEBUG: Profile Picture Not Persisting

## Pasos para Diagnosticar:

1. **Reiniciar backend** con los cambios de Prisma:

   ```bash
   npm run dev
   ```

2. **Enviar un mensaje desde WhatsApp** a tu número conectado

3. **Buscar en los logs del backend** estas líneas:

   ```
   [WhatsApp Debug] Raw Message Structure:
   ```

4. **Verificar si aparece**:

   ```
   [MsgProcessor] ⚡ Processing IN | Phone: XXXXXXXXX
   ```

5. **Abrir Prisma Studio** (ya está corriendo):
   - Ir a tabla `User`
   - Buscar el usuario con el teléfono del contacto
   - Verificar si el campo `profilePicUrl` tiene valor

## Posibles Causas:

### Causa 1: WhatsApp no devuelve la foto

- **Síntoma**: `profilePicUrl` es `undefined` en logs
- **Solución**: El contacto tiene privacidad activada, no hay foto disponible

### Causa 2: Prisma no guarda el campo

- **Síntoma**: `profilePicUrl` aparece en logs pero NO en BD
- **Solución**: Verificar que Prisma Client esté actualizado

### Causa 3: Frontend no usa el campo

- **Síntoma**: `profilePicUrl` está en BD pero no se muestra
- **Solución**: Ya corregido en ChatInterface.tsx

## Test Rápido:

Ejecuta en Prisma Studio:

```sql
SELECT id, name, phone, "profilePicUrl", about
FROM "User"
WHERE phone IS NOT NULL
ORDER BY "createdAt" DESC
LIMIT 5;
```

Si `profilePicUrl` es NULL para todos → Problema en backend
Si `profilePicUrl` tiene valor → Problema en frontend
