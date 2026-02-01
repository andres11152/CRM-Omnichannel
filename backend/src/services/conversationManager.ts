/**
 * 🏗️ CONVERSATION MANAGER
 *
 * Handles atomic conversation creation/updates with:
 * - Zero duplicates (even under high concurrency)
 * - Automatic tenant isolation via Prisma extension
 * - Real-time event emissions
 * - Transaction-based consistency
 *
 * Follows SOLID principles:
 * - Single Responsibility: Only manages conversations
 * - Dependency Inversion: Depends on interfaces (PrismaClient, EventEmitter)
 * - Open/Closed: Extensible for new conversation types
 */

import {
  PrismaClient,
  Conversation,
  ConversationStatus,
  Prisma,
} from "@prisma/client";
import { Logger } from "@/utils/logger";

// Type that covers both the main client and transaction clients
type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient;

export interface FindOrCreateConversationParams {
  companyId: string;
  channelId: string; // Phone number, email, etc.
  customerId: string;
  subject?: string;
  status?: ConversationStatus;
}

export interface UpdateConversationParams {
  status?: ConversationStatus;
  assignedToId?: string | null;
  subject?: string;
}

export interface IConversationEvents {
  onCreated: (conversation: Conversation) => void | Promise<void>;
  onUpdated: (conversation: Conversation) => void | Promise<void>;
}

export class ConversationManager {
  constructor(
    private readonly prisma: PrismaClientOrTransaction, // Accept both PrismaClient and extended client
    private readonly events?: IConversationEvents,
  ) {}

  /**
   * Find existing conversation or create new one atomically
   *
   * 🛡️ GUARANTEE: Never creates duplicates
   * - Uses unique constraint on (companyId, channelId)
   * - Transaction ensures atomicity
   * - Handles race conditions gracefully
   *
   * @param params - Conversation parameters
   * @returns Existing or newly created conversation
   */
  async findOrCreate(
    params: FindOrCreateConversationParams,
  ): Promise<Conversation> {
    const { companyId, channelId, customerId, subject, status } = params;

    try {
      // 🛡️ STRATEGY: Transaction with retry on unique violation

      const runInTransaction = async (tx: Prisma.TransactionClient) => {
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

          // 🛡️ 100-YEAR FIX: Smart Status Transition
          const isAssigned = !!conversation.assignedToId;
          let newStatus = conversation.status;

          if (
            conversation.status === "CLOSED" ||
            conversation.status === "RESOLVED"
          ) {
            // Re-opening a closed ticket
            newStatus = isAssigned ? "IN_PROGRESS" : "OPEN";
          } else {
            // It's already active (OPEN or IN_PROGRESS)
            // Force IN_PROGRESS if assigned (to be safe for My Chats view)
            // Force OPEN if unassigned (Queue)
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

          // Emit update event
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

          // Emit creation event
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
            // Unique constraint violation
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

          // Re-throw other errors
          throw createError;
        }
      };

      // Check if we can start a new transaction (is this.prisma the main client?)
      // 'PrismaClient' usually has $transaction. 'TransactionClient' does not have $transaction method.
      if ("$transaction" in this.prisma) {
        return await (this.prisma as PrismaClient).$transaction(
          runInTransaction,
          {
            // 🛡️ ISOLATION LEVEL: Prevent phantom reads
            isolationLevel: "Serializable",
            maxWait: 5000, // 5 seconds max wait for lock
            timeout: 10000, // 10 seconds total timeout
          },
        );
      } else {
        // Already in a transaction context, just run it
        return await runInTransaction(this.prisma as Prisma.TransactionClient);
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
   *
   * @param conversationId - ID of conversation to update
   * @param params - Fields to update
   * @returns Updated conversation
   */
  async update(
    conversationId: string,
    params: UpdateConversationParams,
  ): Promise<Conversation> {
    Logger.info(
      `[ConversationManager] Updating conversation: ${conversationId}`,
    );

    const conversation = await this.prisma.conversation.update({
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

    // Emit update event
    await this.events?.onUpdated?.(conversation);

    Logger.info(
      `[ConversationManager] ✅ Updated conversation: ${conversationId}`,
    );

    return conversation;
  }

  /**
   * Get conversation by ID
   */
  async findById(conversationId: string): Promise<Conversation | null> {
    return await this.prisma.conversation.findUnique({
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
