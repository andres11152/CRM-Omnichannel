
import { Ticket, Channel, Contact } from '../types/index';

// Mock Database for Tickets
const MOCK_TICKETS_DB: Ticket[] = [
  {
    id: 'TKT-001', companyId: 'comp_123',
    contact: {
      id: 'c1', companyId: 'comp_123', name: 'Alicia Fernández', avatarUrl: 'https://picsum.photos/200/200?random=1',
      lastMessage: 'Hola, necesito información sobre el estado de mi pedido #1234',
      lastMessageTime: new Date(Date.now() - 1000 * 60 * 5),
      unreadCount: 1,
      tags: ['VIP'],
      channel: Channel.WHATSAPP,
      status: 'open',
      assignedMode: 'human'
    },
    channel: Channel.WHATSAPP, status: 'open', queueId: 'q_2', 
    lastMessage: 'Hola, necesito información sobre el estado de mi pedido #1234',
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 5), unreadCount: 1, tags: ['VIP'],
  },
  {
    id: 'TKT-002', companyId: 'comp_123',
    contact: {
      id: 'c2', companyId: 'comp_123', name: 'Juan Pérez', avatarUrl: 'https://picsum.photos/200/200?random=2',
      lastMessage: '¿Están abiertos los fines de semana?',
      lastMessageTime: new Date(Date.now() - 1000 * 60 * 60),
      unreadCount: 0,
      tags: ['Lead', 'New'],
      channel: Channel.MESSENGER,
      status: 'pending',
      assignedMode: 'bot'
    },
    channel: Channel.MESSENGER, status: 'pending', queueId: null, 
    lastMessage: '¿Están abiertos los fines de semana?',
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 60), unreadCount: 0, tags: ['Lead', 'New'],
  },
  {
    id: 'TKT-003', companyId: 'comp_123',
    contact: {
      id: 'c3', companyId: 'comp_123', name: 'Mariana Gomez', avatarUrl: 'https://picsum.photos/200/200?random=3',
      lastMessage: 'Me interesa el producto que publicaron hoy, ¿precio?',
      lastMessageTime: new Date(Date.now() - 1000 * 60 * 120),
      unreadCount: 0,
      tags: ['Lead'],
      channel: Channel.INSTAGRAM,
      status: 'open',
      assignedMode: 'human'
    },
    channel: Channel.INSTAGRAM, status: 'open', queueId: 'q_1', 
    lastMessage: 'Me interesa el producto que publicaron hoy, ¿precio?',
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 120), unreadCount: 0, tags: ['Lead'],
  },
   {
    id: 'TKT-004', companyId: 'comp_123',
    contact: {
      id: 'c4', companyId: 'comp_123', name: 'Carlos Rivera', avatarUrl: 'https://picsum.photos/200/200?random=4',
      lastMessage: 'Gracias por la info!',
      lastMessageTime: new Date(Date.now() - 1000 * 60 * 150),
      unreadCount: 0,
      tags: [],
      channel: Channel.WHATSAPP,
      status: 'pending',
      assignedMode: 'bot'
    },
    channel: Channel.WHATSAPP, status: 'pending', queueId: null, 
    lastMessage: 'Gracias por la info!',
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 150), unreadCount: 0, tags: [],
  }
];


export const ticketService = {
  
  async getTickets(companyId: string): Promise<Ticket[]> {
    // SECURITY: Filter by companyId
    const companyTickets = MOCK_TICKETS_DB.filter(t => t.companyId === companyId);
    return Promise.resolve(JSON.parse(JSON.stringify(companyTickets)));
  },

  async updateTicket(companyId: string, ticketId: string, data: Partial<Ticket>): Promise<Ticket> {
    const ticketIndex = MOCK_TICKETS_DB.findIndex(t => t.id === ticketId && t.companyId === companyId);
    if (ticketIndex === -1) {
      throw new Error("Ticket not found or access denied");
    }

    const updatedTicket = { ...MOCK_TICKETS_DB[ticketIndex], ...data };
    
    // Sync nested contact status if ticket status changed
    if (data.status) {
        updatedTicket.contact.status = data.status;
    }

    MOCK_TICKETS_DB[ticketIndex] = updatedTicket;
    
    console.log(`[TicketService] Updated ticket ${ticketId}:`, data);

    return Promise.resolve(updatedTicket);
  }
};
