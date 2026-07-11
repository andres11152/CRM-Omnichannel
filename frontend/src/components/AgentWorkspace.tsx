import React from "react";
import { useTranslation } from "react-i18next";
import { AIConfig, User } from "@/types";
import { useAgentWorkspace } from "@/hooks/useAgentWorkspace";
import { useResizable } from "@/hooks/useResizable";

// ── Sub-Components (SRP) ──
import { WorkspaceHeader, QueuePreviewCard, WelcomeDashboard } from "./agent";
import { ContactList } from "./ContactList";
import { ChatInterface } from "./ChatInterface";
import { NewChatModal } from "./NewChatModal";
import { TransferModal } from "./TransferModal";
import { QueueView } from "./QueueView";
import { ResolvedView } from "./ResolvedView";

interface Props {
  aiConfig: AIConfig;
  user?: User | null;
}

/**
 * AGENT WORKSPACE — Orchestrator Component
 *
 * This component is a THIN SHELL that wires together:
 *   1. useAgentWorkspace (all state + logic)
 *   2. WorkspaceHeader (navigation + stats)
 *   3. Sidebar (ContactList | QueueView | ResolvedView)
 *   4. Main Panel (ChatInterface | QueuePreviewCard | WelcomeDashboard)
 *   5. Modals (NewChatModal | TransferModal)
 *
 * Zero business logic lives here. All state and handlers are in useAgentWorkspace.
 */
export const AgentWorkspace: React.FC<Props> = ({ aiConfig, user }) => {
  const workspace = useAgentWorkspace({ user });
  const { t } = useTranslation();

  const { size: sidebarWidth, startResizing: startResizingSidebar } = useResizable({
    initialSize: 288,
    minSize: 240,
    maxSize: 480,
    storageKey: "reply_sidebar_width",
  });

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark">
      {/* ═══════════════ HEADER ═══════════════ */}
      <WorkspaceHeader
        user={user}
        socketConnected={workspace.socketConnected}
        activeTab={workspace.activeTab}
        isSidebarOpen={workspace.isSidebarOpen}
        myTicketsCount={workspace.myTickets.length}
        queueTicketsCount={workspace.queueTickets.length}
        resolvedTodayCount={workspace.resolvedTodayCount}
        resolvedTotalCount={
          workspace.tickets.filter(
            (t) => t.status === "CLOSED" || t.status === "RESOLVED",
          ).length
        }
        onTabChange={(tab) => {
          workspace.setActiveTab(tab);
          workspace.setActiveTicketId(null);
        }}
        onToggleSidebar={() =>
          workspace.setIsSidebarOpen(!workspace.isSidebarOpen)
        }
      />

      {/* ═══════════════ BODY ═══════════════ */}
      <div className="flex-1 flex overflow-hidden relative">
        <div
          className={`
            border-r border-gray-200 dark:border-reply-border-dark bg-white dark:bg-reply-surface-dark flex flex-col flex-shrink-0 z-20
            ${
              workspace.isSidebarOpen
                ? `w-full md:flex ${workspace.activeTicketId ? "hidden md:flex" : "flex"}`
                : "hidden"
            }
          `}
          style={workspace.isSidebarOpen && window.innerWidth >= 768 ? { width: `${sidebarWidth}px` } : {}}
        >
          {workspace.loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              {t("contact_list.loading", "Cargando tickets...")}
            </div>
          ) : workspace.activeTab === "queue" ? (
            <QueueView
              tickets={workspace.queueTickets}
              activeTicketId={workspace.activeTicketId}
              onSelectTicket={workspace.handleSelectContact}
              onTransferTicket={workspace.handleOpenTransferModal}
            />
          ) : workspace.activeTab === "resolved" ? (
            <ResolvedView
              tickets={workspace.tickets.filter(
                (t) => t.status === "CLOSED" || t.status === "RESOLVED",
              )}
              activeTicketId={workspace.activeTicketId}
              onSelectTicket={workspace.handleSelectContact}
            />
          ) : (
            <ContactList
              contacts={workspace.directContacts}
              groups={workspace.groupContacts}
              activeContactId={workspace.activeTicketId || ""}
              onSelectContact={workspace.handleSelectContact}
              userRole={user?.role}
              onDeleteContact={workspace.handleDeleteTicket}
              onNewChat={
                workspace.isRestricted
                  ? undefined
                  : () => workspace.setIsNewChatModalOpen(true)
              }
              filterUnread={workspace.filterUnread}
              onToggleFilterUnread={() =>
                workspace.setFilterUnread(!workspace.filterUnread)
              }
              showArchived={workspace.showArchived}
              archivedCount={workspace.archivedCount}
              onToggleShowArchived={() =>
                workspace.setShowArchived(!workspace.showArchived)
              }
              sortOrder={workspace.sortOrder}
              onChangeSortOrder={workspace.setSortOrder}
              viewMode={workspace.viewMode}
              onChangeViewMode={workspace.setViewMode}
              allTags={workspace.allTags}
              selectedTags={workspace.selectedTags}
              onToggleTag={workspace.handleToggleTag}
            />
          )}
        </div>

        {/* ── SIDEBAR RESIZER ── */}
        {workspace.isSidebarOpen && window.innerWidth >= 768 && (
          <div
            onMouseDown={startResizingSidebar}
            className="hidden md:block w-1.5 h-full cursor-col-resize absolute z-30 hover:bg-indigo-500/30 transition-colors group"
            style={{ left: `${sidebarWidth - 3}px` }}
          >
            <div className="w-[1px] h-full bg-transparent group-hover:bg-indigo-500 mx-auto" />
          </div>
        )}

        {/* ── MAIN PANEL ── */}
        <div
          className={`flex-1 bg-[#e5ddd5] dark:bg-reply-bg-dark relative flex flex-col min-w-0 ${!workspace.activeTicketId ? "hidden md:flex" : "flex"}`}
        >
          {workspace.activeTicket ? (
            workspace.activeTab === "my_chats" ? (
              <ChatInterface
                activeContact={{
                  ...workspace.activeContact!,
                  ticketId: workspace.activeTicket.id,
                }}
                aiConfig={aiConfig}
                readOnly={workspace.isRestricted}
                onBack={() => workspace.setActiveTicketId(null)}
                onResolve={workspace.handleResolve}
                onContactUpdate={workspace.handleContactUpdate}
                onTicketUpdate={workspace.handleOptimisticTicketUpdate}
                onSetContactBlockStatus={workspace.handleSetContactBlockStatus}
                onSetArchived={workspace.handleSetArchived}
                onSetPinned={workspace.handleSetPinned}
                onSetMuted={workspace.handleSetMuted}
              />
            ) : (
              <QueuePreviewCard
                ticket={workspace.activeTicket}
                isRestricted={workspace.isRestricted}
                onPickTicket={workspace.handlePickTicket}
              />
            )
          ) : (
            <WelcomeDashboard
              user={user}
              socketConnected={workspace.socketConnected}
              activeTab={workspace.activeTab}
              myTicketsCount={workspace.myTickets.length}
              queueTicketsCount={workspace.queueTickets.length}
              resolvedTodayCount={workspace.resolvedTodayCount}
            />
          )}
        </div>
      </div>

      {/* ═══════════════ MODALS ═══════════════ */}
      <NewChatModal
        isOpen={workspace.isNewChatModalOpen}
        onClose={() => workspace.setIsNewChatModalOpen(false)}
        onSubmit={workspace.handleCreateChatSubmit}
      />
      <TransferModal
        isOpen={workspace.isTransferModalOpen}
        onClose={() => {
          workspace.setIsTransferModalOpen(false);
        }}
        onTransfer={workspace.handleQueueTransfer}
        currentUserId={user?.id}
      />
    </div>
  );
};
