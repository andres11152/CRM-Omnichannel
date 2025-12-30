# 🔧 EMAIL CONFIGURATION - MULTI-TENANT FIX

## Backend Changes (✅ COMPLETADO)

### 1. Email Controller Fix

**Archivo**: `src/controllers/email.controller.ts`

**Antes**:

```typescript
const fromEmail = "noreply@replycrm.com"; // ❌ Hardcodeado
```

**Ahora**:

```typescript
// Busca el correo corporativo de la empresa
const company = await prisma.company.findUnique({...});
const fromEmail =
  company.defaultSenderEmail ||  // Correo configurado
  company.smtpUser ||             // O SMTP user
  "noreply@replycrm.com";         // Fallback
```

---

### 2. Nuevo Endpoint

**GET** `/api/company/email-config`

**Response**:

```json
{
  "status": "success",
  "data": {
    "isConfigured": true, // false si no está configurado
    "senderEmail": "contacto@tuempresa.com",
    "senderName": "Mi Empresa",
    "provider": "SMTP"
  }
}
```

---

## Frontend Implementation (TODO)

### Componente: SendEmailModal

**1. Fetch email config al abrir el modal**:

```typescript
const { data } = await axios.get("/api/company/email-config");

if (!data.data.isConfigured) {
  // Mostrar warning: "Configura tu correo corporativo"
} else {
  // Mostrar: "De: {data.data.senderName} <{data.data.senderEmail}>"
}
```

**2. UI Condicional**:

```tsx
{
  !emailConfig?.isConfigured ? (
    <div className="alert alert-warning">
      ⚠️ Configura tu correo corporativo en Configuración → Email
      <Link to="/settings/email">Configurar ahora</Link>
    </div>
  ) : (
    <div className="email-from">
      <label>De:</label>
      <input
        value={`${emailConfig.senderName} <${emailConfig.senderEmail}>`}
        disabled
      />
    </div>
  );
}
```

---

## Testing

### Sin configurar (empresa nueva):

```bash
GET /api/company/email-config
Response:
{
  "isConfigured": false,
  "senderEmail": null,
  "senderName": null
}
```

### Con configurar (después de Config):

```bash
GET /api/company/email-config
Response:
{
  "isConfigured": true,
  "senderEmail": "info@tuempresa.com",
  "senderName": "Tu Empresa"
}
```

---

## Schema Fields

En `Company` model (ya existen):

- `defaultSenderEmail` - El correo corporativo
- `defaultSenderName` - Nombre de la empresa
- `smtpUser` - Usuario SMTP (fallback)
- `smtpHost`, `smtpPort`, `smtpPassword` - Config SMTP

---

## UX Mejorada

### Antes:

- ❌ Siempre mostraba "Sistema Reply (No-Reply)"
- ❌ Usuario confundido

### Ahora:

- ✅ Si NO configurado: Mensaje amigable + link a configuración
- ✅ Si SÍ configurado: Muestra correo corporativo
- ✅ Usuario sabe qué hacer

---

**Backend Ready** ✅  
**Frontend TODO**: Usar el nuevo endpoint en el modal de enviar email
