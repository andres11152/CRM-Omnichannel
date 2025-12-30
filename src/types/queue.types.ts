// Type definitions for queue data structures

export interface AITaskData {
  messageId: string;
  text: string;
  history: any[];
  companyId: string;
}

export interface MessageJobData {
  to: string;
  text: string;
  type: string;
  companyId: string;
}

export interface WebhookJobData {
  companyId: string;
  event: string;
  payload: any;
  webhookId: string;
  url: string;
  secret?: string;
}
