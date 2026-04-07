---
description: CRM and Sales Pipeline Validation Workflow
---

#  CRM & Sales Workflow - Protocolo de Validación

Este workflow está diseñado para probar a fondo el módulo de CRM, asegurando que el ciclo de ventas fluya correctamente desde el contacto hasta el cierre del negocio.

## 1.  Gestión de Contactos (La Base)

- [ ] **Creación de Prospecto**:
  - Navegar a "Contactos".
  - Crear un nuevo contacto manual: "Juan Pérez (CEO)".
  - Asignar etiquetas: "Prospecto", "VIP".
  - Verificar que no se duplique si ya existe el número.
- [ ] **Enriquecimiento del Perfil (360°)**:
  - Abrir el perfil de "Juan Pérez".
  - Editar información: Agregar cargo "Gerente General", Empresa "Tech Corp".
  - Verificar que el avatar se genere o cargue correctamente.
  - Confirmar que el panel lateral (Customer 360) muestre los datos actualizados.

## 2. [STAT] Pipeline y Deals (Oportunidades)

- [ ] **Creación de Deal**:
  - Desde el **Panel 360** del contacto:
    - Clic en el botón "Crear Deal" (en la sección Pipeline).
    - **Título**: "Licencia Enterprise 2024".
    - **Valor**: $5,000 USD.
    - **Etapa**: "Nuevo" / "Prospección".
    - **Fecha de Cierre**: Fin de mes.
    - **Guardar**: Verificar que el modal se cierre y el deal aparezca en el resumen 360.
- [ ] **Visualización Kanban** (Si aplica en módulo principal):
  - Ir a la vista de "Ventas" o "Pipeline".
  - Localizar el deal "Licencia Enterprise 2024".
  - Arrastrar el deal a la siguiente etapa (ej. "Negociación").
  - Verificar que el valor total de la columna se actualice.

## 3.  Bitácora de Actividades (Seguimiento)

- [ ] **Notas Internas**:
  - En el Panel 360, agregar una nota: "El cliente está interesado pero pide descuento".
  - Verificar que aparezca con la fecha y el autor correctos.
- [ ] **Agendar Actividades**:
  - Crear una **Tarea**: "Llamar para seguimiento" (Fecha: Mañana).
  - Registrar una **Llamada**: "Demo presentada" (Resultado: Exitosa).
  - Verificar que estas actividades aparezcan en la "Línea de Tiempo" (Timeline) del contacto.

## 4. [SYNC] Flujo de Conversión

- [ ] **Mover a Ganado**:
  - Cambiar la etapa del deal a "Cerrado Ganado".
  - Verificar si hay alguna automatización (ej. etiqueta "Cliente", mensaje de felicitación).
- [ ] **Mover a Perdido**:
  - Crear otro deal de prueba.
  - Mover a "Cerrado Perdido".
  - Seleccionar motivo de pérdida (si el sistema lo pide).

## 5. [SEARCH] Buscador y Filtros

- [ ] **Búsqueda Global**:
  - Buscar "Juan Pérez" en la barra superior.
  - Buscar "Licencia Enterprise" para encontrar el deal directamente.
- [ ] **Filtrado por Etapa**:
  - En la vista de lista/Kanban, filtrar solo los deals en "Negociación".

---

**Objetivo**: Confirmar que un agente de ventas puede gestionar todo el ciclo de vida del cliente sin salir de la plataforma y sin errores de interfaz.
