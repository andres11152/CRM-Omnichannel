import React, { useState, useEffect, useCallback } from 'react';
import { Command } from 'cmdk';
import { Search, User, Ticket, DollarSign, X, CornerDownLeft } from 'lucide-react';
import api from '../../services/apiClient';
import { useNavigate } from 'react-router-dom';

/**
 * 🔍 COMMAND CENTER (Global Search)
 * Búsqueda universal CMD+K / CTRL+K inspirada en Linear/Notion
 */

interface SearchResults {
  contacts: Array<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    type: 'contact';
  }>;
  tickets: Array<{
    id: string;
    subject: string;
    ticketNumber: number;
    status: string;
    type: 'ticket';
  }>;
  deals: Array<{
    id: string;
    title: string;
    value: number;
    stageName: string;
    type: 'deal';
  }>;
}

export const CommandCenter: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ contacts: [], tickets: [], deals: [] });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults({ contacts: [], tickets: [], deals: [] });
      return;
    }

    const delaySearch = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(query)}`);
        if (res.data.status === 'success') {
          setResults(res.data.data.results);
        }
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(delaySearch);
  }, [query]);

  // Keyboard shortcut listener (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }

      // ESC to close
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Navigate to result
  const handleSelect = useCallback((type: string, id: string) => {
    switch (type) {
      case 'contact':
        navigate(`/contacts/${id}`);
        break;
      case 'ticket':
        navigate(`/tickets/${id}`);
        break;
      case 'deal':
        navigate(`/deals/${id}`);
        break;
    }
    setOpen(false);
    setQuery('');
  }, [navigate]);

  // Close modal on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setOpen(false);
    }
  };

  if (!open) return null;

  const totalResults = results.contacts.length + results.tickets.length + results.deals.length;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[15vh] animate-fade-in"
      onClick={handleBackdropClick}
    >
      <Command
        className="bg-white dark:bg-[#202c33] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl overflow-hidden animate-slide-up"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Search className="w-5 h-5 text-gray-400" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar contactos, tickets, negocios..."
            className="flex-1 bg-transparent text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none text-base"
            autoFocus
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          )}
          <button
            onClick={() => setOpen(false)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            title="Cerrar (ESC)"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Results */}
        <Command.List className="max-h-[400px] overflow-y-auto p-2">
          {query.length < 2 ? (
            <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Escribe al menos 2 caracteres para buscar</p>
              <p className="text-xs mt-1 text-gray-400">Contactos • Tickets • Negocios</p>
            </div>
          ) : totalResults === 0 && !loading ? (
            <Command.Empty className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No se encontraron resultados</p>
              <p className="text-xs mt-1">Intenta con otro término de búsqueda</p>
            </Command.Empty>
          ) : (
            <>
              {/* Contacts Group */}
              {results.contacts.length > 0 && (
                <Command.Group heading="Contactos" className="mb-2">
                  <div className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Contactos
                  </div>
                  {results.contacts.map((contact) => (
                    <Command.Item
                      key={contact.id}
                      value={`contact-${contact.id}`}
                      onSelect={() => handleSelect('contact', contact.id)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center group-hover:bg-indigo-200 dark:group-hover:bg-indigo-800/50">
                        <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 dark:text-white text-sm truncate">
                          {contact.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {contact.email || contact.phone}
                        </p>
                      </div>
                      <CornerDownLeft className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Tickets Group */}
              {results.tickets.length > 0 && (
                <Command.Group heading="Tickets" className="mb-2">
                  <div className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Tickets
                  </div>
                  {results.tickets.map((ticket) => (
                    <Command.Item
                      key={ticket.id}
                      value={`ticket-${ticket.id}`}
                      onSelect={() => handleSelect('ticket', ticket.id)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center group-hover:bg-green-200 dark:group-hover:bg-green-800/50">
                        <Ticket className="w-4 h-4 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 dark:text-white text-sm truncate">
                          #{ticket.ticketNumber} - {ticket.subject}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Estado: {ticket.status}
                        </p>
                      </div>
                      <CornerDownLeft className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Deals Group */}
              {results.deals.length > 0 && (
                <Command.Group heading="Negocios" className="mb-2">
                  <div className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Negocios
                  </div>
                  {results.deals.map((deal) => (
                    <Command.Item
                      key={deal.id}
                      value={`deal-${deal.id}`}
                      onSelect={() => handleSelect('deal', deal.id)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center group-hover:bg-yellow-200 dark:group-hover:bg-yellow-800/50">
                        <DollarSign className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 dark:text-white text-sm truncate">
                          {deal.title}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          ${deal.value.toLocaleString()} • {deal.stageName}
                        </p>
                      </div>
                      <CornerDownLeft className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </>
          )}
        </Command.List>

        {/* Footer Hint */}
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-[#111b21]">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-[10px] font-mono">↑↓</kbd>
              Navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-[10px] font-mono">↵</kbd>
              Abrir
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-[10px] font-mono">ESC</kbd>
              Cerrar
            </span>
          </div>
          {totalResults > 0 && (
            <span>{totalResults} resultado{totalResults !== 1 && 's'}</span>
          )}
        </div>
      </Command>
    </div>
  );
};
