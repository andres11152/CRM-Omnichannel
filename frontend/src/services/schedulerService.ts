import { api } from "@/lib/axios";

export interface BookingInput {
  companyId: string;
  agentSlugOrId: string;
  meetingTypeSlug: string;
  startTime: string; // ISO String
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  guestNotes?: string;
}

export interface MeetingType {
  id: string;
  name: string;
  slug: string;
  description?: string;
  duration: number;
  isActive: boolean;
}

export interface AvailabilityRule {
  day: number;
  slots: { start: string; end: string }[];
}

export interface Availability {
  id?: string;
  timezone: string;
  rules: AvailabilityRule[];
}

/**
 * Public: Fetch available meeting slots
 */
export const getAvailableSlots = async (
  companyId: string,
  agent: string,
  meetingType: string,
  date: string
): Promise<string[]> => {
  const params = new URLSearchParams({
    companyId,
    agent,
    meetingType,
    date,
  });
  const res = await api.get(`/scheduler/slots?${params.toString()}`);
  return res.data.data || [];
};

/**
 * Public: Book a meeting slot
 */
export const bookMeeting = async (data: BookingInput): Promise<{ success: boolean; agentName: string; meetingName: string; startTime: string }> => {
  const res = await api.post("/scheduler/book", data);
  return res.data.data;
};

/**
 * Protected: Get availability configuration for the current agent
 */
export const getAvailability = async (): Promise<Availability> => {
  const res = await api.get("/scheduler/availability");
  return res.data.data;
};

/**
 * Protected: Save/Update availability configuration for the current agent
 */
export const saveAvailability = async (data: { timezone: string; rules: AvailabilityRule[] }): Promise<Availability> => {
  const res = await api.post("/scheduler/availability", data);
  return res.data.data;
};

/**
 * Protected: Get all meeting types for the current agent
 */
export const getMeetingTypes = async (): Promise<MeetingType[]> => {
  const res = await api.get("/scheduler/meeting-types");
  return res.data.data || [];
};

/**
 * Protected: Create a new meeting type
 */
export const createMeetingType = async (data: Omit<MeetingType, "id">): Promise<MeetingType> => {
  const res = await api.post("/scheduler/meeting-types", data);
  return res.data.data;
};

/**
 * Protected: Update a meeting type
 */
export const updateMeetingType = async (id: string, data: Partial<Omit<MeetingType, "id">>): Promise<MeetingType> => {
  const res = await api.put(`/scheduler/meeting-types/${id}`, data);
  return res.data.data;
};

/**
 * Protected: Delete a meeting type
 */
export const deleteMeetingType = async (id: string): Promise<void> => {
  await api.delete(`/scheduler/meeting-types/${id}`);
};

/**
 * Protected: Get Outlook connection status
 */
export const getOutlookStatus = async (): Promise<{ connected: boolean }> => {
  const res = await api.get("/outlook/status");
  return res.data.data || res.data;
};

/**
 * Protected: Disconnect Outlook Calendar
 */
export const disconnectOutlook = async (): Promise<void> => {
  await api.post("/outlook/disconnect");
};
