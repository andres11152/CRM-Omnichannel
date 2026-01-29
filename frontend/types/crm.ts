import { TicketContact, User } from "../types";

export interface Account {
  id: string;
  companyId: string;
  name: string;
  industry?: string;
  website?: string;
  email?: string;
  size?: string;
  address?: string;
  status: "ACTIVE" | "CHURNED" | "LEAD";

  _count?: {
    contacts: number;
    deals: number;
  };

  contacts?: TicketContact[];
  deals?: Deal[];
  activities?: Activity[];

  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  id: string;
  companyId: string;
  title: string;
  value: number;
  currency: string;

  // Dynamic Pipeline fields
  pipelineId: string;
  pipeline?: {
    id: string;
    name: string;
  };

  stageId: string;
  stage?: {
    id: string;
    name: string;
    color: string;
    order: number;
  };

  order: number; // Position within stage for Kanban
  probability: number;
  expectedCloseDate?: string;

  accountId?: string;
  account?: Account;

  contactId?: string;
  contact?: TicketContact;

  assignedToId?: string;
  assignedTo?: User;

  activities?: Activity[];

  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  companyId: string;
  type: "NOTE" | "CALL" | "EMAIL" | "MEETING" | "TASK";
  subject: string;
  description?: string;
  status: "PENDING" | "COMPLETED";
  dueDate?: string;

  accountId?: string;
  dealId?: string;
  contactId?: string;

  assignedToId?: string;
  assignedTo?: User;
  participantIds?: string[]; // New field for multiple attendees

  createdById: string;
  createdBy: User;

  createdAt: string;
  updatedAt: string;
}
