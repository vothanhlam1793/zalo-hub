import { useState, useEffect, useMemo } from 'react';
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

type ViewMode = 'all' | 'system' | 'zalo';

export function AdminTagsTab({ accounts, setError, setStatus }: AdminTagsTabProps) {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Form create state
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [color, setColor] = useState(TAG_COLOR_PALETTE[5]);
  const [tagScope, setTagScope] = useState<'system' | 'account'>('system');
  const [showCreateModal, setShowCreateModal] = useState(false);

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
      setShowCreateModal(false);
      loadTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo nhãn thất bại');
    }
  };

  const handleDeleteTag = async (tag: TagItem) => {
    const confirmMsg = tag.usageCount && tag.usageCount > 0
      ? `Nhãn "${tag.name}" đang được gắn trên ${tag.usageCount} hội thoại. Bạn có chắc muốn xóa?`
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

  // Filter tags based on tab & search query
  const filteredTags = useMemo(() => {
    return tags.filter((t) => {
      // Filter by mode
      if (viewMode === 'system' && t.source !== 'system') return false;
      if (viewMode === 'zalo' && t.source !== 'zalo') return false;

      // Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return t.name.toLowerCase().includes(q) || (t.emoji && t.emoji.includes(q));
      }
      return true;
    });
  }, [tags, viewMode, searchQuery]);

  const counts = useMemo(() => {
    const sys = tags.filter((t) => t.source === 'system').length;
    const zalo = tags.filter((t) => t.source === 'zalo').length;
    return { all: tags.length, sys, zalo };
  }, [tags]);

  const getAccountLabel = (accId?: string) => {
    if (!accId) return 'Dùng chung (Toàn hệ thống)';
    const acc = accounts.find((a) => a.accountId === accId);
    return acc ? (acc.hubAlias || acc.displayName || acc.phoneNumber || accId) : accId;
  };

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-blue-900/20 via-slate-900/40 to-slate-900/60 border border-blue-500/20 backdrop-blur-md">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🏷️ Quản lý Nhãn Khách hàng</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Bảng điều khiển tập trung nhãn CRM toàn hệ thống và nhãn gốc đồng bộ từ từng tài khoản Zalo.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {selectedAccountId && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleSyncZaloLabels}
              disabled={syncing}
              className="h-8 text-xs border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20"
            >
              {syncing ? 'Đang đồng bộ...' : '🔄 Đồng bộ từ Zalo'}
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md shadow-blue-600/30"
          >
            ➕ Tạo nhãn mới
          </Button>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#12151e] border border-white/10">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-black/40 border border-white/5 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-white'
            }`}
          >
            Tất cả ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('system')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
              viewMode === 'system' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-white'
            }`}
          >
            <span>🌐 Hệ thống CRM ({counts.sys})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('zalo')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
              viewMode === 'zalo' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-white'
            }`}
          >
            <span>📱 Zalo Labels ({counts.zalo})</span>
          </button>
        </div>

        {/* Search & Account Filter */}
        <div className="flex items-center gap-2.5 flex-1 max-w-xl">
          {/* Search Box */}
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Tìm kiếm theo tên nhãn..."
              className="w-full text-xs bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[#f1f5f9] focus:outline-none focus:border-blue-500 placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Account Dropdown */}
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="text-xs bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[#eef2ff] focus:outline-none focus:border-blue-500 max-w-[220px] truncate"
            title="Lọc theo tài khoản Zalo"
          >
            <option value="">📱 Tất cả tài khoản Zalo</option>
            {accounts.map((acc) => (
              <option key={acc.accountId} value={acc.accountId}>
                {acc.hubAlias || acc.displayName || acc.phoneNumber || acc.accountId}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table Listing */}
      <div className="rounded-xl border border-white/10 bg-[#0d1017] overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/5 border-b border-white/10 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Nhãn (Tag Badge)</th>
                <th className="py-3 px-4">Phạm vi / Nguồn</th>
                <th className="py-3 px-4">Tài khoản áp dụng</th>
                <th className="py-3 px-4 text-center">Khách hàng gắn</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    Đang tải danh sách nhãn...
                  </td>
                </tr>
              ) : filteredTags.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-2xl">🏷️</span>
                      <span>Không tìm thấy nhãn nào phù hợp.</span>
                      {viewMode === 'zalo' && selectedAccountId && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={handleSyncZaloLabels}
                          className="mt-2 text-xs"
                        >
                          🔄 Bấm để đồng bộ nhãn từ Zalo về
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTags.map((tag) => (
                  <tr key={tag.id} className="hover:bg-white/[0.03] transition-colors group">
                    {/* Tag Badge & Name */}
                    <td className="py-3.5 px-4 font-medium text-white">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-white shadow-xs border border-white/15"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.emoji && <span>{tag.emoji}</span>}
                          <span>{tag.name}</span>
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground/60 select-all">
                          {tag.color}
                        </span>
                      </div>
                    </td>

                    {/* Source */}
                    <td className="py-3.5 px-4">
                      {tag.source === 'zalo' ? (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-medium">
                          📱 Gốc từ Zalo
                        </Badge>
                      ) : tag.source === 'ai' ? (
                        <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/30 font-medium">
                          🤖 AI Auto
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30 font-medium">
                          🌐 Hệ thống CRM
                        </Badge>
                      )}
                    </td>

                    {/* Account Scoping */}
                    <td className="py-3.5 px-4 text-muted-foreground">
                      <span className="text-xs truncate max-w-[200px] block" title={getAccountLabel(tag.accountId)}>
                        {tag.accountId ? `📱 ${getAccountLabel(tag.accountId)}` : '🌐 Dùng chung toàn bộ'}
                      </span>
                    </td>

                    {/* Customer Usage Count */}
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          (tag.usageCount || 0) > 0
                            ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                            : 'bg-white/5 text-muted-foreground'
                        }`}
                      >
                        {tag.usageCount || 0} hội thoại
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      {tag.source !== 'zalo' ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteTag(tag)}
                          className="px-2.5 py-1 rounded text-xs text-red-400 hover:text-red-300 hover:bg-red-500/15 transition-colors font-medium"
                          title="Xóa nhãn này"
                        >
                          Xóa
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic pr-2">Chỉ đọc</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog: Tạo nhãn mới */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-[#121620] border border-white/15 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>➕ Tạo Nhãn Mới</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-muted-foreground hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTag} className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5 font-medium">Tên nhãn (*):</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: Cần báo giá, Khách VIP, Đã cọc..."
                  required
                  autoFocus
                  className="w-full text-xs bg-black/50 border border-white/15 rounded-lg p-2.5 text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5 font-medium">Biểu tượng (Emoji):</label>
                  <input
                    type="text"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    placeholder="VD: 🔥, 💰, 📦..."
                    className="w-full text-xs bg-black/50 border border-white/15 rounded-lg p-2.5 text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5 font-medium">Phạm vi áp dụng:</label>
                  <select
                    value={tagScope}
                    onChange={(e) => setTagScope(e.target.value as any)}
                    className="w-full text-xs bg-black/50 border border-white/15 rounded-lg p-2.5 text-[#f1f5f9] focus:outline-none focus:border-blue-500"
                  >
                    <option value="system">🌐 Toàn hệ thống</option>
                    <option value="account" disabled={!selectedAccountId}>
                      {selectedAccountId ? '📱 Tài khoản đang chọn' : '📱 Tài khoản (chọn tài khoản trước)'}
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-2 font-medium">Chọn màu đại diện:</label>
                <div className="flex items-center gap-2.5 flex-wrap p-2.5 rounded-xl bg-black/30 border border-white/5">
                  {TAG_COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full transition-all ${
                        color === c ? 'ring-2 ring-white scale-110 shadow-lg' : 'opacity-70 hover:opacity-100 hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Live Preview */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Xem trước hiển thị:</span>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold text-white shadow-sm"
                  style={{ backgroundColor: color }}
                >
                  {emoji && <span>{emoji}</span>}
                  <span>{name.trim() || 'Tên nhãn'}</span>
                </span>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                  className="text-xs h-8"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="text-xs h-8 bg-blue-600 hover:bg-blue-500 text-white font-semibold"
                >
                  Xác nhận tạo
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
