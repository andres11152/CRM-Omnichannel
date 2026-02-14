import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { Ticket, Agent } from '@/types';
import { getTickets, updateTicket, updateTicketStatus } from '@/services/ticketService';
import { getAgents } from '@/services/queueService';

const STATUS_COLUMNS = {
  OPEN: { id: 'OPEN', title: 'Abierto', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  IN_PROGRESS: { id: 'IN_PROGRESS', title: 'En Progreso', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  RESOLVED: { id: 'RESOLVED', title: 'Resuelto', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  CLOSED: { id: 'CLOSED', title: 'Cerrado', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
};

interface Props {
  isWidget?: boolean;
}

export const TicketsKanbanView: React.FC<Props> = ({ isWidget = false }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState<'ALL' | 'URGENT' | 'HIGH'>('ALL');
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    fetchTickets();
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const data = await getAgents();
      // Ensure we treat all with agent roles as assignable
      setAgents(data);
    } catch (error) {
      console.error("Failed to load agents", error);
    }
  };

  const fetchTickets = async () => {
    try {
      const data = await getTickets();
      if (Array.isArray(data)) {
        setTickets(data);
      }
    } catch (error) {
      console.error("Failed to load tickets", error);
    } finally {
      setLoading(false);
    }
  };

  // Modal States
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Handlers
  const handleViewDetails = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setShowViewModal(true);
  };

  const handleAssignAgent = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setShowAssignModal(true);
  };

  const handleCloseModals = () => {
    setShowViewModal(false);
    setShowAssignModal(false);
    setSelectedTicket(null);
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const newStatus = destination.droppableId;
    
    // Optimistic Update
    const originalTickets = [...tickets];
    setTickets(prev => prev.map(t => 
      t.id === draggableId ? { ...t, status: newStatus as any } : t
    ));

    try {
      await updateTicketStatus(draggableId, newStatus);
    } catch (error) {
      console.error("Failed to update ticket status", error);
      setTickets(originalTickets); // Revert
      toast.error("Error al actualizar el estado del ticket.");
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    if (filterPriority === 'URGENT') return ticket.priority === 'URGENT';
    if (filterPriority === 'HIGH') return ticket.priority === 'HIGH';
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark">
      {/* Stats Toolbar */}
      <div className={`bg-white dark:bg-reply-panel-dark border-b border-gray-200 dark:border-reply-border-dark flex justify-between items-center ${isWidget ? 'px-4 py-2' : 'px-8 py-4'}`}>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Total</span>
            <span className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{tickets.length}</span>
          </div>
          {!isWidget && (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800">
                <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">Urgentes</span>
                <span className="text-lg font-bold text-red-700 dark:text-red-300">{tickets.filter(t => t.priority === 'URGENT').length}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-100 dark:border-yellow-800">
                <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">En Progreso</span>
                <span className="text-lg font-bold text-yellow-700 dark:text-yellow-300">{tickets.filter(t => t.status === 'IN_PROGRESS').length}</span>
              </div>
            </>
          )}
        </div>
        
        {/* Filter Actions */}
        <div className="flex gap-2">
           <select 
             className="bg-reply-bg dark:bg-gray-800 border border-gray-200 dark:border-reply-border-dark rounded-lg text-sm px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-gray-700 dark:text-gray-300"
             value={filterPriority}
             onChange={(e) => setFilterPriority(e.target.value as any)}
           >
             <option value="ALL">Todos</option>
             <option value="URGENT">Urgentes</option>
             <option value="HIGH">Alta Prioridad</option>
           </select>
        </div>
      </div>

      <div className={`flex-1 overflow-x-auto ${isWidget ? 'p-2' : 'p-8'}`}>
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-6 h-full min-w-max">
            {Object.values(STATUS_COLUMNS).map((column) => (
              <div key={column.id} className="w-80 flex flex-col h-full bg-gray-100/50 dark:bg-reply-surface-dark/50 rounded-xl border border-gray-200 dark:border-reply-border-dark/50">
                <div className={`p-3 border-b border-gray-200 dark:border-reply-border-dark bg-white dark:bg-reply-panel-dark rounded-t-xl sticky top-0 z-10 border-t-4 ${
                  column.id === 'OPEN' ? 'border-t-blue-500' :
                  column.id === 'IN_PROGRESS' ? 'border-t-yellow-500' :
                  column.id === 'RESOLVED' ? 'border-t-green-500' :
                  'border-t-gray-500'
                }`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm uppercase tracking-wide">{column.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${column.color}`}>
                      {filteredTickets.filter(t => t.status === column.id).length}
                    </span>
                  </div>
                </div>
                
                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 p-3 overflow-y-auto transition-colors ${
                        snapshot.isDraggingOver ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                      }`}
                    >
                      {filteredTickets
                        .filter(ticket => ticket.status === column.id)
                        .map((ticket, index) => (
                          <Draggable key={ticket.id} draggableId={ticket.id} index={index}>
                            {(provided, snapshot) =>                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={`bg-white dark:bg-reply-border-dark rounded-lg shadow-sm border mb-3 hover:shadow-md hover:-translate-y-1 transition-all duration-200 overflow-hidden group ${
                                    snapshot.isDragging ? 'rotate-2 scale-105 shadow-xl ring-2 ring-indigo-500 z-50' : 
                                    'border-gray-200 dark:border-reply-border-dark'
                                  }`}
                                style={provided.draggableProps.style}
                              >
                                {/* Toolbar */}
                                <div className={`px-4 py-2 flex justify-between items-center border-b ${
                                  ticket.priority === 'URGENT' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                                  ticket.priority === 'HIGH' ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' :
                                  ticket.priority === 'MEDIUM' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' :
                                  'bg-reply-bg dark:bg-gray-800 border-gray-200 dark:border-reply-border-dark'
                                }`}>
                                  <div className="flex items-center gap-2">
                                    {/* Channel Icon */}
                                    {ticket.channel === 'WHATSAPP' ? (
                                      <span className="text-green-600 dark:text-green-400" title="WhatsApp">
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                                      </span>
                                    ) : ticket.channel === 'INSTAGRAM_DM' ? (
                                      <span className="text-blue-600 dark:text-blue-400" title="Instagram">
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.107 0 11.406c0 3.405 1.568 6.463 4.086 8.474v4.222l3.936-2.16c1.272.353 2.617.545 4.005.545 6.627 0 12-5.106 12-11.406C24 5.107 18.627 0 12 0zm-1.375 14.878l-2.833-3.024-5.54 3.024 6.088-6.485 2.86 3.025 5.505-3.025-6.08 6.485z"/></svg>
                                      </span>
                                    ) : (
                                      <span className="text-gray-500 dark:text-gray-400" title="Email">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                      </span>
                                    )}
                                    
                                    {/* Priority Badge */}
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                      ticket.priority === 'URGENT' ? 'bg-red-600 text-white' :
                                      ticket.priority === 'HIGH' ? 'bg-orange-600 text-white' :
                                      ticket.priority === 'MEDIUM' ? 'bg-blue-600 text-white' :
                                      'bg-gray-500 text-white'
                                    }`}>
                                      {ticket.priority === 'URGENT' ? '🔥 URGENTE' :
                                       ticket.priority === 'HIGH' ? 'ALTA' :
                                       ticket.priority === 'MEDIUM' ? 'MEDIA' : 'BAJA'}
                                    </span>
                                  </div>
                                  
                                  {/* Wait Time */}
                                  <div className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <span>{(() => {
                                      const minutes = Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 60000);
                                      if (minutes < 60) return `${minutes}m`;
                                      const hours = Math.floor(minutes / 60);
                                      return `${hours}h ${minutes % 60}m`;
                                    })()}</span>
                                  </div>
                                </div>

                                {/* Body */}
                                <div className="p-4">
                                  {/* Customer Info */}
                                  <div className="flex items-center gap-3 mb-3">
                                    {ticket.contact?.avatarUrl ? (
                                      <img src={ticket.contact.avatarUrl} alt="" className="w-10 h-10 rounded-full border-2 border-gray-200 dark:border-gray-600" />
                                    ) : (
                                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm border-2 border-gray-200 dark:border-gray-600">
                                        {ticket.contact?.name?.[0]?.toUpperCase() || '?'}
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-bold text-gray-800 dark:text-gray-100 truncate text-sm">
                                        {ticket.contact?.name || 'Cliente Sin Nombre'}
                                      </h4>
                                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {ticket.contact?.email || 'No email'}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Subject/Title */}
                                  {ticket.subject && (
                                    <h5 className="font-semibold text-gray-700 dark:text-gray-200 mb-2 text-sm line-clamp-2">
                                      {ticket.subject}
                                    </h5>
                                  )}

                                  {/* Last Message Preview */}
                                  {ticket.lastMessage && (
                                    <div className="bg-reply-bg dark:bg-gray-800/50 rounded-lg p-2 mb-3">
                                      <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 italic">
                                        "{ticket.lastMessage}"
                                      </p>
                                    </div>
                                  )}

                                  {/* Tags */}
                                  {ticket.tags && ticket.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-3">
                                      {ticket.tags.slice(0, 2).map((tag, idx) =>                                          <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 font-medium">
                                            {tag}
                                          </span>
                                      )}
                                      {ticket.tags.length > 2 && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                          +{ticket.tags.length - 2}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* Footer with Actions */}
                                  <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-reply-border-dark">
                                    <div className="text-xs text-gray-400">
                                      #{ticket.id.slice(-6)}
                                    </div>
                                    <div className="flex gap-1">
                                      <button 
                                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                        title="Ver detalles"
                                        onClick={(e) => { 
                                          e.stopPropagation(); 
                                          handleViewDetails(ticket);
                                        }}
                                      >
                                        <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                      </button>
                                      <button 
                                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                        title="Asignar agente"
                                        onClick={(e) => { 
                                          e.stopPropagation(); 
                                          handleAssignAgent(ticket);
                                        }}
                                      >
                                        <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            }
                          </Draggable>
                        ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      </div>

      {/* View Details Modal */}
      {showViewModal && selectedTicket && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCloseModals}>
          <div className="bg-white dark:bg-reply-border-dark rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-800 dark:to-purple-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                Detalles del Ticket
              </h3>
              <button onClick={handleCloseModals} className="text-white hover:text-gray-200 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
              {/* Customer Info */}
              <div className="flex items-center gap-4 p-4 bg-reply-bg dark:bg-gray-800/50 rounded-lg">
                {selectedTicket.contact?.avatarUrl ? (
                  <img src={selectedTicket.contact.avatarUrl} alt="" className="w-16 h-16 rounded-full border-2 border-indigo-500" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl">
                    {selectedTicket.contact?.name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div>
                  <h4 className="text-xl font-bold text-gray-800 dark:text-white">{selectedTicket.contact?.name || 'Cliente Sin Nombre'}</h4>
                  <p className="text-gray-600 dark:text-gray-400">{selectedTicket.contact?.email || 'No email'}</p>
                  <div className="flex gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      selectedTicket.priority === 'URGENT' ? 'bg-red-600 text-white' :
                      selectedTicket.priority === 'HIGH' ? 'bg-orange-600 text-white' :
                      selectedTicket.priority === 'MEDIUM' ? 'bg-blue-600 text-white' :
                      'bg-gray-500 text-white'
                    }`}>
                      {selectedTicket.priority}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                      {selectedTicket.channel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ticket Info */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">ID del Ticket</label>
                  <p className="text-gray-800 dark:text-white font-mono">#{selectedTicket.id}</p>
                </div>
                
                {selectedTicket.subject && (
                  <div>
                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Asunto</label>
                    <p className="text-gray-800 dark:text-white">{selectedTicket.subject}</p>
                  </div>
                )}

                <div>
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Estado</label>
                  <p className="text-gray-800 dark:text-white">
                    {selectedTicket.status === 'OPEN' ? 'Abierto' :
                     selectedTicket.status === 'IN_PROGRESS' ? 'En Progreso' :
                     selectedTicket.status === 'RESOLVED' ? 'Resuelto' : 'Cerrado'}
                  </p>
                </div>

                {selectedTicket.lastMessage && (
                  <div>
                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Último Mensaje</label>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 mt-1">
                      <p className="text-gray-800 dark:text-white">{selectedTicket.lastMessage}</p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Creado</label>
                  <p className="text-gray-800 dark:text-white">{new Date(selectedTicket.createdAt).toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-reply-bg dark:bg-gray-800 border-t border-gray-200 dark:border-reply-border-dark flex justify-end gap-3">
              <button 
                onClick={handleCloseModals}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cerrar
              </button>
              <button 
                onClick={() => {
                  toast.info('Funcionalidad de responder ticket en desarrollo');
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors"
              >
                Responder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Agent Modal */}
      {showAssignModal && selectedTicket && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCloseModals}>
          <div className="bg-white dark:bg-reply-border-dark rounded-xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-800 dark:to-purple-800 flex justify-between items-center rounded-t-xl">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                Asignar Agente
              </h3>
              <button onClick={handleCloseModals} className="text-white hover:text-gray-200 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="bg-reply-bg dark:bg-gray-800 rounded-lg p-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">Ticket:</p>
                <p className="font-semibold text-gray-800 dark:text-white">#{selectedTicket.id.slice(-8)}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Cliente: {selectedTicket.contact?.name}</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Selecciona un agente
                </label>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {agents.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">No hay agentes disponibles.</p>
                    ) : (
                      agents.map((agent: Agent) => (
                        <button
                          key={agent.id}
                          onClick={async () => {
                            try {
                              await updateTicket(selectedTicket.id, { assignedToId: agent.id });
                              toast.success(`Ticket asignado a ${agent.name}`);
                              fetchTickets(); // Refresh
                              handleCloseModals();
                            } catch (error) {
                              toast.error('Error al asignar el ticket');
                            }
                          }}
                          className="w-full flex items-center gap-3 p-3 bg-reply-bg dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors border-2 border-transparent hover:border-indigo-500"
                        >
                          {agent.avatar ? (
                            <img src={agent.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                              {agent.name[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 text-left">
                            <p className="font-semibold text-gray-800 dark:text-white">{agent.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                               Role: {agent.role}
                            </p>
                          </div>
                          <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-reply-bg dark:bg-gray-800 border-t border-gray-200 dark:border-reply-border-dark flex justify-end rounded-b-xl">
              <button 
                onClick={handleCloseModals}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

