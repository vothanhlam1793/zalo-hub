import React from 'react';
import { createRoot } from 'react-dom/client';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import './index.css';
import App from './App';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
