import { TableSchema } from "../../../types";

export const DB_SCHEMA: TableSchema[] = [
  {
    "tableName": "Conversation",
    "description": "Tabla Conversation",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "subject",
        "type": "String?",
        "description": ""
      },
      {
        "name": "status",
        "type": "ConversationStatus",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "resolvedAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "channelId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "isGroup",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "groupMetadata",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "participants",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "assignedToId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "assignedTo",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "messages",
        "type": "Message[]",
        "description": ""
      },
      {
        "name": "tags",
        "type": "String[]",
        "description": ""
      },
      {
        "name": "tickets",
        "type": "Ticket[]",
        "description": ""
      },
      {
        "name": "queueId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "queue",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "contactId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "contact",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "flowSessions",
        "type": "ContactFlowSession[]",
        "description": ""
      },
      {
        "name": "aiEnabled",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "lastManualIntervention",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "unreadCount",
        "type": "Int",
        "description": ""
      },
      {
        "name": "syncEnabled",
        "type": "Boolean",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Message",
    "description": "Tabla Message",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "content",
        "type": "String",
        "description": ""
      },
      {
        "name": "channel",
        "type": "Channel",
        "description": ""
      },
      {
        "name": "direction",
        "type": "MessageDirection",
        "description": ""
      },
      {
        "name": "status",
        "type": "String",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "conversationId",
        "type": "String",
        "description": ""
      },
      {
        "name": "conversation",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "senderId",
        "type": "String",
        "description": ""
      },
      {
        "name": "sender",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "metadata",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "reactions",
        "type": "MessageReaction[]",
        "description": ""
      },
      {
        "name": "whatsappMessageId",
        "type": "String?",
        "description": ""
      }
    ]
  },
  {
    "tableName": "MessageReaction",
    "description": "Tabla MessageReaction",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "messageId",
        "type": "String",
        "description": ""
      },
      {
        "name": "message",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "reactBy",
        "type": "String",
        "description": ""
      },
      {
        "name": "content",
        "type": "String",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Contact",
    "description": "Tabla Contact",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "email",
        "type": "String?",
        "description": ""
      },
      {
        "name": "phone",
        "type": "String?",
        "description": ""
      },
      {
        "name": "avatarUrl",
        "type": "String?",
        "description": ""
      },
      {
        "name": "tags",
        "type": "String[]",
        "description": ""
      },
      {
        "name": "notes",
        "type": "String?",
        "description": ""
      },
      {
        "name": "customFields",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "profilePicUrl",
        "type": "String?",
        "description": ""
      },
      {
        "name": "about",
        "type": "String?",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "deletedAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "deletedBy",
        "type": "String?",
        "description": ""
      },
      {
        "name": "isBlocked",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "blockedAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "blockedReason",
        "type": "String?",
        "description": ""
      },
      {
        "name": "accountId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "account",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "deals",
        "type": "Deal[]",
        "description": ""
      },
      {
        "name": "activities",
        "type": "Activity[]",
        "description": ""
      },
      {
        "name": "emails",
        "type": "Email[]",
        "description": ""
      },
      {
        "name": "flowSessions",
        "type": "ContactFlowSession[]",
        "description": ""
      },
      {
        "name": "conversations",
        "type": "Conversation[]",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Company",
    "description": "Tabla Company",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "slug",
        "type": "String?",
        "description": ""
      },
      {
        "name": "logoUrl",
        "type": "String?",
        "description": ""
      },
      {
        "name": "status",
        "type": "CompanyStatus",
        "description": ""
      },
      {
        "name": "isActive",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "subscriptionEndsAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "address",
        "type": "String?",
        "description": ""
      },
      {
        "name": "phone",
        "type": "String?",
        "description": ""
      },
      {
        "name": "website",
        "type": "String?",
        "description": ""
      },
      {
        "name": "timezone",
        "type": "String",
        "description": ""
      },
      {
        "name": "settings",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "emailProvider",
        "type": "String",
        "description": ""
      },
      {
        "name": "smtpHost",
        "type": "String?",
        "description": ""
      },
      {
        "name": "smtpPort",
        "type": "Int?",
        "description": ""
      },
      {
        "name": "smtpUser",
        "type": "String?",
        "description": ""
      },
      {
        "name": "smtpPassword",
        "type": "String?",
        "description": ""
      },
      {
        "name": "smtpSecure",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "defaultSenderEmail",
        "type": "String?",
        "description": ""
      },
      {
        "name": "defaultSenderName",
        "type": "String?",
        "description": ""
      },
      {
        "name": "users",
        "type": "User[]",
        "description": ""
      },
      {
        "name": "agentSessions",
        "type": "AgentSession[]",
        "description": ""
      },
      {
        "name": "tickets",
        "type": "Ticket[]",
        "description": ""
      },
      {
        "name": "apiKeys",
        "type": "ApiKey[]",
        "description": ""
      },
      {
        "name": "conversations",
        "type": "Conversation[]",
        "description": ""
      },
      {
        "name": "whatsappSessions",
        "type": "WhatsAppSession[]",
        "description": ""
      },
      {
        "name": "departments",
        "type": "Department[]",
        "description": ""
      },
      {
        "name": "queues",
        "type": "Queue[]",
        "description": ""
      },
      {
        "name": "campaigns",
        "type": "Campaign[]",
        "description": ""
      },
      {
        "name": "tags",
        "type": "Tag[]",
        "description": ""
      },
      {
        "name": "workflows",
        "type": "Workflow[]",
        "description": ""
      },
      {
        "name": "media",
        "type": "Media[]",
        "description": ""
      },
      {
        "name": "accounts",
        "type": "Account[]",
        "description": ""
      },
      {
        "name": "deals",
        "type": "Deal[]",
        "description": ""
      },
      {
        "name": "activities",
        "type": "Activity[]",
        "description": ""
      },
      {
        "name": "contacts",
        "type": "Contact[]",
        "description": ""
      },
      {
        "name": "messageTemplates",
        "type": "MessageTemplate[]",
        "description": ""
      },
      {
        "name": "aiConfig",
        "type": "AIConfig?",
        "description": ""
      },
      {
        "name": "aiAssistants",
        "type": "AIAssistant[]",
        "description": ""
      },
      {
        "name": "quickReplies",
        "type": "QuickReply[]",
        "description": ""
      },
      {
        "name": "pipelines",
        "type": "Pipeline[]",
        "description": ""
      },
      {
        "name": "products",
        "type": "Product[]",
        "description": ""
      },
      {
        "name": "flowSessions",
        "type": "ContactFlowSession[]",
        "description": ""
      },
      {
        "name": "mediaAssets",
        "type": "MediaAsset[]",
        "description": ""
      },
      {
        "name": "emails",
        "type": "Email[]",
        "description": ""
      },
      {
        "name": "trialEndsAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "planExpiresAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "planId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "plan",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "stripeCustomerId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "stripeSubscriptionId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "pushSubscriptions",
        "type": "PushSubscription[]",
        "description": ""
      },
      {
        "name": "roles",
        "type": "Role[]",
        "description": ""
      },
      {
        "name": "Message",
        "type": "Message[]",
        "description": ""
      },
      {
        "name": "notifications",
        "type": "Notification[]",
        "description": ""
      },
      {
        "name": "transactions",
        "type": "BillingTransaction[]",
        "description": ""
      }
    ]
  },
  {
    "tableName": "User",
    "description": "Tabla User",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "email",
        "type": "String",
        "description": ""
      },
      {
        "name": "name",
        "type": "String?",
        "description": ""
      },
      {
        "name": "phone",
        "type": "String?",
        "description": ""
      },
      {
        "name": "password",
        "type": "String",
        "description": ""
      },
      {
        "name": "role",
        "type": "UserRole",
        "description": ""
      },
      {
        "name": "maxConcurrency",
        "type": "Int",
        "description": ""
      },
      {
        "name": "skills",
        "type": "String[]",
        "description": ""
      },
      {
        "name": "isOwner",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "preferences",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "profilePicUrl",
        "type": "String?",
        "description": ""
      },
      {
        "name": "about",
        "type": "String?",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "lastSeen",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "isOnline",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "agentSessions",
        "type": "AgentSession[]",
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "posts",
        "type": "Post[]",
        "description": ""
      },
      {
        "name": "replies",
        "type": "Reply[]",
        "description": ""
      },
      {
        "name": "createdTickets",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "assignedTickets",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "sentMessages",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "assignedConversations",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "conversations",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "queues",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "uploadedMedia",
        "type": "Media[]",
        "description": ""
      },
      {
        "name": "assignedDeals",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "assignedActivities",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "createdActivities",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "participatingActivities",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "mentionedInActivities",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "createdCampaigns",
        "type": "Campaign[]",
        "description": ""
      },
      {
        "name": "uploadedMediaAssets",
        "type": "MediaAsset[]",
        "description": ""
      },
      {
        "name": "googleCalendarToken",
        "type": "String?",
        "description": ""
      },
      {
        "name": "googleCalendarRefreshToken",
        "type": "String?",
        "description": ""
      },
      {
        "name": "resetPasswordToken",
        "type": "String?",
        "description": ""
      },
      {
        "name": "resetPasswordExpires",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "pushSubscriptions",
        "type": "PushSubscription[]",
        "description": ""
      },
      {
        "name": "notifications",
        "type": "Notification[]",
        "description": ""
      },
      {
        "name": "customRoleId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "customRole",
        "type": "FK",
        "isFK": true,
        "description": ""
      }
    ]
  },
  {
    "tableName": "Workflow",
    "description": "Tabla Workflow",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "description",
        "type": "String?",
        "description": ""
      },
      {
        "name": "isActive",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "triggerType",
        "type": "String",
        "description": ""
      },
      {
        "name": "triggerConfig",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "nodes",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "edges",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "executions",
        "type": "WorkflowExecution[]",
        "description": ""
      },
      {
        "name": "flowSessions",
        "type": "ContactFlowSession[]",
        "description": ""
      }
    ]
  },
  {
    "tableName": "WorkflowExecution",
    "description": "Tabla WorkflowExecution",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "workflowId",
        "type": "String",
        "description": ""
      },
      {
        "name": "workflow",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "status",
        "type": "String",
        "description": ""
      },
      {
        "name": "startedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "completedAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "logs",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "error",
        "type": "String?",
        "description": ""
      }
    ]
  },
  {
    "tableName": "WhatsAppSession",
    "description": "Tabla WhatsAppSession",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "sessionId",
        "type": "String",
        "description": ""
      },
      {
        "name": "phone",
        "type": "String?",
        "description": ""
      },
      {
        "name": "status",
        "type": "String",
        "description": ""
      },
      {
        "name": "qrCode",
        "type": "String?",
        "description": ""
      },
      {
        "name": "notifiedAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "defaultQueueId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "defaultQueue",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "WhatsAppCredential",
    "description": "Tabla WhatsAppCredential",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "sessionId",
        "type": "String",
        "description": ""
      },
      {
        "name": "key",
        "type": "String",
        "description": ""
      },
      {
        "name": "value",
        "type": "String",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "AgentSession",
    "description": "Tabla AgentSession",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "userId",
        "type": "String",
        "description": ""
      },
      {
        "name": "user",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "connectedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "disconnectedAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "duration",
        "type": "Int?",
        "description": ""
      },
      {
        "name": "socketId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Plan",
    "description": "Tabla Plan",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "price",
        "type": "Float",
        "description": ""
      },
      {
        "name": "config",
        "type": "Json",
        "description": ""
      },
      {
        "name": "storageLimitGb",
        "type": "Float?",
        "description": ""
      },
      {
        "name": "maxContacts",
        "type": "Int?",
        "description": ""
      },
      {
        "name": "maxCompanies",
        "type": "Int?",
        "description": ""
      },
      {
        "name": "maxWorkflows",
        "type": "Int?",
        "description": ""
      },
      {
        "name": "companies",
        "type": "Company[]",
        "description": ""
      }
    ]
  },
  {
    "tableName": "ApiKey",
    "description": "Tabla ApiKey",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "keyHash",
        "type": "String",
        "description": ""
      },
      {
        "name": "keyPrefix",
        "type": "String",
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "lastUsedAt",
        "type": "DateTime?",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Webhook",
    "description": "Tabla Webhook",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "url",
        "type": "String",
        "description": ""
      },
      {
        "name": "secretKey",
        "type": "String?",
        "description": ""
      },
      {
        "name": "events",
        "type": "String[]",
        "description": ""
      },
      {
        "name": "isActive",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Post",
    "description": "Tabla Post",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "content",
        "type": "String",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "authorId",
        "type": "String",
        "description": ""
      },
      {
        "name": "author",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "replies",
        "type": "Reply[]",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Reply",
    "description": "Tabla Reply",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "content",
        "type": "String",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "authorId",
        "type": "String",
        "description": ""
      },
      {
        "name": "author",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "postId",
        "type": "String",
        "description": ""
      },
      {
        "name": "post",
        "type": "FK",
        "isFK": true,
        "description": ""
      }
    ]
  },
  {
    "tableName": "Ticket",
    "description": "Tabla Ticket",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "ticketNumber",
        "type": "Int",
        "description": ""
      },
      {
        "name": "subject",
        "type": "String",
        "description": ""
      },
      {
        "name": "description",
        "type": "String",
        "description": ""
      },
      {
        "name": "status",
        "type": "TicketStatus",
        "description": ""
      },
      {
        "name": "priority",
        "type": "TicketPriority",
        "description": ""
      },
      {
        "name": "resolutionType",
        "type": "TicketResolutionType?",
        "description": ""
      },
      {
        "name": "resolutionNotes",
        "type": "String?",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "resolvedAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "deletedAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "deletedBy",
        "type": "String?",
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "createdById",
        "type": "String",
        "description": ""
      },
      {
        "name": "createdBy",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "assignedToId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "assignedTo",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "queueId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "queue",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "conversationId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "conversation",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "emails",
        "type": "Email[]",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Department",
    "description": "Tabla Department",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "queues",
        "type": "Queue[]",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Queue",
    "description": "Tabla Queue",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "description",
        "type": "String?",
        "description": ""
      },
      {
        "name": "isActive",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "type",
        "type": "QueueType",
        "description": ""
      },
      {
        "name": "config",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "departmentId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "department",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "tickets",
        "type": "Ticket[]",
        "description": ""
      },
      {
        "name": "agents",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "aiAssistantId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "aiAssistant",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "conversations",
        "type": "Conversation[]",
        "description": ""
      },
      {
        "name": "defaultForSessions",
        "type": "WhatsAppSession[]",
        "description": ""
      }
    ]
  },
  {
    "tableName": "AIConfig",
    "description": "Tabla AIConfig",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "openaiKey",
        "type": "String?",
        "description": ""
      },
      {
        "name": "geminiKey",
        "type": "String?",
        "description": ""
      },
      {
        "name": "isActive",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "AIAssistant",
    "description": "Tabla AIAssistant",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "description",
        "type": "String?",
        "description": ""
      },
      {
        "name": "modelProvider",
        "type": "String",
        "description": ""
      },
      {
        "name": "modelName",
        "type": "String",
        "description": ""
      },
      {
        "name": "systemPrompt",
        "type": "String",
        "description": ""
      },
      {
        "name": "temperature",
        "type": "Float",
        "description": ""
      },
      {
        "name": "queues",
        "type": "Queue[]",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Campaign",
    "description": "Tabla Campaign",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "channel",
        "type": "Channel",
        "description": ""
      },
      {
        "name": "subject",
        "type": "String?",
        "description": ""
      },
      {
        "name": "templateId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "template",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "messageContent",
        "type": "String",
        "description": ""
      },
      {
        "name": "targetTags",
        "type": "String[]",
        "description": ""
      },
      {
        "name": "status",
        "type": "String",
        "description": ""
      },
      {
        "name": "config",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "stats",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "createdById",
        "type": "String?",
        "description": ""
      },
      {
        "name": "createdBy",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "deletedAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "deletedBy",
        "type": "String?",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Tag",
    "description": "Tabla Tag",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "color",
        "type": "String",
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "MessageTemplate",
    "description": "Tabla MessageTemplate",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "channel",
        "type": "Channel",
        "description": ""
      },
      {
        "name": "subject",
        "type": "String?",
        "description": ""
      },
      {
        "name": "language",
        "type": "String",
        "description": ""
      },
      {
        "name": "category",
        "type": "String",
        "description": ""
      },
      {
        "name": "status",
        "type": "String",
        "description": ""
      },
      {
        "name": "components",
        "type": "Json",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "campaigns",
        "type": "Campaign[]",
        "description": ""
      }
    ]
  },
  {
    "tableName": "QuickReply",
    "description": "Tabla QuickReply",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "title",
        "type": "String",
        "description": ""
      },
      {
        "name": "content",
        "type": "String",
        "description": ""
      },
      {
        "name": "category",
        "type": "String?",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Pipeline",
    "description": "Tabla Pipeline",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "isDefault",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "stages",
        "type": "Stage[]",
        "description": ""
      },
      {
        "name": "deals",
        "type": "Deal[]",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Stage",
    "description": "Tabla Stage",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "pipelineId",
        "type": "String",
        "description": ""
      },
      {
        "name": "pipeline",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "order",
        "type": "Float",
        "description": ""
      },
      {
        "name": "color",
        "type": "String?",
        "description": ""
      },
      {
        "name": "deals",
        "type": "Deal[]",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Account",
    "description": "Tabla Account",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "industry",
        "type": "String?",
        "description": ""
      },
      {
        "name": "website",
        "type": "String?",
        "description": ""
      },
      {
        "name": "email",
        "type": "String?",
        "description": ""
      },
      {
        "name": "size",
        "type": "String?",
        "description": ""
      },
      {
        "name": "address",
        "type": "String?",
        "description": ""
      },
      {
        "name": "status",
        "type": "String",
        "description": ""
      },
      {
        "name": "contacts",
        "type": "Contact[]",
        "description": ""
      },
      {
        "name": "deals",
        "type": "Deal[]",
        "description": ""
      },
      {
        "name": "activities",
        "type": "Activity[]",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Deal",
    "description": "Tabla Deal",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "title",
        "type": "String",
        "description": ""
      },
      {
        "name": "value",
        "type": "Float",
        "description": ""
      },
      {
        "name": "currency",
        "type": "String",
        "description": ""
      },
      {
        "name": "pipelineId",
        "type": "String",
        "description": ""
      },
      {
        "name": "pipeline",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "stageId",
        "type": "String",
        "description": ""
      },
      {
        "name": "stage",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "order",
        "type": "Float",
        "description": ""
      },
      {
        "name": "probability",
        "type": "Int",
        "description": ""
      },
      {
        "name": "expectedCloseDate",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "lostReason",
        "type": "String?",
        "description": ""
      },
      {
        "name": "closedAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "accountId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "account",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "contactId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "contact",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "assignedToId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "assignedTo",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "activities",
        "type": "Activity[]",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "deletedAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "deletedBy",
        "type": "String?",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Activity",
    "description": "Tabla Activity",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "type",
        "type": "ActivityType",
        "description": ""
      },
      {
        "name": "subject",
        "type": "String",
        "description": ""
      },
      {
        "name": "description",
        "type": "String?",
        "description": ""
      },
      {
        "name": "status",
        "type": "String",
        "description": ""
      },
      {
        "name": "dueDate",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "googleEventId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "accountId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "account",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "dealId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "deal",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "contactId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "contact",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "assignedToId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "assignedTo",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "createdById",
        "type": "String",
        "description": ""
      },
      {
        "name": "createdBy",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "participants",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "mentions",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Product",
    "description": "Tabla Product",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "sku",
        "type": "String?",
        "description": ""
      },
      {
        "name": "price",
        "type": "Float",
        "description": ""
      },
      {
        "name": "currency",
        "type": "String",
        "description": ""
      },
      {
        "name": "stock",
        "type": "Int",
        "description": ""
      },
      {
        "name": "category",
        "type": "String",
        "description": ""
      },
      {
        "name": "type",
        "type": "ProductType",
        "description": ""
      },
      {
        "name": "description",
        "type": "String?",
        "description": ""
      },
      {
        "name": "imageUrl",
        "type": "String?",
        "description": ""
      },
      {
        "name": "status",
        "type": "ProductStatus",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Media",
    "description": "Tabla Media",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "filename",
        "type": "String",
        "description": ""
      },
      {
        "name": "originalName",
        "type": "String",
        "description": ""
      },
      {
        "name": "mimeType",
        "type": "String",
        "description": ""
      },
      {
        "name": "size",
        "type": "Int",
        "description": ""
      },
      {
        "name": "url",
        "type": "String",
        "description": ""
      },
      {
        "name": "key",
        "type": "String",
        "description": ""
      },
      {
        "name": "type",
        "type": "MediaType",
        "description": ""
      },
      {
        "name": "category",
        "type": "String?",
        "description": ""
      },
      {
        "name": "tags",
        "type": "String[]",
        "description": ""
      },
      {
        "name": "description",
        "type": "String?",
        "description": ""
      },
      {
        "name": "uploadedById",
        "type": "String",
        "description": ""
      },
      {
        "name": "uploadedBy",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "ContactFlowSession",
    "description": "Tabla ContactFlowSession",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "contactId",
        "type": "String",
        "description": ""
      },
      {
        "name": "contact",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "flowId",
        "type": "String",
        "description": ""
      },
      {
        "name": "flow",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "conversationId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "conversation",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "currentNodeId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "isActive",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "isPaused",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "variables",
        "type": "Json",
        "description": ""
      },
      {
        "name": "visitedNodes",
        "type": "String[]",
        "description": ""
      },
      {
        "name": "startedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "completedAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "pausedAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "lastStepAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "MediaAsset",
    "description": "Tabla MediaAsset",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "filename",
        "type": "String",
        "description": ""
      },
      {
        "name": "originalName",
        "type": "String",
        "description": ""
      },
      {
        "name": "mimeType",
        "type": "String",
        "description": ""
      },
      {
        "name": "fileSize",
        "type": "Int",
        "description": ""
      },
      {
        "name": "type",
        "type": "MediaAssetType",
        "description": ""
      },
      {
        "name": "fileUrl",
        "type": "String",
        "description": ""
      },
      {
        "name": "thumbnailUrl",
        "type": "String?",
        "description": ""
      },
      {
        "name": "cloudinaryPublicId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "category",
        "type": "String?",
        "description": ""
      },
      {
        "name": "description",
        "type": "String?",
        "description": ""
      },
      {
        "name": "tags",
        "type": "String[]",
        "description": ""
      },
      {
        "name": "width",
        "type": "Int?",
        "description": ""
      },
      {
        "name": "height",
        "type": "Int?",
        "description": ""
      },
      {
        "name": "duration",
        "type": "Int?",
        "description": ""
      },
      {
        "name": "uploadedById",
        "type": "String",
        "description": ""
      },
      {
        "name": "uploadedBy",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Email",
    "description": "Tabla Email",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "messageId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "subject",
        "type": "String",
        "description": ""
      },
      {
        "name": "bodyHtml",
        "type": "String",
        "description": ""
      },
      {
        "name": "bodyText",
        "type": "String?",
        "description": ""
      },
      {
        "name": "from",
        "type": "String",
        "description": ""
      },
      {
        "name": "to",
        "type": "String[]",
        "description": ""
      },
      {
        "name": "cc",
        "type": "String[]",
        "description": ""
      },
      {
        "name": "bcc",
        "type": "String[]",
        "description": ""
      },
      {
        "name": "replyTo",
        "type": "String?",
        "description": ""
      },
      {
        "name": "status",
        "type": "EmailStatus",
        "description": ""
      },
      {
        "name": "type",
        "type": "EmailType",
        "description": ""
      },
      {
        "name": "contactId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "contact",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "ticketId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "ticket",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "attachments",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "openedAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "clickedAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "errorMessage",
        "type": "String?",
        "description": ""
      },
      {
        "name": "retryCount",
        "type": "Int",
        "description": ""
      },
      {
        "name": "sentAt",
        "type": "DateTime?",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "PushSubscription",
    "description": "Tabla PushSubscription",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "userId",
        "type": "String",
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "endpoint",
        "type": "String",
        "description": ""
      },
      {
        "name": "p256dh",
        "type": "String",
        "description": ""
      },
      {
        "name": "auth",
        "type": "String",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "user",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      }
    ]
  },
  {
    "tableName": "Role",
    "description": "Tabla Role",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "name",
        "type": "String",
        "description": ""
      },
      {
        "name": "description",
        "type": "String?",
        "description": ""
      },
      {
        "name": "isSystem",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "isActive",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "baseRole",
        "type": "UserRole",
        "description": ""
      },
      {
        "name": "permissions",
        "type": "RolePermission[]",
        "description": ""
      },
      {
        "name": "users",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Permission",
    "description": "Tabla Permission",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "module",
        "type": "PermissionModule",
        "description": ""
      },
      {
        "name": "action",
        "type": "PermissionAction",
        "description": ""
      },
      {
        "name": "resource",
        "type": "String",
        "description": ""
      },
      {
        "name": "description",
        "type": "String?",
        "description": ""
      },
      {
        "name": "rolePermissions",
        "type": "RolePermission[]",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "RolePermission",
    "description": "Tabla RolePermission",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "roleId",
        "type": "String",
        "description": ""
      },
      {
        "name": "role",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "permissionId",
        "type": "String",
        "description": ""
      },
      {
        "name": "permission",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "conditions",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "AuditLog",
    "description": "Tabla AuditLog",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "userId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "action",
        "type": "String",
        "description": ""
      },
      {
        "name": "entity",
        "type": "String",
        "description": ""
      },
      {
        "name": "entityId",
        "type": "String",
        "description": ""
      },
      {
        "name": "details",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "ipAddress",
        "type": "String?",
        "description": ""
      },
      {
        "name": "userAgent",
        "type": "String?",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "Notification",
    "description": "Tabla Notification",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "userId",
        "type": "String",
        "description": ""
      },
      {
        "name": "user",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "type",
        "type": "String",
        "description": ""
      },
      {
        "name": "title",
        "type": "String",
        "description": ""
      },
      {
        "name": "message",
        "type": "String",
        "description": ""
      },
      {
        "name": "read",
        "type": "Boolean",
        "description": ""
      },
      {
        "name": "link",
        "type": "String?",
        "description": ""
      },
      {
        "name": "metadata",
        "type": "Json?",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  },
  {
    "tableName": "BillingTransaction",
    "description": "Tabla BillingTransaction",
    "columns": [
      {
        "name": "id",
        "type": "String",
        "isPK": true,
        "description": ""
      },
      {
        "name": "companyId",
        "type": "String",
        "description": ""
      },
      {
        "name": "company",
        "type": "FK",
        "isFK": true,
        "description": ""
      },
      {
        "name": "description",
        "type": "String",
        "description": ""
      },
      {
        "name": "amount",
        "type": "Int",
        "description": ""
      },
      {
        "name": "currency",
        "type": "String",
        "description": ""
      },
      {
        "name": "status",
        "type": "String",
        "description": ""
      },
      {
        "name": "invoiceId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "stripePaymentId",
        "type": "String?",
        "description": ""
      },
      {
        "name": "billingDate",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "createdAt",
        "type": "DateTime",
        "description": ""
      },
      {
        "name": "updatedAt",
        "type": "DateTime",
        "description": ""
      }
    ]
  }
];
