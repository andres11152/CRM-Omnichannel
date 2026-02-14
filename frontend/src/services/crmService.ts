import { Account, Deal, Activity } from "@/types/crm";
import { api } from "@/lib/axios";

// --- ACCOUNTS ---

export const getAccounts = async (): Promise<{ accounts: Account[] }> => {
  const res = await api.get("/accounts");
  return res.data.data;
};

// --- PIPELINES ---

export const getPipelines = async (): Promise<{ pipelines: any[] }> => {
  const res = await api.get("/pipelines");
  return res.data.data;
};

export const getAccount = async (id: string): Promise<{ account: Account }> => {
  const res = await api.get(`/accounts/${id}`);
  return res.data.data;
};

export const createAccount = async (
  accountData: Partial<Account>
): Promise<{ account: Account }> => {
  const res = await api.post("/accounts", accountData);
  return res.data.data;
};

export const updateAccount = async (
  id: string,
  accountData: Partial<Account>
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
}): Promise<{ deals: Deal[] }> => {
  const query = new URLSearchParams(filters as any).toString();
  const res = await api.get(`/deals?${query}`);
  return res.data.data;
};

export const createDeal = async (
  dealData: Partial<Deal>
): Promise<{ deal: Deal }> => {
  const res = await api.post("/deals", dealData);
  return res.data.data;
};

export const updateDeal = async (
  id: string,
  dealData: Partial<Deal>
): Promise<{ deal: Deal }> => {
  const res = await api.patch(`/deals/${id}`, dealData);
  return res.data.data;
};

export const deleteDeal = async (id: string): Promise<void> => {
  await api.delete(`/deals/${id}`);
};

// --- CONTACTS ---

export const getContacts = async (): Promise<{ contacts: any[] }> => {
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

// --- ACTIVITIES ---

export const getActivities = async (filters?: {
  dealId?: string;
  accountId?: string;
  contactId?: string;
}): Promise<{ activities: Activity[] }> => {
  const query = new URLSearchParams(filters as any).toString();
  const res = await api.get(`/activities?${query}`);
  return res.data.data;
};

export const createActivity = async (
  activityData: Partial<Activity>
): Promise<{ activity: Activity }> => {
  const res = await api.post("/activities", activityData);
  return res.data.data;
};

export const updateActivity = async (
  id: string,
  activityData: Partial<Activity>
): Promise<{ activity: Activity }> => {
  const res = await api.patch(`/activities/${id}`, activityData);
  return res.data.data;
};

export const deleteActivity = async (id: string): Promise<void> => {
  await api.delete(`/activities/${id}`);
};

