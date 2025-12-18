# LID Resolution - Sistema Implementado

## Estado Actual (18 Dec 2025 13:22)

### ✅ Implementaciones Completadas:

1. **`persistLidMapping`** (Líneas 605-683)

   - ✅ Validación completa anti-self-mapping
   - ✅ Bloqueo de LIDs como teléfonos (length > 14)
   - ✅ Auto-corrección de datos corruptos
   - ✅ No usa `sessionRecord` - usa `sessionId` correctamente

2. **`resolveLid`** (Líneas 150-218)
   - ✅ Validación anti-self-mapping en memoria
   - ✅ Validación anti-self-mapping en DB
   - ✅ Rechaza resoluciones a otros LIDs
3. **Smart Extraction** (Líneas 775-853)

   - ✅ Extrae número real de `msg.key.participant`
   - ✅ Extrae de `msg.participant`
   - ✅ Extrae de `msg.messageStubParameters`
   - ✅ Sincroniza nombre (`pushName`)
   - ✅ Previene doble procesamiento con `!foundRealPhone`

4. **Auto-Learning** (Líneas 301-348)
   - ✅ Aprende mapeos de `contacts.upsert`
   - ✅ Persiste a BD automáticamente

### 🔧 Validaciones Activas:

```typescript
// En persistLidMapping:
- cleanPhone === cleanLid → REJECT
- cleanPhone.length > 14 → REJECT
- phone.includes('@lid') && lid.includes('@lid') → REJECT

// En resolveLid:
- cleanResolved === target → RETURN null
- cleanResolved.length > 14 → RETURN null
- cleanPhone === target (DB) → RETURN null
```

### 📊 Flujo de Mensajes:

```
Mensaje LID Ingresante (4590...@lid)
    ↓
Smart Extract busca en metadata
    ├─ Encontrado: 573...@s.whatsapp.net
    │   ├─ targetJid = 573...
    │   ├─ Persist LID mapping
    │   ├─ Sync name (pushName)
    │   └─ SKIP LID Resolution (evita duplicados)
    │
    └─ No encontrado:
        ↓
    LID Resolution (store/DB)
        ├─ Encontrado: 573...
        │   ├─ targetJid = 573...
        │   └─ Persist mapping
        │
        └─ No encontrado:
            └─ targetJid = 4590... (Fallback permisivo)
```

### 🎯 Logs Esperados (Éxito):

```
[SmartExtract] 💡 Found Real Phone in key.participant: 573...@s.whatsapp.net
[SmartExtract] 🔀 FORCING Swap: 4590...@lid -> 573...
[SmartExtract] 👤 Updated contact name: 573... -> ~AB
[PersistLID] 💾 Saving mapping: 573... <-> 4590...
[Fix] Routing Message to: 573... (Was fromMe: false)
```

### ⚠️ Problemas Conocidos:

1. **sessionRecord**: Solo existe en scope de `sendMessage`, NO en eventos
   - ✅ Corregido en línea 314 (paso 563)
2. **Split Brain**: Si ambos fallan, crea chat LID
   - ✅ Mitigado con "Permissive Fallback" + Auto-Learning
3. **Datos Corruptos Existentes**: BD puede tener LID=LID
   - ✅ Mitigado con auto-corrección en línea 665

### 🚀 Próximos Pasos (Si persisten problemas):

1. Limpiar BD manualmente:

   ```sql
   UPDATE contacts
   SET customFields = jsonb_set(customFields, '{lid}', 'null')
   WHERE phone = (customFields->>'lid')::text;
   ```

2. Verificar que NO hay múltiples instancias de backend corriendo

3. Confirmar que Redis está activo y accesible
