import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatPanel } from '../src/features/chat/components/ChatPanel';
import type { Message } from '../src/types';
import '../src/app.css';
import { useComposerStore } from '../src/stores/composer-store';
useComposerStore.setState({ activeKey: 'album-browser' });

function photo(i: number): Message {
  return { id: `photo-${i}`, providerMessageId: `provider-${i}`, conversationId: 'c', threadId: 'c', conversationType: 'group',
    kind: 'image', text: `Caption ${i}`, attachments: [{ id: 'a', type: 'image', url: `/media/${i}.svg` }],
    direction: 'incoming', isSelf: false, senderId: 'sender', senderName: 'An', timestamp: '2026-09-27T10:00:00Z',
    presentation: { version: 1, albumId: 'album', albumIndex: i, albumTotal: 7 } };
}
function Harness() {
  const scenario = new URLSearchParams(location.search).get('scenario');
  const history = Array.from({ length: 20 }, (_, i) => ({ ...photo(i), id: `text-${i}`, kind: 'text' as const, text: `History ${i}`, attachments: [], presentation: undefined }));
  const [messages, setMessages] = useState<Message[]>(scenario === 'short' ? [photo(1), photo(0)] : scenario === 'inner' ? [...history, photo(1), photo(0), ...history.map(m => ({ ...m, id: `after-${m.id}` }))] : scenario === 'same-url' ? [photo(1), { ...photo(0), attachments: photo(1).attachments }] : [...history, ...[4, 3, 2, 1, 0].map(photo)]);
  const [loads, setLoads] = useState(0);
  const [reaction, setReaction] = useState('');
  return <div style={{ width: '100%', minWidth: 0 }}><div className="h-12"><button id="older" onClick={() => setMessages(old => [...old.slice(0, 20), ...(scenario === 'inner' ? [photo(2)] : [photo(6), photo(5)]), ...old.slice(20)])}>Older page</button><button id="realtime" onClick={() => setMessages(old => [...old, photo(7)])}>Realtime</button><output id="reaction">{reaction}</output><output id="loads">{loads}</output></div>
    <div style={{ height: 'calc(100dvh - 48px)', display: 'flex' }}><ChatPanel activeConversationId="c" workspaceAccountId="account" activeName="Album test" isGroupConversation messages={messages}
      hasMoreHistory loadingOlder={false} syncingHistory={false} statusMsg="" loadError="" sending={false} typingUsers={[]} detailsOpen={false}
      onScroll={() => {}} onTextChange={() => {}} onKeyDown={() => {}} onSend={e => e.preventDefault()} onAttachFile={() => {}} onClearFile={() => {}} onToggleDetails={() => {}}
      onLoadOlder={async () => { setLoads(n => n + 1); await new Promise(resolve => setTimeout(resolve, 300)); }}
      onReactMessage={message => setReaction(message.id)} /></div></div>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
