// ========================================
// AGREGAR ESTA FUNCIÓN AL messageProcessor.service.ts
// INSERTAR DESPUÉS DE LA LÍNEA 344 (después de _emitSocketEvents)
// ========================================

// PASO 1: Agregar esta línea ANTES del } catch (error) en la línea 345:
/*
      // 8. 🤖 AI AUTO-RESPONSE (CRITICAL - WAS MISSING!)
      if (!isOutbound) {
        console.log(`[MsgProcessor] 🤖 Checking AI auto-response for conversation ${conversation.id}`);
        this._triggerAIResponse(conversation.id, text, companyId).catch(err => {
          console.error(`[MsgProcessor] AI response failed:`, err);
        });
      }
*/

// PASO 2: Agregar este método DESPUÉS de _processSafe y ANTES de _emitSocketEvents:
  /**
   * 🤖 AI AUTO-RESPONSE TRIGGER
   * Triggers asynchronously to not block message processing
   */
  async _triggerAIResponse(conversationId: string, userMessage: string, companyId: string) {
    try {
      // 1. Get conversation with queue/AI info
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          queue: {
            include: {
              aiAssistant: true
            }
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: { sender: true }
          }
        }
      });

      if (!conversation?.queue?.aiAssistant) {
        console.log(`[AI] No AI assistant in queue for conversation ${conversationId}`);
        return;
      }

      const aiAssistant = conversation.queue.aiAssistant;

      if (!aiAssistant.isActive) {
        console.log(`[AI] AI assistant inactive: ${aiAssistant.name}`);
        return;
      }

      console.log(`[AI] ✓ Generating response with: ${aiAssistant.name}`);

      // 2. Format history (exclude the last message since it's the user message we're responding to)
      const history = conversation.messages.slice(1).reverse().map(msg => ({
        role: msg.direction === 'INBOUND' ? ('user' as const) : ('model' as const),
        parts: msg.content
      }));

      // 3. Generate AI response
      const { generateAIResponse } = await import('./aiResponseService');
      const aiText = await generateAIResponse(
        companyId,
        aiAssistant.id,
        userMessage,
        history
      );

      if (!aiText) {
        console.warn(`[AI] No response generated`);
        return;
      }

      console.log(`[AI] ✓ Generated: "${aiText.substring(0, 60)}..."`);

      // 4. Create bot user if needed
      const botEmail = `ai_${aiAssistant.id}@reply.bot`;
      let botUser = await prisma.user.findUnique({ where: { email: botEmail } });

      if (!botUser) {
        const bcrypt = require('bcryptjs');
        botUser = await prisma.user.create({
          data: {
            email: botEmail,
            name: aiAssistant.name,
            password: await bcrypt.hash(aiAssistant.id, 10),
            role: 'AGENT',
            companyId
          }
        });
      }

      // 5. Save AI message
      const aiMessage = await prisma.message.create({
        data: {
          conversationId,
          content: aiText,
          channel: 'WHATSAPP',
          direction: 'OUTBOUND',
          senderId: botUser.id
        },
        include: { sender: true }
      });

      // 6. Emit via socket
      const io = gateway.getIO();
      if (io) {
        io.to(conversationId).emit('conversation.new_message', aiMessage);
        io.to(`company:${companyId}`).emit('conversation.updated', {
          id: conversationId,
          lastMessage: aiText,
          lastMessageAt: aiMessage.createdAt
        });
      }

      // 7. Send via WhatsApp
      const { whatsappService } = await import('./whatsapp.service');
      await whatsappService.sendMessage(
        conversation.channelId,
        aiText,
        {
          companyId,
          conversationId,
          senderId: botUser.id
        }
      );

      console.log(`[AI] ✅ Response sent successfully`);

    } catch (error) {
      console.error(`[AI] Error in auto-response:`, error);
    }
  },
