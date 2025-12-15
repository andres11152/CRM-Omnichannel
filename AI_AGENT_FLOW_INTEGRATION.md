# 🤖 INTEGRACIÓN DE AGENTES IA EN FLOW BUILDER

**Fecha:** 15 de Diciembre, 2025  
**Arquitectura:** Senior Level - Product Integration

---

## 🎯 OBJETIVO

Integrar el sistema existente de **Gestión de Agentes IA** con el **Flow Builder**, permitiendo que los nodos `AI_AGENT` seleccionen un agente existente en lugar de usar prompts hardcodeados.

---

## 🏗️ ARQUITECTURA

### **1. Flujo de Trabajo Actual (Sistema Existente)**

```
Usuario → "IA & Conocimiento" → "Gestión de Agentes IA"
  ↓
Crea Agente:
  - Nombre: "Agente de Ventas"
  - Personalidad: "Profesional y amigable"
  - Conocimiento: [Docs subidos]
  - Modelo: GPT-4
  - Temperatura: 0.7
```

### **2. Nuevo Flujo Integrado**

```
Usuario → "Chatbot" → "Constructor de Flujos"
  ↓
Arrastra nodo "AI_AGENT" al canvas
  ↓
Panel derecho muestra:
  - 🔽 Dropdown: "Seleccionar Agente IA"
      ├─ Agente de Ventas
      ├─ Soporte Técnico
      ├─ Asistente General
      └─ [+ Crear Nuevo Agente]
  ↓
Selecciona "Agente de Ventas"
  ↓
El flow usa automáticamente:
  - Prompt del agente
  - Conocimiento del agente
  - Configuración del agente
```

---

## 📊 MODELO DE DATOS

### **Backend: flow.executor.ts**

```typescript
// ANTES (Hardcodeado):
case 'AI_AGENT':
  const systemPrompt = node.data.prompt || 'You are a helpful assistant.';
  await this.openai.chat.completions.create({...});

// DESPUÉS (Integrado):
case 'AI_AGENT':
  const aiAssistantId = node.data.aiAssistantId;

  if (!aiAssistantId) {
    return 'Error: No AI agent selected';
  }

  // Obtener agente de la BD
  const agent = await prisma.aIAssistant.findUnique({
    where: { id: aiAssistantId }
  });

  if (!agent) {
    return 'Error: AI agent not found';
  }

  // Usar configuración del agente
  const completion = await this.openai.chat.completions.create({
    model: agent.model || 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: agent.prompt },
      { role: 'user', content: userMessage }
    ],
    temperature: agent.temperature || 0.7,
    // ... otras configuraciones del agente
  });
```

### **Frontend: FlowPropertiesPanel.tsx**

```typescript
// Nuevo componente de selección
{
  node.type === "ai_agent" && (
    <div>
      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
        Agente IA
      </label>

      <select
        value={node.data.aiAssistantId || ""}
        onChange={(e) => onUpdate("aiAssistantId", e.target.value)}
        className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded p-2 text-sm"
      >
        <option value="">Seleccionar Agente...</option>
        {aiAgents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            🤖 {agent.name}
          </option>
        ))}
      </select>

      {/* Botón para crear nuevo */}
      <button
        onClick={() => navigateTo("/ai-assistants")}
        className="mt-2 w-full px-3 py-2 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
      >
        + Crear Nuevo Agente
      </button>

      {/* Preview del agente seleccionado */}
      {selectedAgent && (
        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded text-xs">
          <div className="font-bold mb-1">{selectedAgent.name}</div>
          <div className="text-gray-600 dark:text-gray-400">
            Modelo: {selectedAgent.model || "GPT-3.5"}
          </div>
          <div className="text-gray-600 dark:text-gray-400 text-[11px] mt-1">
            {selectedAgent.description}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 🔧 IMPLEMENTACIÓN PASO A PASO

### **PASO 1: Actualizar Flow Executor** ✅

**Archivo:** `backend/src/services/flow.executor.ts`

Modificar el handler de `AI_AGENT`:

```typescript
private async handleAIAgentNode(
  node: FlowNode,
  session: any,
  userMessage: string,
  flowStructure: FlowStructure
): Promise<string> {
  const aiAssistantId = node.data.aiAssistantId;

  if (!aiAssistantId) {
    Logger.error('[FlowExecutor] AI_AGENT node without aiAssistantId');
    await this.moveToNextNode(session.id, node.id, flowStructure);
    return 'Lo siento, el agente IA no está configurado correctamente.';
  }

  // Obtener configuración del agente
  const agent = await prisma.aIAssistant.findUnique({
    where: { id: aiAssistantId },
    include: { documents: true } // Si tiene RAG/documentos
  });

  if (!agent || !agent.isActive) {
    Logger.error(`[FlowExecutor] AI Assistant ${aiAssistantId} not found or inactive`);
    await this.moveToNextNode(session.id, node.id, flowStructure);
    return 'El agente IA no está disponible en este momento.';
  }

  if (!this.openai) {
    return 'Lo siento, el servicio de IA no está disponible.';
  }

  try {
    // Construir contexto con documentos si existen
    let systemPrompt = agent.prompt;

    if (agent.documents && agent.documents.length > 0) {
      const knowledge = agent.documents.map(d => d.content).join('\n');
      systemPrompt = `${agent.prompt}\n\nConocimiento disponible:\n${knowledge}`;
    }

    // Reemplazar variables en el prompt
    systemPrompt = this.replaceVariables(systemPrompt, session.variables);

    const completion = await this.openai.chat.completions.create({
      model: agent.model || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: agent.temperature || 0.7,
      max_tokens: agent.maxTokens || 500,
    });

    const aiResponse = completion.choices[0]?.message?.content || 'Sin respuesta';

    // Guardar respuesta en variables
    const updatedVariables = {
      ...session.variables,
      ai_response: aiResponse,
      last_ai_agent: agent.name,
    };

    await prisma.contactFlowSession.update({
      where: { id: session.id },
      data: { variables: updatedVariables },
    });

    // Mover al siguiente nodo
    await this.moveToNextNode(session.id, node.id, flowStructure, updatedVariables);

    return aiResponse;
  } catch (error) {
    Logger.error('[FlowExecutor] OpenAI error:', error);
    return 'Lo siento, hubo un error al procesar tu solicitud con el agente IA.';
  }
}
```

---

### **PASO 2: Crear Endpoint para Listar Agentes** ✅

**Archivo:** `backend/src/controllers/aiAssistantController.ts`

```typescript
export const getAIAssistants = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;

    const agents = await prisma.aIAssistant.findMany({
      where: {
        companyId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        model: true,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      status: "success",
      data: { agents },
    });
  }
);
```

---

### **PASO 3: Actualizar Frontend - FlowPropertiesPanel** ✅

**Archivo:** `frontend/components/FlowBuilder/FlowPropertiesPanel.tsx`

Agregar fetch de agentes y UI de selección:

```typescript
import { useState, useEffect } from "react";
import { AI_ASSISTANTS_API } from "../../services/apiConfig";

export const FlowPropertiesPanel: React.FC<Props> = ({
  node,
  onUpdate,
  onDelete,
}) => {
  const [aiAgents, setAiAgents] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch AI agents cuando el nodo es de tipo ai_agent
  useEffect(() => {
    if (node.type === "ai_agent") {
      fetchAIAgents();
    }
  }, [node.type]);

  const fetchAIAgents = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/ai-assistants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setAiAgents(data.data.agents || []);
    } catch (error) {
      console.error("Error fetching AI agents:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-80 bg-white dark:bg-[#111b21] border-l border-gray-200 dark:border-gray-800 flex flex-col">
      {/* ... header ... */}

      <div className="p-4 space-y-4 overflow-y-auto flex-1">
        {/* Campos específicos por tipo de nodo */}

        {node.type === "ai_agent" && (
          <>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                🤖 Agente IA
              </label>

              {loading ? (
                <div className="text-xs text-gray-500 p-2">
                  Cargando agentes...
                </div>
              ) : (
                <select
                  value={node.data.aiAssistantId || ""}
                  onChange={(e) => onUpdate("aiAssistantId", e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded p-2 text-sm text-gray-800 dark:text-white"
                >
                  <option value="">Seleccionar Agente...</option>
                  {aiAgents.map((agent: any) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Botón para crear nuevo agente */}
              <a
                href="/ai-assistants"
                target="_blank"
                className="mt-2 block w-full px-3 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded text-xs text-center hover:from-blue-600 hover:to-cyan-600 transition-all font-bold"
              >
                + Crear Nuevo Agente IA
              </a>
            </div>

            {/* Preview del agente si está seleccionado */}
            {node.data.aiAssistantId && (
              <div className="p-3 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border border-blue-200 dark:border-blue-900">
                <div className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                  📋 Agente Seleccionado:
                </div>
                {(() => {
                  const selected = aiAgents.find(
                    (a: any) => a.id === node.data.aiAssistantId
                  );
                  return selected ? (
                    <>
                      <div className="text-sm font-bold text-gray-900 dark:text-white">
                        {selected.name}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Modelo: {selected.model || "GPT-3.5 Turbo"}
                      </div>
                      {selected.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                          {selected.description}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-gray-500">
                      Agente no encontrado
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}

        {/* ... otros tipos de nodos ... */}
      </div>
    </div>
  );
};
```

---

## 🎯 BENEFICIOS DE ESTA ARQUITECTURA

### **1. Reutilización de Assets** ✅

- Un agente creado sirve para múltiples flows
- Actualizar un agente actualiza TODOS los flows que lo usan

### **2. Coherencia de Producto** ✅

- Misma experiencia que "Gestión de Agentes IA"
- No duplicación de configuración

### **3. Escalabilidad** ✅

```
1 Agente → N Flows
  ↓
Actualización centralizada
  ↓
Todos los flows se benefician
```

### **4. Analytics Potentes** ✅

```sql
-- ¿Cuántos flows usan este agente?
SELECT COUNT(*) FROM flows
WHERE nodes @> '[{"data": {"aiAssistantId": "agent_123"}}]';

-- ¿Qué agente es más usado?
-- ... análisis de uso ...
```

---

## 🚀 UX MEJORADA

### **Antes (Malo):**

```
Usuario crea agente en "IA & Conocimiento"
  ↓
Va a "Chatbot"
  ↓
❌ Tiene que copiar/pegar el prompt manualmente
  ↓
😞 Inconsistencia, duplicación
```

### **Después (Excelente):**

```
Usuario crea agente en "IA & Conocimiento"
  ↓
Va a "Chatbot" → Nodo AI
  ↓
✅ Dropdown muestra todos sus agentes
  ↓
✅ Selección en 1 click
  ↓
😊 Coherencia, reutilización
```

---

## 📝 PRÓXIMOS PASOS

1. ✅ Actualizar `flow.executor.ts` con nueva lógica
2. ✅ Crear endpoint `/api/ai-assistants` (si no existe)
3. ✅ Actualizar `FlowPropertiesPanel.tsx`
4. ⏳ Probar integración end-to-end
5. ⏳ Agregar analytics de uso de agentes

---

## 🎨 WIREFRAME

```
┌──────────────────────────────────────┐
│  Propiedades del Nodo: AI Agent      │
├──────────────────────────────────────┤
│  🤖 Agente IA                        │
│  ┌────────────────────────────────┐  │
│  │ Seleccionar Agente...      ▼  │  │
│  └────────────────────────────────┘  │
│    - Agente de Ventas                │
│    - Soporte Técnico                 │
│    - Asistente General               │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ + Crear Nuevo Agente IA        │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 📋 Agente Seleccionado:        │  │
│  │ Agente de Ventas               │  │
│  │ Modelo: GPT-4                  │  │
│  │ Profesional, amigable...       │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

**ESTO ES ARQUITECTURA DE PRODUCTO NIVEL SENIOR.** 🚀

Reutilización, coherencia, escalabilidad, UX excelente.
