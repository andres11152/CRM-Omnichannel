import { Channel } from "@prisma/client";
import { IMessagingProvider } from "./interfaces/IMessagingProvider";
import { WhatsAppMessagingProvider } from "./providers/WhatsAppMessagingProvider";
import { InstagramMessagingProvider } from "./providers/InstagramMessagingProvider";
import { EmailMessagingProvider } from "./providers/EmailMessagingProvider";

export class MessagingProviderRegistry {
  private static instance: MessagingProviderRegistry;
  private providers: IMessagingProvider[] = [];

  private constructor() {
    this.registerProvider(new WhatsAppMessagingProvider());
    this.registerProvider(new InstagramMessagingProvider());
    this.registerProvider(new EmailMessagingProvider());
  }

  public static getInstance(): MessagingProviderRegistry {
    if (!MessagingProviderRegistry.instance) {
      MessagingProviderRegistry.instance = new MessagingProviderRegistry();
    }
    return MessagingProviderRegistry.instance;
  }

  public registerProvider(provider: IMessagingProvider): void {
    this.providers.push(provider);
  }

  public getProvider(channel: Channel): IMessagingProvider {
    const provider = this.providers.find((p) => p.supports(channel));
    if (!provider) {
      throw new Error(`No messaging provider registered for channel: ${channel}`);
    }
    return provider;
  }
}

export const messagingProviderRegistry = MessagingProviderRegistry.getInstance();
