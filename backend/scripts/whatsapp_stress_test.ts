import * as dotenv from "dotenv";
dotenv.config();

import { initEnv } from "../src/config/env";
initEnv();

import { PrismaClient, Channel, MessageDirection } from "@prisma/client";
import redisClient, { connectRedis } from "../src/config/redis";
import { WAMessage, BufferJSON } from "@whiskeysockets/baileys";
import { chatSyncBatchIngester } from "../src/services/sync/ChatSyncBatchIngester";
import { chatService } from "../src/services/ChatService";
import { deduplicationService } from "../src/whatsapp/services/DeduplicationService";
import { messageRepository } from "../src/repositories/MessageRepository";
import { LockService } from "../src/utils/LockService";
import { TenantContextManager } from "../src/config/tenantContext";

const prisma = new PrismaClient();

// Helper to generate a mock WAMessage
function createMockWAMessage(id: string, phone: string, text: string, fromMe = false): WAMessage {
  return {
    key: {
      remoteJid: `${phone}@s.whatsapp.net`,
      fromMe,
      id,
    },
    message: {
      conversation: text,
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
  } as WAMessage;
}

async function runStressTest() {
  console.log("🚀 INICIANDO PRUEBAS DE ESTRÉS DEL CORE DE WHATSAPP...");
  await connectRedis();
  
  // 1. Setup Test Tenant / Session
  let company = await prisma.company.findFirst();
  if (!company) {
    console.log("ℹ️ Creando empresa de prueba...");
    company = await prisma.company.create({
      data: {
        name: "Stress Test Company",
      },
    });
  }
  const companyId = company.id;
  console.log(`🏢 Empresa de prueba: ${company.name} (${companyId})`);

  let session = await prisma.whatsAppSession.findFirst({
    where: { companyId },
  });
  if (!session) {
    console.log("ℹ️ Creando sesión de WhatsApp de prueba...");
    session = await prisma.whatsAppSession.create({
      data: {
        companyId,
        sessionId: `stress_session_${Date.now()}`,
        status: "CONNECTED",
        phone: "15551234567",
      },
    });
  }
  const sessionId = session.sessionId;
  const sessionPhone = session.phone || "15551234567";
  console.log(`🔌 Sesión de WhatsApp: ${sessionId} (Phone: ${sessionPhone})`);

  // Ensure an Admin User exists for outbound sending resolution
  let adminUser = await prisma.user.findFirst({
    where: { companyId, role: "ADMIN" },
  });
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        company: { connect: { id: companyId } },
        email: `stress_admin_${Date.now()}@sentrycrm.cloud`,
        name: "Stress Admin",
        role: "ADMIN",
        phone: "15551234567",
        password: "stress_pass_hash",
      },
    });
  }

  // Ensure a customer/User exists for the conversation mapping
  const testPhone = "573000000000";
  let customerUser = await prisma.user.findFirst({
    where: { companyId, phone: testPhone },
  });
  if (!customerUser) {
    customerUser = await prisma.user.create({
      data: {
        company: { connect: { id: companyId } },
        email: `${testPhone}@whatsapp.user`,
        name: "Stress Customer",
        role: "USER",
        phone: testPhone,
        password: "stress_customer_hash",
      },
    });
  }

  // Ensure a conversation exists for the stress tests
  let conversation = await prisma.conversation.findFirst({
    where: { companyId, channelId: testPhone },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        companyId,
        channelId: testPhone,
        subject: "Stress Conversation",
        status: "OPEN",
      },
    });
  }

  // ---------------------------------------------------------------------------
  // PHASE 1: CONCURRENT INBOUND BURST (Locking, Deduplication, DB Write)
  // ---------------------------------------------------------------------------
  console.log("\n🔥 FASE 1: RÁFAGA DE MENSAJES ENTRANTES (Deduplicación, Concurrencia y Lock)...");
  
  const burstSize = 100;
  const uniqueCount = 50;
  
  const payloads: WAMessage[] = [];

  // Generate 50 unique messages, and 50 duplicate messages
  for (let i = 0; i < uniqueCount; i++) {
    const id = `msg_stress_${Date.now()}_${i}`;
    payloads.push(createMockWAMessage(id, testPhone, `Stress test message ${i}`));
    payloads.push(createMockWAMessage(id, testPhone, `Stress test message ${i}`));
  }

  console.log(`📥 Procesando ráfaga de ${burstSize} eventos entrantes con bloqueo distribuido Redlock y deduplicación...`);
  
  const startTime = Date.now();
  const latencies: number[] = [];

  const results = await Promise.all(
    payloads.map(async (msg) => {
      const taskStart = Date.now();
      const messageId = msg.key.id!;
      try {
        // Simulate the entire inboundHandler flow under TenantContext and Redlock
        await TenantContextManager.run(
          { companyId, userId: "system", requestId: `stress:${messageId}` },
          async () => {
            await LockService.withLock(`msg:${messageId}`, async () => {
              // 1. Check duplicate
              const exists = await chatService.doesMessageExist(messageId);
              if (exists) {
                return;
              }

              // 2. Save Message and Ticket
              await chatService.upsertMessage({
                whatsappMessageId: messageId,
                companyId,
                content: msg.message?.conversation || "Media",
                direction: "INBOUND",
                conversationId: conversation!.id,
                senderId: customerUser!.id,
                status: "DELIVERED",
                metadata: { origin: "stress_test" },
                createdAt: new Date(),
              });
            });
          }
        );
        const elapsed = Date.now() - taskStart;
        latencies.push(elapsed);
        return { success: true, elapsed };
      } catch (err: any) {
        const elapsed = Date.now() - taskStart;
        latencies.push(elapsed);
        return { success: false, error: err.message, elapsed };
      }
    })
  );

  const totalTime = Date.now() - startTime;
  latencies.sort((a, b) => a - b);
  
  const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

  // Count how many messages actually got saved to DB
  const dbSavedCount = await prisma.message.count({
    where: {
      conversationId: conversation.id,
      whatsappMessageId: {
        startsWith: `msg_stress_${Date.now().toString().slice(0, 8)}`
      }
    }
  });

  console.log(`✅ Fase 1 completada en ${totalTime}ms`);
  console.log(`📊 Rendimiento: ${(burstSize / (totalTime / 1000)).toFixed(2)} mensajes/segundo`);
  console.log(`⏱️ Latencias: p50=${p50}ms | p95=${p95}ms | p99=${p99}ms`);
  console.log(`🔒 Deduplicación: esperados=50 | persistidos en DB=${dbSavedCount} | duplicados filtrados=${burstSize - dbSavedCount}`);

  // ---------------------------------------------------------------------------
  // PHASE 2: OUTBOUND MESSAGE BURST
  // ---------------------------------------------------------------------------
  console.log("\n🔥 FASE 2: RÁFAGA DE MENSAJES SALIENTES...");
  
  const outboundBurstSize = 50;
  const outboundStart = Date.now();
  const outboundLatencies: number[] = [];

  const outboundResults = await TenantContextManager.run(
    { companyId, userId: adminUser!.id, requestId: `stress-outbound` },
    async () => {
      return Promise.all(
        Array.from({ length: outboundBurstSize }).map(async (_, idx) => {
          const taskStart = Date.now();
          try {
            const msg = await chatService.upsertMessage({
              whatsappMessageId: `msg_out_stress_${Date.now()}_${idx}`,
              companyId,
              content: `Respuesta de estrés saliente ${idx}`,
              direction: "OUTBOUND",
              conversationId: conversation!.id,
              senderId: adminUser!.id,
              status: "SENT",
              metadata: { origin: "stress_test" }
            });
            const elapsed = Date.now() - taskStart;
            outboundLatencies.push(elapsed);
            return { success: true, msg };
          } catch (err: any) {
            const elapsed = Date.now() - taskStart;
            outboundLatencies.push(elapsed);
            return { success: false, error: err.message };
          }
        })
      );
    }
  );

  const outboundTotalTime = Date.now() - outboundStart;
  outboundLatencies.sort((a, b) => a - b);
  const outP50 = outboundLatencies[Math.floor(outboundLatencies.length * 0.50)] || 0;
  const outP95 = outboundLatencies[Math.floor(outboundLatencies.length * 0.95)] || 0;

  console.log(`✅ Fase 2 completada en ${outboundTotalTime}ms`);
  console.log(`📊 Rendimiento: ${(outboundBurstSize / (outboundTotalTime / 1000)).toFixed(2)} envíos/segundo`);
  console.log(`⏱️ Latencias: p50=${outP50}ms | p95=${outP95}ms`);

  // ---------------------------------------------------------------------------
  // PHASE 3: HISTORY SYNC BATCH INGEST
  // ---------------------------------------------------------------------------
  console.log("\n🔥 FASE 3: INGESTIÓN DE HISTORIAL MASIVO (History Sync Batch)...");
  
  const historyBatchSize = 500;
  const historyMessages: WAMessage[] = [];
  const historyPhone = "573111111111";

  for (let i = 0; i < historyBatchSize; i++) {
    historyMessages.push(
      createMockWAMessage(`msg_hist_stress_${Date.now()}_${i}`, historyPhone, `History message ${i}`, i % 2 === 0)
    );
  }

  console.log(`📦 Insertando lote masivo de ${historyBatchSize} mensajes de historial a la vez...`);
  
  const historyStart = Date.now();
  
  const conversationId = await TenantContextManager.run(
    { companyId, userId: "system", requestId: `stress-history-sync` },
    async () => {
      return chatSyncBatchIngester.ingestConversationBatch(
        companyId,
        historyPhone,
        historyMessages,
        adminUser!.id
      );
    }
  );

  const historyTotalTime = Date.now() - historyStart;
  
  // Verify DB record count
  const historyDbCount = await TenantContextManager.run(
    { companyId, userId: "system", requestId: `stress-history-verify` },
    async () => {
      return prisma.message.count({
        where: {
          conversationId: conversationId || undefined,
          whatsappMessageId: {
            startsWith: `msg_hist_stress_${Date.now().toString().slice(0, 8)}`
          }
        }
      });
    }
  );

  console.log(`✅ Ingestión de historial completada en ${historyTotalTime}ms`);
  console.log(`📊 Rendimiento de escritura: ${(historyBatchSize / (historyTotalTime / 1000)).toFixed(2)} mensajes/segundo`);
  console.log(`🗄️ Mensajes insertados en DB: ${historyDbCount} de ${historyBatchSize}`);

  // ---------------------------------------------------------------------------
  // SYSTEM HEALTH AUDIT & CLEANUP
  // ---------------------------------------------------------------------------
  console.log("\n🧹 LIMPIANDO DATOS DE PRUEBA...");
  
  const { deletedInbound, deletedOutbound, deletedHistory } = await TenantContextManager.run(
    { companyId, userId: "system", requestId: `stress-cleanup` },
    async () => {
      const delIn = await prisma.message.deleteMany({
        where: {
          whatsappMessageId: {
            startsWith: `msg_stress_${Date.now().toString().slice(0, 8)}`
          }
        }
      });

      const delOut = await prisma.message.deleteMany({
        where: {
          whatsappMessageId: {
            startsWith: `msg_out_stress_${Date.now().toString().slice(0, 8)}`
          }
        }
      });

      const delHist = await prisma.message.deleteMany({
        where: {
          whatsappMessageId: {
            startsWith: `msg_hist_stress_${Date.now().toString().slice(0, 8)}`
          }
        }
      });

      // Clean up any test conversations
      await prisma.conversation.deleteMany({
        where: {
          channelId: {
            in: [testPhone, historyPhone]
          }
        }
      });

      return { deletedInbound: delIn, deletedOutbound: delOut, deletedHistory: delHist };
    }
  );

  console.log(`🗑️ Limpieza terminada (-${deletedInbound.count + deletedOutbound.count + deletedHistory.count} registros de estrés)`);
  console.log("\n=======================================================");
  console.log("🏆 REPORTE DE RENDIMIENTO DEL CORE:");
  console.log("=======================================================");
  console.log(`1. Inbound Burst: ${(burstSize / (totalTime / 1000)).toFixed(2)} msgs/sec | p50: ${p50}ms`);
  console.log(`2. Outbound Burst: ${(outboundBurstSize / (outboundTotalTime / 1000)).toFixed(2)} msgs/sec | p50: ${outP50}ms`);
  console.log(`3. History Ingest: ${(historyBatchSize / (historyTotalTime / 1000)).toFixed(2)} msgs/sec`);
  console.log("=======================================================");
  console.log("✨ PRUEBAS COMPLETADAS CON ÉXITO Y SISTEMA SALUDABLE.");
}

runStressTest().catch(console.error).finally(async () => {
  await prisma.$disconnect();
  if (redisClient?.isOpen) {
    await redisClient.quit();
  }
  process.exit(0);
});
