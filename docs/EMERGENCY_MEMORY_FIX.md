# 🚨 EMERGENCY FIX - Memory Leak & Slow Queries

## PROBLEMA CRÍTICO:

- Memory usage: 94-96% constante
- `/stats` endpoint: 3-5 segundos por request
- Sin caché, queries redundantes

## CAUSA RAÍZ:

`getDashboardStats()` hace ~15 queries Prisma sin caché cada vez que se llama.

## SOLUCIÓN INMEDIATA:

### 1. Reiniciar el servidor (AHORA)

```bash
# En terminal backend, presiona Ctrl+C y luego:
npm run dev
```

### 2. Implementar caché de stats (5 min TTL)

Agregar a `dashboardController.ts`:

```typescript
// Caché simple en memoria
const statsCache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Al inicio de getDashboardStats:
const cacheKey = `stats:${companyId}`;
const cached = statsCache.get(cacheKey);
if (cached && cached.expires > Date.now()) {
  return res.json(cached.data);
}

// Al final, antes de res.json():
statsCache.set(cacheKey, {
  data: response,
  expires: Date.now() + CACHE_TTL,
});
```

### 3. Reducir frecuencia de polling en frontend

En el dashboard component, cambiar:

```typescript
// De cada 10s a cada 30s
setInterval(() => fetchStats(), 30000);
```

### 4. Limpiar caché periódicamente

```typescript
setInterval(() => {
  for (const [key, value] of statsCache.entries()) {
    if (value.expires < Date.now()) {
      statsCache.delete(key);
    }
  }
}, 60000); // Cada minuto
```

## MEJORAS ADICIONALES (Opcional):

### Índices de base de datos

```sql
CREATE INDEX idx_tickets_company_status ON tickets(company_id, status);
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX idx_conversations_company_updated ON conversations(company_id, updated_at);
```

### Limitar mensajes en memoria (Baileys)

En `whatsapp.service.ts`:

```typescript
messageRetryMap.set("max", 100); // Máximo 100 mensajes en retry
```

## COMANDO DE EMERGENCIA:

Si el servidor no responde, forzar reinicio:

```powershell
taskkill /F /IM node.exe
cd backend
npm run dev
```

## MONITOREO:

Watch memory:

```powershell
node --inspect --max-old-space-size=4096 src/server.ts
```

chrome://inspect para ver memory profiler
