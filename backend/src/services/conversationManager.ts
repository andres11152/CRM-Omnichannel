import { Conversation, Prisma } from "@prisma/client";
import { Logger } from "@/utils/logger";
import { ExtendedPrismaClient } from "@/config/database";
import {
  FindOrCreateConversationParams,
  UpdateConversationParams,
  IConversationEvents,
} from "@/types/conversation.types";
import { TenantContextManager } from "@/config/tenantContext";

// 🛡️ 100-YEAR FIX: Exact Transaction Client Type Extraction
// This extracts the exact type expected by the $transaction callback of our specific extended client.
type ExtendedTransactionClient = Parameters<
  Parameters<ExtendedPrismaClient["$transaction"]>[0]
>[0];

// Type that covers both the main extended client and transaction clients
type PrismaClientOrTransaction =
  | ExtendedPrismaClient
  | ExtendedTransactionClient
  | Prisma.TransactionClient;

export class ConversationManager {
  constructor(
    private readonly prisma: PrismaClientOrTransaction,
    private readonly events?: IConversationEvents,
  ) {}

  /**
   * Find existing conversation or create new one atomically
   * @param params - Conversation parameters
   * @returns Existing or newly created conversation
   */
  async findOrCreate(
    params: FindOrCreateConversationParams,
  ): Promise<Conversation> {
    const { companyId, channelId, customerId, subject, status } = params;

    try {
      // 🛡️ STRATEGY: Transaction with retry on unique violation

      const runInTransaction = async (tx: ExtendedTransactionClient) => {
        // 1. Try to find existing conversation
        let conversation = await tx.conversation.findUnique({
          where: {
            conversation_unique_channel: {
              companyId,
              channelId,
            },
          },
          include: {
            participants: true,
            assignedTo: true,
          },
        });

        if (conversation) {
          // Conversation exists - update timestamp and reopen if needed
          Logger.info(
            `[ConversationManager] Found existing conversation: ${conversation.id} (Status: ${conversation.status}, Assigned: ${conversation.assignedToId})`,
          );

          // 🛡️ Smart Status Transition
          const isAssigned = !!conversation.assignedToId;
          let newStatus = conversation.status;

          if (
            conversation.status === "CLOSED" ||
            conversation.status === "RESOLVED"
          ) {
            newStatus = isAssigned ? "IN_PROGRESS" : "OPEN";
          } else {
            newStatus = isAssigned ? "IN_PROGRESS" : "OPEN";
          }

          conversation = await tx.conversation.update({
            where: { id: conversation.id },
            data: {
              status: newStatus,
              updatedAt: new Date(),
            },
            include: {
              participants: true,
              assignedTo: true,
            },
          });

          await this.events?.onUpdated?.(conversation);
          return conversation;
        }

        // 2. Conversation doesn't exist - create new one
        Logger.info(
          `[ConversationManager] Creating new conversation for ${channelId}`,
        );

        try {
          conversation = await tx.conversation.create({
            data: {
              companyId,
              channelId,
              subject: subject || channelId,
              status: status || "OPEN",
              participants: {
                connect: [{ id: customerId }],
              },
            },
            include: {
              participants: true,
              assignedTo: true,
            },
          });

          await this.events?.onCreated?.(conversation);

          Logger.info(
            `[ConversationManager] ✅ Created conversation: ${conversation.id}`,
          );

          return conversation;
        } catch (createError: unknown) {
          // 🛡️ RACE CONDITION HANDLER
          if (
            createError instanceof Prisma.PrismaClientKnownRequestError &&
            createError.code === "P2002"
          ) {
            Logger.warn(
              `[ConversationManager] Race condition detected for ${channelId}, fetching existing`,
            );

            conversation = await tx.conversation.findUniqueOrThrow({
              where: {
                conversation_unique_channel: {
                  companyId,
                  channelId,
                },
              },
              include: {
                participants: true,
                assignedTo: true,
              },
            });

            return conversation;
          }

          throw createError;
        }
      };

      // 🛡️ DANGER: Async context can be lost in transactions!
      // We must capture it explicitly.
      const currentContext = TenantContextManager.getContext();

      // Check if we can start a new transaction
      if ("$transaction" in this.prisma) {
        // Safe: Types explicitly match now via helper type
        const client = this.prisma as ExtendedPrismaClient;
        return await client.$transaction(
          async (tx) => {
            // 🛡️ RESTORE CONTEXT inside transaction callback
            return TenantContextManager.run(currentContext, () =>
              runInTransaction(tx),
            );
          },
          {
            isolationLevel: "Serializable",
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } else {
        // Already in a transaction context, context should exist, but let's be safe
        // However, we cannot re-wrap easily if we are just calling runInTransaction directly.
        // Assuming context flows in same async scope.
        return await runInTransaction(this.prisma as ExtendedTransactionClient);
      }
    } catch (error: unknown) {
      Logger.error(
        `[ConversationManager] ❌ Failed to find/create conversation:`,
        error,
      );
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to manage conversation: ${msg}`);
    }
  }

  /**
   * Update conversation fields
   */
  async update(
    conversationId: string,
    params: UpdateConversationParams,
  ): Promise<Conversation> {
    Logger.info(
      `[ConversationManager] Updating conversation: ${conversationId}`,
    );

    // We cast to ExtendedPrismaClient for top-level updates.
    // This assumes `this.prisma` supports the .conversation property access.
    // Given PrismaClientOrTransaction, both types structurally support standard model queries.
    const conversation = await (
      this.prisma as ExtendedPrismaClient
    ).conversation.update({
      where: { id: conversationId },
      data: {
        ...params,
        updatedAt: new Date(),
      },
      include: {
        participants: true,
        assignedTo: true,
      },
    });

    await this.events?.onUpdated?.(conversation);
    return conversation;
  }

  /**
   * Get conversation by ID
   */
  async findById(conversationId: string): Promise<Conversation | null> {
    return await (this.prisma as ExtendedPrismaClient).conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: true,
        assignedTo: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  }

  /**
   * Close conversation
   */
  async close(conversationId: string): Promise<Conversation> {
    return await this.update(conversationId, { status: "CLOSED" });
  }

  /**
   * Assign conversation to agent
   */
  async assign(conversationId: string, agentId: string): Promise<Conversation> {
    return await this.update(conversationId, { assignedToId: agentId });
  }

  /**
   * Unassign conversation
   */
  async unassign(conversationId: string): Promise<Conversation> {
    return await this.update(conversationId, { assignedToId: null });
  }
}
