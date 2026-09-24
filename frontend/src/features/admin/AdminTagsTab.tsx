import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { bff } from '@/bff-api';
import type { AccountSummary, TagItem } from '@/types';

interface AdminTagsTabProps {
  accounts: AccountSummary[];
  setError: (err: string) => void;
  setStatus: (msg: string) => void;
}

const TAG_COLOR_PALETTE = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#10b981', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#64748b', // Slate
];

export function AdminTagsTab({ accounts, setError, setStatus }: AdminTagsTabProps) {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [color, setColor] = useState(TAG_COLOR_PALETTE[5]);
  const [tagScope, setTagScope] = useState<'system' | 'account'>('system');

  const loadTags = async () => {
    setLoading(true);
    try {
      const res = await bff.tagsList(selectedAccountId || undefined);
      setTags(res.tags);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách nhãn');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
  }, [selectedAccountId]);

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const payload = {
        name: name.trim(),
        color,
        emoji: emoji.trim() || undefined,
        source: 'system' as const,
        accountId: tagScope === 'account' ? selectedAccountId : undefined,
      };

      const res = await bff.tagCreate(payload);
      setStatus(`Đã tạo nhãn "${res.tag.name}" thành công!`);
      setName('');
      setEmoji('');
      loadTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo nhãn thất bại');
    }
  };

  const handleDeleteTag = async (tag: TagItem) => {
    const confirmMsg = tag.usageCount && tag.usageCount > 0
      ? `Nhãn "${tag.name}" đang được gắn trên ${tag.usageCount} hội thoại. Bạn có chắc muốn xóa vĩnh viễn?`
      : `Bạn có chắc muốn xóa nhãn "${tag.name}"?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await bff.tagDelete(tag.id);
      setStatus(`Đã xóa nhãn "${tag.name}".`);
      loadTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xóa nhãn thất bại');
    }
  };

  const handleSyncZaloLabels = async () => {
    if (!selectedAccountId) {
      setError('Vui lòng chọn một tài khoản Zalo để đồng bộ');
      return;
    }

    setSyncing(true);
    try {
      setStatus('Đang đồng bộ nhãn từ máy chủ Zalo...');
      const res = await bff.tagsSync(selectedAccountId);
      setStatus(`Đồng bộ thành công ${res.count} nhãn từ Zalo!`);
      loadTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đồng bộ nhãn từ Zalo thất bại');
    } finally {
      setSyncing(false);
    }
  };

  // Group tags
  const systemTags = tags.filter((t) => t.source === 'system' && !t.accountId);
  const accountSystemTags = tags.filter((t) => t.source === 'system' && t.accountId);
  const zaloTags = tags.filter((t) => t.source === 'zalo');

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white/4 border border-white/10">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>🏷️ Quản lý Nhãn Khách hàng</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quản lý nhãn dùng chung toàn hệ thống (CRM) và nhãn riêng biệt theo từng tài khoản Zalo.
          </p>
        </div>

        {/* Account Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground whitespace-nowrap">Xem theo tài khoản:</label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="text-xs bg-[#161a23] border border-white/10 rounded-lg px-3 py-1.5 text-[#eef2ff] focus:outline-none focus:border-blue-500"
          >
            <option value="">🌐 Tất cả tài khoản & Toàn hệ thống</option>
            {accounts.map((acc) => (
              <option key={acc.accountId} value={acc.accountId}>
                📱 {acc.hubAlias || acc.displayName || acc.phoneNumber || acc.accountId}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Grid: Create Form + Tags Data */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Create Tag Form */}
        <div className="p-4 rounded-xl bg-white/4 border border-white/10 space-y-4">
          <h3 className="text-sm font-semibold text-white/90">➕ Tạo nhãn mới</h3>
          <form onSubmit={handleCreateTag} className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Tên nhãn (*):</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Cần báo giá, Khách VIP, Đã cọc..."
                required
                className="w-full text-xs bg-black/40 border border-white/10 rounded-lg p-2.5 text-[#f1f5f9] focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Emoji (tùy chọn):</label>
                <input
                  type="text"
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                  placeholder="VD: 🔥, 💰, 📦..."
                  className="w-full text-xs bg-black/40 border border-white/10 rounded-lg p-2 text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Phạm vi áp dụng:</label>
                <select
                  value={tagScope}
                  onChange={(e) => setTagScope(e.target.value as any)}
                  className="w-full text-xs bg-black/40 border border-white/10 rounded-lg p-2 text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                >
                  <option value="system">🌐 Toàn hệ thống</option>
                  <option value="account" disabled={!selectedAccountId}>
                    {selectedAccountId ? '📱 Tài khoản đang chọn' : '📱 Tài khoản (chọn tài khoản trước)'}
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Màu đại diện:</label>
              <div className="flex items-center gap-2 flex-wrap">
                {TAG_COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'ring-2 ring-white scale-110' : 'opacity-80 hover:opacity-100'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" className="w-full text-xs h-8 bg-blue-600 hover:bg-blue-500 text-white font-medium">
                Tạo nhãn
              </Button>
            </div>
          </form>
        </div>

        {/* Right Column: Tags Listing */}
        <div className="lg:col-span-2 space-y-5">
          {/* Section 1: System / CRM Tags */}
          <div className="p-4 rounded-xl bg-white/4 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">🌐 Nhãn Hệ Thống ZaloHub (CRM)</span>
                <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-300 border-blue-500/20">
                  {systemTags.length} nhãn
                </Badge>
              </div>
              <span className="text-[11px] text-muted-foreground">Dùng chung cho tất cả tài khoản</span>
            </div>

            {systemTags.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-3">Chưa có nhãn hệ thống nào.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {systemTags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-black/30 border border-white/5 hover:border-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: tag.color }} />
                      <span className="text-xs font-medium text-[#f1f5f9] truncate">
                        {tag.emoji ? `${tag.emoji} ` : ''}{tag.name}
                      </span>
                      {typeof tag.usageCount === 'number' && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-muted-foreground shrink-0" title="Số hội thoại đang gắn">
                          {tag.usageCount}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteTag(tag)}
                      className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded hover:bg-red-500/10 transition-colors"
                      title="Xóa nhãn"
                    >
                      Xóa
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Zalo Isolated Tags */}
          <div className="p-4 rounded-xl bg-white/4 border border-white/10 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">📱 Nhãn Gốc Đồng Bộ Từ Zalo</span>
                <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                  {zaloTags.length} nhãn
                </Badge>
              </div>

              {selectedAccountId && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleSyncZaloLabels}
                  disabled={syncing}
                  className="h-7 text-xs border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                >
                  {syncing ? 'Đang đồng bộ...' : '🔄 Đồng bộ từ Zalo'}
                </Button>
              )}
            </div>

            {!selectedAccountId ? (
              <div className="text-xs text-muted-foreground py-3 bg-black/20 rounded-lg p-3 border border-dashed border-white/10">
                💡 Hãy chọn một tài khoản Zalo cụ thể ở menu trên để xem và đồng bộ các nhãn riêng của tài khoản đó.
              </div>
            ) : zaloTags.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-3">
                Tài khoản này chưa có nhãn nào được đồng bộ từ Zalo. Hãy bấm <b>"Đồng bộ từ Zalo"</b> để tải về.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {zaloTags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-black/30 border border-white/5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: tag.color }} />
                      <span className="text-xs font-medium text-[#f1f5f9] truncate">
                        {tag.emoji ? `${tag.emoji} ` : ''}{tag.name}
                      </span>
                      <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1 rounded">Zalo</span>
                    </div>
                    {typeof tag.usageCount === 'number' && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-muted-foreground shrink-0" title="Số hội thoại đang gắn">
                        {tag.usageCount} khách
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
