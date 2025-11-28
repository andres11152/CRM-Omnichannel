import { Webhook } from './src/types/index';

export const QUEUE_NAMES = {
  MESSAGES: 'messages-queue',
  WEBHOOKS: 'webhooks-queue',
  AI_PROCESSING: 'ai-queue'
};

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
};

export const MOCK_WEBHOOKS: Webhook[] = [
  {
    id: 'wh_123',
    companyId: 'comp_1',
    url: 'https://webhook.site/tu-url-de-prueba',
    events: ['message.received'],
    isActive: true,
    secretKey: 'secret_123'
  }
];

// --- PLANES MOCK (A ser eliminados) ---
export const MOCK_PLANS = [
  { id: 'free', name: 'Free', price: 0, config: { max_users: 1, max_queues: 1, max_whatsapp_connections: 0 } },
  { id: 'basic', name: 'Basic', price: 49, config: { max_users: 5, max_queues: 5, max_whatsapp_connections: 1 } },
  { id: 'pro', name: 'Pro', price: 99, config: { max_users: 20, max_queues: 20, max_whatsapp_connections: 5 } },
];