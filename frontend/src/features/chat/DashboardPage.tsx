import { useEffect, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { MiniSidebar } from '../../components/MiniSidebar';
import { Sidebar } from '../../components/Sidebar';
import { ChatPanel } from '../../components/ChatPanel';
import { ConversationDetailsPanel } from '../../components/ConversationDetailsPanel';
import type { Contact, Group } from '../../types';

type DashboardState = ReturnType<typeof import('../../App').useDashboardState>;

function DesktopDashboardPage({ dashboard }: { dashboard: DashboardState }) {
  const {
    navigate,
    workspace,
    chat,
    composer,
    status,
    detailsOpen,
    setDetailsOpen,
    currentAccountId,
    sidebarAccounts,
    workspaceAccount,
    filteredConversations,
    filteredContacts,
    filteredGroups,
    activeConversation,
    activeContact,
    activeGroup,
    activeName,
    activeAvatar,
    activeSubtitle,
    isGroupConversation,
    fileInputRef,
    resolveWorkspaceId,
    onSelectAccount,
    onSelectConversation,
    onOpenDirectConversation,
    onOpenGroupConversation,
    onMessagesScroll,
    onKeyDown,
    onSend,
    onReactMessage,
    onRenameAccount,
  } = dashboard;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex w-full min-h-screen min-h-dvh overflow-hidden">
        <MiniSidebar
          accounts={sidebarAccounts}
          selectedAccountId={workspace.selectedAccountId}
          currentAccountId={currentAccountId}
          conversations={Object.values(chat.conversationsByAccount).flat()}
          onSelectAccount={onSelectAccount}
          onOpenAdmin={() => navigate('/admin')}
        />
        <Sidebar
          sidebarTab={workspace.sidebarTab}
          onTabChange={workspace.setSidebarTab}
          query={workspace.query}
          onQueryChange={workspace.setQuery}
          conversations={filteredConversations}
          contacts={filteredContacts}
          groups={filteredGroups}
          activeConversationId={chat.activeConversationId}
          workspaceAccountId={resolveWorkspaceId()}
          accountHubAlias={workspaceAccount?.hubAlias}
          accountDisplayName={workspaceAccount?.displayName ?? status?.account?.displayName}
          accountAvatar={workspaceAccount?.avatar ?? status?.account?.avatar}
          accountPhoneNumber={workspaceAccount?.phoneNumber ?? status?.account?.phoneNumber}
          onRenameAccount={onRenameAccount}
          onSelectConversation={onSelectConversation}
          onOpenDirectConversation={onOpenDirectConversation}
          onOpenGroupConversation={onOpenGroupConversation}
        />
        <div className="flex-1 min-w-0 flex relative">
          <ChatPanel
            activeConversationId={chat.activeConversationId}
            activeConversation={activeConversation}
            activeName={activeName}
            activeAvatar={activeAvatar}
            activeSubtitle={activeSubtitle}
            isGroupConversation={isGroupConversation}
            messages={chat.messages}
            hasMoreHistory={chat.hasMoreHistory}
            loadingOlder={chat.loadingOlder}
            syncingHistory={chat.syncingHistory}
            statusMsg={composer.statusMsg}
            loadError={composer.loadError}
            text={composer.text}
            attachFile={composer.attachFile}
            sending={composer.sending}
            typingUsers={[]}
            detailsOpen={detailsOpen}
            onScroll={onMessagesScroll}
            onTextChange={composer.setText}
            onKeyDown={onKeyDown}
            onSend={onSend}
            onAttachFile={composer.setAttachFile}
            onClearFile={() => { composer.setAttachFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
            onToggleDetails={() => setDetailsOpen((open) => !open)}
            onReactMessage={onReactMessage}
            showDisconnectBanner={status ? !status.sessionActive && !status.loginInProgress && !!workspace.selectedAccountId : false}
          />
          <ConversationDetailsPanel
            open={detailsOpen}
            conversation={activeConversation}
            contact={activeContact}
            group={activeGroup}
            workspaceAccount={workspaceAccount}
            onClose={() => setDetailsOpen(false)}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

function MobileDashboardPage({ dashboard }: { dashboard: DashboardState }) {
  const {
    navigate,
    workspace,
    chat,
    composer,
    status,
    detailsOpen,
    setDetailsOpen,
    currentAccountId,
    sidebarAccounts,
    workspaceAccount,
    filteredConversations,
    filteredContacts,
    filteredGroups,
    activeConversation,
    activeContact,
    activeGroup,
    activeName,
    activeAvatar,
    activeSubtitle,
    isGroupConversation,
    fileInputRef,
    resolveWorkspaceId,
    onSelectAccount,
    onSelectConversation,
    onOpenDirectConversation,
    onOpenGroupConversation,
    onMessagesScroll,
    onKeyDown,
    onSend,
    onReactMessage,
    onRenameAccount,
  } = dashboard;
  const [screen, setScreen] = useState<'list' | 'chat'>('list');

  useEffect(() => {
    if (!chat.activeConversationId) {
      setScreen('list');
    }
  }, [chat.activeConversationId]);

  const handleSelectConversation = (conversationId: string) => {
    setScreen('chat');
    onSelectConversation(conversationId);
  };

  const handleOpenDirectConversation = (contact: Contact) => {
    setScreen('chat');
    onOpenDirectConversation(contact);
  };

  const handleOpenGroupConversation = (group: Group) => {
    setScreen('chat');
    onOpenGroupConversation(group);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex w-full min-h-screen min-h-dvh bg-[var(--background)]">
        {screen === 'list' && (
          <div className="flex min-h-screen min-h-dvh w-full flex-col">
            <div className="border-b border-[var(--border)] bg-[rgba(9,12,18,0.96)] px-3 py-3 backdrop-blur">
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" className="h-9 px-3 text-xs" onClick={() => navigate('/admin')}>
                  Admin
                </Button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[#eef2ff]">Zalo Hub Mobile</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {(workspaceAccount?.displayName ?? status?.account?.displayName ?? resolveWorkspaceId()) || 'Chưa chọn account'}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {sidebarAccounts.filter((account) => account.visible !== false).map((account) => {
                  const isSelected = account.accountId === (workspace.selectedAccountId || currentAccountId);
                  return (
                    <button
                      key={account.accountId}
                      type="button"
                      onClick={() => onSelectAccount(account.accountId)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${isSelected ? 'border-[rgba(95,212,255,0.34)] bg-[rgba(79,122,255,0.18)] text-[#dfe9ff]' : 'border-white/10 bg-white/4 text-muted-foreground'}`}
                    >
                      {account.hubAlias ?? account.displayName ?? account.accountId}
                    </button>
                  );
                })}
              </div>
            </div>
            <Sidebar
              className="w-full min-w-0 flex-1 border-r-0 max-sm:w-full max-sm:min-w-0"
              sidebarTab={workspace.sidebarTab}
              onTabChange={workspace.setSidebarTab}
              query={workspace.query}
              onQueryChange={workspace.setQuery}
              conversations={filteredConversations}
              contacts={filteredContacts}
              groups={filteredGroups}
              activeConversationId={chat.activeConversationId}
              workspaceAccountId={resolveWorkspaceId()}
              accountHubAlias={workspaceAccount?.hubAlias}
              accountDisplayName={workspaceAccount?.displayName ?? status?.account?.displayName}
              accountAvatar={workspaceAccount?.avatar ?? status?.account?.avatar}
              accountPhoneNumber={workspaceAccount?.phoneNumber ?? status?.account?.phoneNumber}
              onRenameAccount={onRenameAccount}
              onSelectConversation={handleSelectConversation}
              onOpenDirectConversation={handleOpenDirectConversation}
              onOpenGroupConversation={handleOpenGroupConversation}
            />
          </div>
        )}

        {screen === 'chat' && (
          <div className="relative flex min-h-screen min-h-dvh w-full flex-col overflow-hidden">
            <ChatPanel
              activeConversationId={chat.activeConversationId}
              activeConversation={activeConversation}
              activeName={activeName}
              activeAvatar={activeAvatar}
              activeSubtitle={activeSubtitle}
              isGroupConversation={isGroupConversation}
              headerLeading={
                <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs" onClick={() => setScreen('list')}>
                  ← DS
                </Button>
              }
              messages={chat.messages}
              hasMoreHistory={chat.hasMoreHistory}
              loadingOlder={chat.loadingOlder}
              syncingHistory={chat.syncingHistory}
              statusMsg={composer.statusMsg}
              loadError={composer.loadError}
              text={composer.text}
              attachFile={composer.attachFile}
              sending={composer.sending}
              typingUsers={[]}
              detailsOpen={detailsOpen}
              onScroll={onMessagesScroll}
              onTextChange={composer.setText}
              onKeyDown={onKeyDown}
              onSend={onSend}
              onAttachFile={composer.setAttachFile}
              onClearFile={() => { composer.setAttachFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              onToggleDetails={() => setDetailsOpen((open) => !open)}
              onReactMessage={onReactMessage}
              showDisconnectBanner={status ? !status.sessionActive && !status.loginInProgress && !!workspace.selectedAccountId : false}
            />
            {detailsOpen && (
              <div className="absolute inset-0 z-10 bg-black/40" onClick={() => setDetailsOpen(false)} aria-hidden="true" />
            )}
            <ConversationDetailsPanel
              open={detailsOpen}
              conversation={activeConversation}
              contact={activeContact}
              group={activeGroup}
              workspaceAccount={workspaceAccount}
              onClose={() => setDetailsOpen(false)}
            />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export function DashboardPage({ mobileMode, dashboard }: { mobileMode: boolean; dashboard?: DashboardState }) {
  const resolvedDashboard = dashboard ?? require('../../App').useDashboardState();
  return mobileMode ? <MobileDashboardPage dashboard={resolvedDashboard} /> : <DesktopDashboardPage dashboard={resolvedDashboard} />;
}
