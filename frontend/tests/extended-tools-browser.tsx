import React from 'react';
import { createRoot } from 'react-dom/client';
import { ComposerExtendedTools } from '../src/features/chat/components/ComposerExtendedTools';
import { chatSession } from '../src/features/chat/model/chat-session';
import '../src/app.css';
localStorage.setItem('auth_token', 'test'); chatSession.setUser('user', 'test');
createRoot(document.getElementById('root')!).render(<ComposerExtendedTools scope={JSON.stringify(['user', 'account', 'group:1'])} messages={[]} addFiles={() => {}} />);
