---
description: Comprehensive System Test Protocol for Reply CRM
---

# 🧪 Protocolo de Pruebas Comprensivas - Reply CRM

Este workflow guía a través de la validación completa de las funcionalidades críticas del sistema, asegurando que todos los módulos operen correctamente.

## 1. 🔐 Autenticación y Sesión de WhatsApp

- [ ] **Login**: Iniciar sesión con credenciales de Agente y Admin.
- [ ] **Estado de Conexión**: Verificar que el indicador de "WhatsApp" en el encabezado muestre "Conectado".
- [ ] **Reconexión**:
  - Forzar una desconexión (si es posible en dev) o reiniciar el backend.
  - Observar que el sistema intente reconectar automáticamente sin intervención manual (SessionGuard).
  - Verificar que no se generen bucles de reinicio ("Emergency Reset").

## 2. 👥 Gestión de Contactos

- [ ] **Crear Contacto**:
  - Ir a módulo "Contactos".
  - Nuevo Contacto -> Llenar Nombre, Teléfono (+57...), Email.
  - Validar que aparezca en la lista inmediatamente (Optimistic UI / Socket).
- [ ] **Editar Contacto**:
  - Abrir el modal de edición implementado recientemente (Background difuminado).
  - Cambiar tags o nombre.
  - Guardar y verificar persistencia.
- [ ] **Filtrado**: Probar la búsqueda por nombre y validación de columnas compactas.

## 3. 💬 Agent Workspace & Mensajería

- [ ] **Recepción de Mensajes**:
  - Enviar un mensaje desde un celular real al número del bot.
  - Verificar:
    - Sonido de notificación.
    - Contador de "No leídos" incrementa.
    - Ticket aparece en "Cola de Espera" (si no está asignado) o en "Mis Chats".
- [ ] **Envío de Mensajes**:
  - Responder al mensaje.
  - Verificar doble check (Enviado/Entregado/Leído).
  - Probar envío de emojis y adjuntos (si aplica).
- [ ] **Gestión de Tickets**:
  - **Pick**: Tomar un ticket de la cola. Verificar que pase a "Mis Chats".
  - **Transferir**: Usar el modal de transferencia para pasar el chat a otro agente o devolverlo a la cola.
    - _Nota_: Verificar que los grupos no salgan en la cola general.
  - **Cerrar/Resolver**: Marcar como resuelto y verificar que desaparezca de la vista activa.

## 4. 🧩 Customer 360 & CRM

- [ ] **Panel 360**:
  - Abrir un chat.
  - Verificar panel derecho con información del contacto (Español).
- [ ] **Notas Internas**:
  - Escribir una nota interna (con mención @ si aplica).
  - Verificar que se guarde en la bitácora.
  - Eliminar una nota (Confirmar modal).
- [ ] **Pipeline (Deals)**:
  - Desde el panel 360, ver la sección "Pipeline".
  - **Crear Deal**: Usar el modal (ahora centrado).
    - Llenar: Título, Valor, Etapa.
    - Guardar.
  - Verificar que el deal aparezca en el resumen del Customer 360.
  - Validar que el botón "Crear" redundante ya no esté en el encabezado del widget.
- [ ] **Agendar Reunión**: Clic en "Agendar Reunión" y verificar funcionalidad (o placeholder).

## 5. 🚀 Marketing & Plantillas

- [ ] **Dashboard Marketing**:
  - Ir a módulo Marketing.
  - **Crear Plantilla**:
    - Clic "Nueva Plantilla".
    - Verificar que el modal esté POR ENCIMA del sidebar (Z-Index fix).
    - Usar el editor visual.
    - Insertar imagen desde Galería Multimedia (verificar modal global).
    - Guardar plantilla.
- [ ] **Enviar Campaña**:
  - Seleccionar la plantilla creada.
  - Lanzar campaña a un segmento de prueba o contacto individual.
  - Verificar recepción en el celular destino.

## 6. ⚙️ Configuraciones & Sistema

- [ ] **Logs del Servidor**: Revisar terminal para asegurar que no hay errores de `Unhandled Promise Rejection` o desconexiones de Prisma.
- [ ] **Performance**: Navegar entre módulos rápidamente para verificar carga de UI y estado de Sockets.

---

**Resultado Esperado**: El sistema debe sentirse fluido, los modales deben estar correctamente posicionados (z-index), y no deben haber errores de conexión persistentes con WhatsApp.
