import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatPanel } from '../src/features/chat/components/ChatPanel';
import { useComposerStore } from '../src/stores/composer-store';
import { chatSession, conversationKey } from '../src/features/chat/model/chat-session';
import { useChatStore } from '../src/stores/chat-store';
import { useComposer } from '../src/hooks/useComposer';
import { clientDb } from '../src/lib/client-db';
import { migrateComposer, freezeBatch, batchActions } from '../src/features/chat/model/composer-types';
import { sendComposerBatch } from '../src/features/chat/model/composer-controller';
import '../src/app.css';
localStorage.setItem('auth_token', 'test'); chatSession.setUser('tester');
const key = conversationKey('tester', 'account', 'direct:contact');
useChatStore.setState({ activeKey: key }); useComposerStore.getState().selectKey(key);
Object.assign(window, { composerTest: { clientDb, migrateComposer, freezeBatch, batchActions, sendComposerBatch, key, store: useComposerStore } });
function Harness() {
  const ref = useRef<HTMLTextAreaElement>(null); const composer = useComposer();
  const status = useComposerStore(s => s.statusMsg);
  return <div style={{ height: '100dvh', display: 'flex' }}><ChatPanel activeConversationId="direct:contact" workspaceAccountId="account" activeName="Composer test" isGroupConversation={false} messages={[]}
    hasMoreHistory={false} loadingOlder={false} syncingHistory={false} statusMsg={status} loadError="" sending={false} typingUsers={[]} detailsOpen={false}
    textareaRef={ref} onScroll={() => {}} onTextChange={text => useComposerStore.getState().setText(text)} onKeyDown={event => composer.handleKeyDown(event, composer.handleSend)}
    onSend={composer.handleSend} onAttachFile={() => {}} onClearFile={() => {}} onToggleDetails={() => {}} onReactMessage={() => {}} /></div>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
