# 🚀 PRODUCTION DEPLOYMENT CHECKLIST

## ✅ PASO 1: Variables de Entorno (.env)

### **CRÍTICO - Actualizar estos valores en Render/producción:**

```env
# === CORE ===
NODE_ENV=production
PORT=4000
DATABASE_URL="postgresql://..." # Tu Render PostgreSQL URL

# === FRONTEND ===
FRONTEND_URL=https://reply.software  # ← ACTUALIZAR EN PRODUCCIÓN
BACKEND_URL=https://api.reply.software # ← ACTUALIZAR EN PRODUCCIÓN

# === JWT ===
JWT_SECRET=<genera-nuevo-secret-seguro>  # ← CAMBIAR EN PRODUCCIÓN
JWT_EXPIRES_IN=7d

# === REDIS ===
REDIS_URL=rediss://red-XXX:PORT@oregon-keyvalue.render.com:6379  # Ya configurado

# === AWS S3 ===
STORAGE_PROVIDER=s3
AWS_REGION=us-east-2
S3_BUCKET_NAME=reply-media
AWS_ACCESS_KEY_ID=<tu-aws-key>
AWS_SECRET_ACCESS_KEY=<tu-aws-secret>

# === GOOGLE OAUTH ===
GOOGLE_CLIENT_ID=<tu-google-client-id>
GOOGLE_CLIENT_SECRET=<tu-google-client-secret>
GOOGLE_REDIRECT_URI=https://api.reply.software/api/google/callback  # ← ACTUALIZAR

# === STRIPE ===
STRIPE_SECRET_KEY=sk_live_...  # ← USA LIVE KEY EN PRODUCCIÓN
STRIPE_WEBHOOK_SECRET=whsec_...

# === GEMINI AI ===
GEMINI_API_KEY=<tu-gemini-key>

# === CORS ===
ALLOWED_ORIGINS=https://reply.software,https://www.reply.software
```

---

## 📋 PASO 2: Configurar Google Cloud Console

### **2.1 Ir a Google Cloud Console**

https://console.cloud.google.com/apis/credentials

### **2.2 Actualizar OAuth 2.0 Client**

**Authorized JavaScript origins:**

```
https://reply.software
https://www.reply.software
```

**Authorized redirect URIs:**

```
https://api.reply.software/api/google/callback
https://reply.software/oauth/callback
```

### **2.3 Copiar credenciales**

- Client ID → `GOOGLE_CLIENT_ID`
- Client Secret → `GOOGLE_CLIENT_SECRET`

---

## 🗑️ PASO 3: Archivos a Eliminar Antes de Deploy

```bash
# Archivos de debug/temp (YA ELIMINADOS)
✅ TEMP_SERVER_FIX.txt
✅ src/debug-worker.ts

# Dejar estos (son documentación útil):
✓ QUEUE_IMPLEMENTATION.md
✓ MIGRATION_TO_SQS.md
```

---

## 🔒 PASO 4: Seguridad para Producción

### **4.1 Generar JWT Secret Seguro**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### **4.2 Verificar CORS**

En `src/middleware/securityMiddleware.ts` ya está configurado para leer de `ALLOWED_ORIGINS`.

### **4.3 Rate Limiting**

Ya configurado en `server.ts`:

- 100 requests/15min por IP ✅

---

## 📦 PASO 5: Deploy a Render

### **5.1 Build Command**

```bash
npm install && npx prisma generate && npm run build
```

### **5.2 Start Command**

```bash
npm run start
```

### **5.3 Environment Variables**

Copiar TODAS las variables del `.env` a Render Dashboard.

**IMPORTANTE:**

- ✅ Usar `FRONTEND_URL=https://reply.software`
- ✅ Usar `BACKEND_URL=https://api.reply.software`
- ✅ Usar `GOOGLE_REDIRECT_URI=https://api.reply.software/api/google/callback`
- ✅ Usar Stripe LIVE keys
- ✅ Nuevo JWT_SECRET

---

## 🧪 PASO 6: Verificar Post-Deploy

### **6.1 Health Check**

```bash
curl https://api.reply.software/health
```

### **6.2 Test Google OAuth**

1. Ir a `https://reply.software`
2. Click "Conectar Google Calendar"
3. Debe redirigir a Google OAuth
4. Debe volver a `https://reply.software/oauth/callback`

### **6.3 Test WhatsApp**

1. Enviar mensaje de texto ✅
2. Enviar imagen ✅
3. (Notas de voz deshabilitadas temporalmente)

---

## 📊 PASO 7: Monitoreo

### **Logs en Render:**

```bash
# Ver logs en tiempo real
https://dashboard.render.com/web/[tu-service]/logs
```

### **Métricas a monitorear:**

- ✅ CPU < 80%
- ✅ Memory < 512MB
- ✅ Response time < 500ms
- ✅ Error rate < 1%

---

## 🔥 TROUBLESHOOTING

### **Error: "CORS blocked"**

→ Verificar `ALLOWED_ORIGINS` incluye tu dominio frontend

### **Error: "Google OAuth redirect mismatch"**

→ Verificar `GOOGLE_REDIRECT_URI` en .env coincide con Google Console

### **Error: "Database connection failed"**

→ Verificar `DATABASE_URL` tiene SSL: `?sslmode=require`

### **Error: "Redis timeout"**

→ Verificar `REDIS_URL` incluye credenciales correctas

---

## ✅ CHECKLIST FINAL

Antes de hacer deploy, verifica:

- [ ] `.env` tiene valores de producción
- [ ] JWT_SECRET es nuevo y seguro
- [ ] Google OAuth redirect URI actualizado
- [ ] Stripe usa LIVE keys
- [ ] FRONTEND_URL apunta a dominio real
- [ ] BACKEND_URL apunta a API real
- [ ] S3 bucket configurado
- [ ] Redis configurado
- [ ] PostgreSQL configurado
- [ ] Archivos temp eliminados

---

**Tu CRM está LISTO para producción. 🎉**
