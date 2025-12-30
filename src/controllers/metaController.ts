// THIS IS BACKEND CODE (Node.js)

import { gateway } from "@/gateways/socketGateway"; // Import the socket gateway
import { metaMediaService } from "@/services/metaMediaService";
import { queueProducer } from "@/services/queueProducer";
import { webhookDispatcher } from "@/services/webhookDispatcher";
import type { Message } from "@prisma/client";
import { MessageDirection, Channel } from "@prisma/client";

// Configuration Constants
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

/**
 * 1. WEBHOOK VERIFICATION (Handshake)
 */
export const verifyWebhook = (req: any, res: any) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === META_VERIFY_TOKEN) {
      console.log("[Meta] Webhook Verified! 🟢");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
};

/**
 * 2. PROCESS INCOMING WEBHOOK (Entry Point)
 * Receives the POST from Meta, saves to DB, and notifies the agent via Socket.
 */
export const handleIncomingWebhook = async (req: any, res: any) => {
  try {
    const body = req.body;

    // 1. Parse the complex Meta JSON
    const parsedData = await processMetaJSON(body);

    if (!parsedData.isValid || !parsedData.data) {
      return res.sendStatus(200); // Always return 200 to Meta to prevent retries
    }

    const data = parsedData.data;
    console.log(
      `[Meta] 📩 Received message from ${data.phoneNumber} (Type: ${data.type})`
    );

    // 2. CONSTRUCT MESSAGE OBJECT
    // Este objeto ahora es compatible con `prisma.message.create`
    const messageToSave: Omit<Message, "createdAt" | "updatedAt"> = {
      id: data.messageId,
      conversationId: "c1", // TODO: Lógica para encontrar o crear conversación
      content: data.messageBody,
      channel: Channel.WHATSAPP, // Asumimos WhatsApp para Meta
      direction: MessageDirection.INBOUND,
      status: "SENT",
      senderId: "user_placeholder", // TODO: Lógica para encontrar o crear usuario
      metadata: null,
    };

    // TODO: Guardar `messageToSave` en la base de datos con `prisma.message.create`
    // const savedMessage = await prisma.message.create({ data: messageToSave });

    // 3. TRIGGER OUTGOING WEBHOOKS (Developer API)
    // Notify external customer systems that a message arrived
    webhookDispatcher.trigger("comp_123", "message.received", messageToSave);

    // 4. ASYNC AI PROCESSING
    // Instead of calling AI directly, we push to queue for scalability
    // @ts-ignore - Legacy code, messageId type mismatch
    queueProducer.addAITaskToQueue({
      messageId: messageToSave.id,
      text: messageToSave.content,
      history: [], // Should fetch from DB
      companyId: "comp_123",
    });

    // 5. REAL-TIME NOTIFICATION
    const assignedAgentId = "a1"; // Simulated assignment
    if (assignedAgentId) {
      // Use the gateway's socket interface to emit the message to the assigned agent
      gateway
        .getIO()
        ?.to(assignedAgentId)
        .emit("message.received", messageToSave);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("[Meta] Error processing webhook:", error);
    res.sendStatus(500);
  }
};

// Helper to extract data and PROCESS MEDIA
const processMetaJSON = async (body: any) => {
  if (body.object) {
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0] &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const change = body.entry[0].changes[0].value;
      const message = change.messages[0];
      const contact = change.contacts ? change.contacts[0] : null;
      const companyId = "comp_123"; // In real app: Look up by WABA ID (change.metadata.phone_number_id)

      let content = "";
      let attachment = undefined;
      const type = message.type;

      // HANDLE TEXT
      if (type === "text") {
        content = message.text.body;
      }
      // HANDLE MEDIA (Image, Audio, Video, Document)
      else if (["image", "video", "audio", "document"].includes(type)) {
        const mediaObj = message[type];
        content = mediaObj.caption || `[${type.toUpperCase()}]`;

        // --- DOWNLOAD FROM META & UPLOAD TO S3 ---
        try {
          const s3Result = await metaMediaService.processMedia(
            mediaObj.id,
            companyId
          );

          attachment = {
            id: mediaObj.id,
            type: s3Result.type,
            url: s3Result.url, // The S3 URL!
            name: mediaObj.filename || `${type}_${mediaObj.id}`,
            mimeType: mediaObj.mime_type,
          };
        } catch (e) {
          console.error("Error processing media:", e);
          content = `[ERROR DOWNLOADING ${type}]`;
        }
      }

      return {
        isValid: true,
        data: {
          phoneNumber: message.from,
          senderName: contact ? contact.profile.name : "Unknown",
          messageBody: content,
          messageId: message.id,
          timestamp: message.timestamp,
          type,
          attachment,
        },
      };
    }
  }
  return { isValid: false };
};

/**
 * 3. SEND WHATSAPP MESSAGE (Redirects to Queue)
 */
export const sendWhatsAppMessage = async (to: string, messageBody: string) => {
  // Call the producer to enqueue
  // @ts-ignore - Legacy code, 'to' type mismatch
  await queueProducer.addMessageToQueue({
    to,
    text: messageBody,
    type: "text",
    companyId: "comp_123",
  });

  // Trigger webhook event for sent message
  webhookDispatcher.trigger("comp_123", "message.sent", {
    to,
    text: messageBody,
    timestamp: new Date(),
  });

  return { success: true };
};
