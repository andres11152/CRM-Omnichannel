# 🚀 Sistema de Gestión de Flujos - Implementación Completa

**Estado:** Backend 100% ✅ | Frontend 60% ⏳  
**Tiempo restante estimado:** 20-30 minutos

---

## ✅ LO QUE YA ESTÁ LISTO:

### **Backend (100% Completo)**

- ✅ `flowController.ts` - Todos los métodos CRUD
- ✅ `flowRoutes.ts` - Todas las rutas configuradas
- ✅ Base de datos (`Workflow` model en Prisma)

**Endpoints disponibles:**

```
GET    /api/flows          - Lista todos los flujos
GET    /api/flows/:id      - Obtiene un flujo específico
POST   /api/flows          - Crea nuevo flujo
PUT    /api/flows/:id      - Actualiza flujo
DELETE /api/flows/:id      - Elimina flujo
PATCH  /api/flows/:id/toggle - Activa/Desactiva
POST   /api/flows/:id/duplicate - Duplica flujo
```

### **Frontend (60% Completo)**

- ✅ `FlowsListPage.tsx` - Página de lista creada
- ✅ `FlowBuilder` - Constructor ya existe
- ⏳ **Falta:** Integrar carga/guardado de flows

---

## 🔧 LO QUE FALTA IMPLEMENTAR:

### **1. Actualizar FlowBuilder para trabajar con IDs** (15 min)

El `FlowBuilder` actual NO carga ni guarda flows por ID. Necesita:

**a) Agregar prop `flowId` (opcional):**

```tsx
interface FlowBuilderProps {
  flowId?: string; // Si existe, carga ese flow. Si no, flow nuevo
}
```

**b) useEffect para cargar flow existente:**

```tsx
useEffect(() => {
  if (flowId) {
    // Fetch flow desde /api/flows/:id
    // Cargar nodes y edges al estado
  }
}, [flowId]);
```

**c) Función de guardar:**

```tsx
async function handleSave() {
  const payload = {
    name: flowName,
    nodes,
    edges,
    triggerType,
    triggerConfig,
    isActive,
  };

  if (flowId) {
    // PUT /api/flows/:id (actualizar)
  } else {
    // POST /api/flows (crear nuevo)
  }
}
```

---

### **2. Actualizar Rutas en App.tsx** (5 min)

**Cambiar de:**

```tsx
{
  activeTab === "flows" && <FlowBuilder />;
}
```

**A sistema de rutas:**

```tsx
// Opción A: Mantener tabs pero cambiar contenido
{
  activeTab === "flows" && <FlowsListPage />;
}

// El FlowBuilder se abre desde FlowsListPage con:
// navigate(`/chatbot/flujos/${id}/editar`)
```

**Opción B (Recomendada):** Usar React Router

```tsx
<Route path="/chatbot/flujos" element={<FlowsListPage />} />
<Route path="/chatbot/flujos/nuevo" element={<FlowBuilder />} />
<Route path="/chatbot/flujos/:id/editar" element={<FlowBuilder />} />
```

---

### **3. Agregar React Router (Si no existe)** (10 min)

**Instalar:**

```bash
npm install react-router-dom
```

**Envolver App:**

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainApp />} />
        {/* ... otras rutas */}
      </Routes>
    </BrowserRouter>
  );
}
```

---

## 🎯 DECISIÓN RÁPIDA:

### **Opción 1: SIN React Router (Más Rápido - 10 min)**

- Cambiar tab "flows" para mostrar `FlowsListPage`
- FlowBuilder recibe `flowId` como prop
- `FlowsListPage` maneja estado de "qué flow editar"

### **Opción 2: CON React Router (Profesional - 30 min)**

- URLs limpias (`/chatbot/flujos/abc123/editar`)
- Navegación más clara
- Mejor UX (refresh mantiene el flow)

---

## 📋 PLAN DE ACCIÓN RECOMENDADO:

### **PASO 1:** Actualizar FlowBuilder (CRÍTICO)

```tsx
// 1. Agregar import
import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../services/apiConfig";

// 2. Agregar props
interface FlowBuilderProps {
  flowId?: string;
  onSave?: () => void;
}

// 3. Cargar flow si existe
useEffect(() => {
  if (props.flowId) {
    loadFlow(props.flowId);
  }
}, [props.flowId]);

async function loadFlow(id: string) {
  const res = await fetch(`${API_BASE_URL}/flows/${id}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
  const flow = await res.json();
  setNodes(flow.nodes || []);
  setEdges(flow.edges || []);
  // ... setear otros campos
}

// 4. Guardar flow
async function handleSaveFlow() {
  const method = flowId ? "PUT" : "POST";
  const url = flowId
    ? `${API_BASE_URL}/flows/${flowId}`
    : `${API_BASE_URL}/flows`;

  await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    body: JSON.stringify({
      name: flowName,
      nodes,
      edges,
      triggerType,
      triggerConfig,
      isActive: true,
    }),
  });

  if (onSave) onSave();
}
```

### **PASO 2:** Modificar App.tsx

```tsx
// Cambiar:
{
  activeTab === "flows" && <FlowBuilder />;
}

// Por:
{
  activeTab === "flows" && <FlowsListPage />;
}
```

### **PASO 3:** Manejar estado en FlowsListPage

```tsx
const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
const [creatingNew, setCreatingNew] = useState(false);

if (creatingNew || editingFlowId) {
  return (
    <FlowBuilder
      flowId={editingFlowId || undefined}
      onSave={() => {
        setCreatingNew(false);
        setEditingFlowId(null);
        fetchFlows(); // Recargar lista
      }}
    />
  );
}

// ... resto del componente (grid de flows)
```

---

## 🚦 ¿Qué opción prefieres?

**A) Opción Rápida (10 min)** - Sin React Router, estado local  
**B) Opción Profesional (30 min)** - Con React Router, URLs propias

**Responde A o B y continúo con la implementación completa.** 🚀
