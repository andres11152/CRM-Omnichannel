import { Account, Deal, Activity } from "@/types/crm";
import { api } from "@/lib/axios";

/** Pipeline type for CRM */
interface Pipeline {
  id: string;
  name: string;
  stages: { id: string; name: string; order: number }[];
}

/** CRM Contact (lightweight) */
export interface CrmContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  companyId?: string;
}

// --- ACCOUNTS ---

export const getAccounts = async (): Promise<{ accounts: Account[] }> => {
  const res = await api.get("/accounts");
  return res.data.data;
};

// --- PIPELINES ---

export const getPipelines = async (): Promise<{ pipelines: Pipeline[] }> => {
  const res = await api.get("/pipelines");
  return res.data.data;
};

export const getAccount = async (id: string): Promise<{ account: Account }> => {
  const res = await api.get(`/accounts/${id}`);
  return res.data.data;
};

export const createAccount = async (
  accountData: Partial<Account>,
): Promise<{ account: Account }> => {
  const res = await api.post("/accounts", accountData);
  return res.data.data;
};

export const updateAccount = async (
  id: string,
  accountData: Partial<Account>,
): Promise<{ account: Account }> => {
  const res = await api.patch(`/accounts/${id}`, accountData);
  return res.data.data;
};

export const deleteAccount = async (id: string): Promise<void> => {
  await api.delete(`/accounts/${id}`);
};

// --- DEALS ---

export const getDeals = async (filters?: {
  pipelineId?: string;
  stageId?: string;
  accountId?: string;
  contactId?: string;
}): Promise<{ deals: Deal[] }> => {
  const query = new URLSearchParams(
    filters as Record<string, string>,
  ).toString();
  const res = await api.get(`/deals?${query}`);
  return res.data.data;
};

export const createDeal = async (
  dealData: Partial<Deal>,
): Promise<{ deal: Deal }> => {
  const res = await api.post("/deals", dealData);
  return res.data.data;
};

export const updateDeal = async (
  id: string,
  dealData: Partial<Deal>,
): Promise<{ deal: Deal }> => {
  const res = await api.patch(`/deals/${id}`, dealData);
  return res.data.data;
};

export const deleteDeal = async (id: string): Promise<void> => {
  await api.delete(`/deals/${id}`);
};

// --- CONTACTS ---

export const getContacts = async (): Promise<{ contacts: CrmContact[] }> => {
  const res = await api.get("/contacts");

  // Axios response.data IS the body.
  // Backend might return array directly or { data: [...] }
  const body = res.data;

  if (Array.isArray(body)) {
    return { contacts: body };
  }
  if (body.data && Array.isArray(body.data)) {
    return { contacts: body.data };
  }
  return { contacts: [] };
};

// --- CONVERSATIONS ---

/**
 * Inicia (o resuelve, si ya existe) una conversación de WhatsApp con un número y,
 * opcionalmente, envía un mensaje inicial a través de la sesión de WhatsApp conectada
 * de la empresa. Si el número ya tiene un chat abierto, el mensaje se agrega ahí
 * en vez de crear un duplicado.
 */
export const startConversationWithMessage = async (params: {
  phone: string;
  name?: string;
  message?: string;
  addToContacts?: boolean;
}): Promise<{ conversationId: string }> => {
  const res = await api.post("/conversations", params);
  return { conversationId: res.data.data.conversation.id };
};

// --- ACTIVITIES ---

export const getActivities = async (filters?: {
  dealId?: string;
  accountId?: string;
  contactId?: string;
}): Promise<{ activities: Activity[] }> => {
  const query = new URLSearchParams(
    filters as Record<string, string>,
  ).toString();
  const res = await api.get(`/activities?${query}`);
  return res.data.data;
};

export const createActivity = async (
  activityData: Partial<Activity>,
): Promise<{ activity: Activity }> => {
  const res = await api.post("/activities", activityData);
  return res.data.data;
};

export const updateActivity = async (
  id: string,
  activityData: Partial<Activity>,
): Promise<{ activity: Activity }> => {
  const res = await api.patch(`/activities/${id}`, activityData);
  return res.data.data;
};

export const deleteActivity = async (id: string): Promise<void> => {
  await api.delete(`/activities/${id}`);
};
