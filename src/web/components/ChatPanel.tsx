import { useRef } from 'react';
import { formatSize, getInitial } from '../utils';
import { MessageBubble } from './MessageBubble';
import type { ConversationSummary, Message } from '../types';

interface ChatPanelProps {
  activeConversationId: string;
  activeConversation?: ConversationSummary;
  activeName: string;
  isGroupConversation: boolean;
  messages: Message[];
  hasMoreHistory: boolean;
  loadingOlder: boolean;
  syncingHistory: boolean;
  statusMsg: string;
  loadError: string;
  text: string;
  attachFile: File | null;
  sending: boolean;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onTextChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: (e: React.FormEvent) => void;
  onAttachFile: (file: File | null) => void;
  onClearFile: () => void;
}

export function ChatPanel({
  activeConversationId,
  activeConversation,
  activeName,
  isGroupConversation,
  messages,
  hasMoreHistory,
  loadingOlder,
  syncingHistory,
  statusMsg,
  loadError,
  text,
  attachFile,
  sending,
  onScroll,
  onTextChange,
  onKeyDown,
  onSend,
  onAttachFile,
  onClearFile,
}: ChatPanelProps) {
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="chat-panel">
      {!activeConversationId ? (
        <div className="empty-hint">Chọn một cuộc trò chuyện để bắt đầu</div>
      ) : (
        <>
          <div className="chat-header">
            <div className="avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
              {getInitial(activeName)}
            </div>
            <div>
              <div className="chat-header-name">{activeName}</div>
              <div className="chat-header-id">{activeConversationId}</div>
            </div>
          </div>

          {(statusMsg || loadError) && (
            <div className={`chat-status-banner ${loadError ? 'is-error' : 'is-success'}`}>
              {loadError || statusMsg}
            </div>
          )}

          <div className="messages-area" ref={messagesAreaRef} onScroll={onScroll}>
            {hasMoreHistory && (
              <div className="history-loader">{loadingOlder || syncingHistory ? 'Đang tải thêm tin cũ...' : 'Kéo lên để tải thêm tin cũ'}</div>
            )}
            {messages.length === 0 && (
              <div className="empty-hint">Chưa có tin nhắn. Hãy gửi tin nhắn đầu tiên!</div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} isGroup={isGroupConversation} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form className="composer" onSubmit={onSend}>
            {attachFile && (
              <div className="attachment-preview">
                <span>📎 {attachFile.name} ({formatSize(attachFile.size)})</span>
                <button type="button" onClick={onClearFile}>✕</button>
              </div>
            )}
            <div className="composer-row">
              <textarea
                className="composer-input"
                placeholder={isGroupConversation ? 'Nhập tin nhắn vào nhóm...' : 'Nhập tin nhắn...'}
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
              />
              <div className="composer-actions">
                <button
                  type="button"
                  className={`attach-btn ${attachFile ? 'has-file' : ''}`}
                  title="Đính kèm ảnh/file"
                  onClick={() => fileInputRef.current?.click()}
                >
                  📎
                </button>
                <button className="send-btn" type="submit" disabled={sending || (!text.trim() && !attachFile)} title="Gửi">
                  ➤
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt,.mp4"
              style={{ display: 'none' }}
              onChange={(e) => onAttachFile(e.target.files?.[0] ?? null)}
            />
          </form>
        </>
      )}
    </div>
  );
}
