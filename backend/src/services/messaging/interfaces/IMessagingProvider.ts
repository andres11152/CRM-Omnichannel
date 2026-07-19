import { Channel, Conversation, Contact } from "@prisma/client";
import { ReplyDTO } from "@/types/conversation.types";

export type ConversationWithContact = Conversation & {
  contact?: Contact | null;
};

export interface SendMessageResult {
  id: string;
  content: string;
  timestamp?: Date;
  status?: string;
  sender?: string;
  metadata?: unknown;
  type?: string;
  mediaUrl?: string;
}

export interface IMessagingProvider {
  supports(channel: Channel): boolean;
  send(
    dto: ReplyDTO,
    conversation: ConversationWithContact,
  ): Promise<SendMessageResult>;
}
