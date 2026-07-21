export interface WhatsAppSession {
  sessionId: string;
  status: string;
  phone: string | null;
  qrCode: string | null;
  profileName?: string | null;
  defaultQueueId?: string | null;
  createdAt: string;
}

export interface Queue {
  id: string;
  name: string;
}
