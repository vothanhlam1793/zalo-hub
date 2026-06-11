import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { api } from '@/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AccountSummary } from '@/types';

interface DifyBot {
  id: string;
  account_id: string;
  name: string;
  dify_api_key: string;
  dify_webhook_url: string;
  bot_token: string;
  enabled: boolean;
  receive_groups: string[];
  send_groups: string[];
  created_at: string;
  updated_at: string;
}

interface Entity {
  id: string;
  name: string;
  type: 'group' | 'contact' | 'conversation';
}

interface Props {
  setError: (msg: string) => void;
  setStatus: (msg: string) => void;
}

function MultiSelectDropdown({
  entities,
  selectedIds,
  onChange,
  label,
  placeholder,
}: {
  entities: Entity[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label: string;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = entities.filter((e) => {
    const q = search.toLowerCase();
    return e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q);
  });

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'group': return 'N';
      case 'contact': return 'BN';
      default: return 'H';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'group': return 'text-[#22d3ee]';
      case 'contact': return 'text-[#34d399]';
      default: return 'text-[#94a3b8]';
    }
  };

  const selectedEntities = entities.filter((e) => selectedIds.includes(e.id));

  return (
    <div className="space-y-1.5" ref={ref}>
      <Label className="text-[11px]">{label}</Label>
      <Button
        variant="outline"
        size="sm"
        className={cn('w-full justify-start text-xs h-auto min-h-8 font-normal', !selectedIds.length && 'text-muted-foreground')}
        onClick={() => setOpen(!open)}
      >
        {selectedIds.length === 0
          ? placeholder
          : `${selectedIds.length} đã chọn`}
      </Button>

      {/* Selected tags */}
      {selectedEntities.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {selectedEntities.map((e) => (
            <Badge key={e.id} variant="outline" className="text-[10px] gap-1 pr-0.5">
              <span className={getTypeColor(e.type)}>[{getTypeLabel(e.type)}]</span>
              <span className="max-w-[120px] truncate">{e.name}</span>
              <button
                className="ml-0.5 hover:text-[#ff8888]"
                onClick={() => toggle(e.id)}
              >✕</button>
            </Badge>
          ))}
        </div>
      )}

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-[400px] max-h-[300px] overflow-hidden border border-[var(--border)] bg-[#0d1015] rounded-md shadow-lg">
          <div className="p-1.5 border-b border-[var(--border)]">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm..."
              className="text-xs h-7 border-0 focus-visible:ring-0"
              autoFocus
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground p-2">
                {search ? 'Không tìm thấy' : 'Không có dữ liệu. Hãy chọn tài khoản Zalo trước.'}
              </p>
            )}
            {filtered.map((e) => {
              const checked = selectedIds.includes(e.id);
              return (
                <button
                  key={e.id}
                  className={cn(
                    'w-full text-left px-2 py-1.5 flex items-center gap-2 text-xs hover:bg-[#1e293b] cursor-pointer',
                    checked && 'bg-[#1e293b]',
                  )}
                  onClick={() => toggle(e.id)}
                >
                  <span className={cn('w-3.5 h-3.5 rounded border border-[var(--border)] flex items-center justify-center text-[9px]', checked && 'bg-[#fbbf24] border-[#fbbf24] text-black')}>
                    {checked ? '✓' : ''}
                  </span>
                  <span className={cn('font-mono text-[10px] min-w-[36px]', getTypeColor(e.type))}>
                    [{getTypeLabel(e.type)}]
                  </span>
                  <span className="truncate">{e.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto truncate max-w-[100px]">
                    {e.id}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DifyBotsTab({ setError, setStatus }: Props) {
  const [bots, setBots] = useState<DifyBot[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBot, setEditingBot] = useState<DifyBot | null>(null);

  const [formName, setFormName] = useState('');
  const [formAccountId, setFormAccountId] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formWebhookUrl, setFormWebhookUrl] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formReceiveGroups, setFormReceiveGroups] = useState<string[]>([]);
  const [formSendGroups, setFormSendGroups] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [entities, setEntities] = useState<Entity[]>([]);
  const [entitiesLoaded, setEntitiesLoaded] = useState(false);
  const [loadingEntities, setLoadingEntities] = useState(false);

  // Entity name cache for displaying in card list
  const [entityNames, setEntityNames] = useState<Record<string, string>>({});

  const loadBots = async () => {
    try {
      const data = await api.adminBots();
      setBots(data.bots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bots');
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const data = await api.accounts();
      setAccounts(data.accounts);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadBots(); loadAccounts(); }, []);

  const loadEntities = useCallback(async (accountId: string) => {
    if (!accountId) { setEntities([]); setEntitiesLoaded(false); return; }
    setLoadingEntities(true);
    setEntitiesLoaded(false);
    try {
      const data = await api.adminAccountEntities(accountId);
      setEntities(data.entities);
      setEntitiesLoaded(true);
      const nameMap: Record<string, string> = {};
      for (const e of data.entities) {
        if (!nameMap[e.id]) nameMap[e.id] = e.name;
      }
      setEntityNames((prev) => ({ ...prev, ...nameMap }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải danh sách group/contact');
      setEntitiesLoaded(false);
    } finally {
      setLoadingEntities(false);
    }
  }, [setError]);

  const handleAccountChange = (accountId: string) => {
    setFormAccountId(accountId);
    setFormReceiveGroups([]);
    setFormSendGroups([]);
    loadEntities(accountId);
  };

  const resetForm = () => {
    setFormName('');
    setFormAccountId('');
    setFormApiKey('');
    setFormWebhookUrl('');
    setFormEnabled(true);
    setFormReceiveGroups([]);
    setFormSendGroups([]);
    setEditingBot(null);
    setEntities([]);
    setEntitiesLoaded(false);
  };

  const openEdit = (bot: DifyBot) => {
    setEditingBot(bot);
    setFormName(bot.name);
    setFormAccountId(bot.account_id);
    setFormApiKey(bot.dify_api_key);
    setFormWebhookUrl(bot.dify_webhook_url);
    setFormEnabled(bot.enabled);
    setFormReceiveGroups(Array.isArray(bot.receive_groups) ? bot.receive_groups : []);
    setFormSendGroups(Array.isArray(bot.send_groups) ? bot.send_groups : []);
    loadEntities(bot.account_id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim() || !formAccountId || !formWebhookUrl.trim()) {
      setError('Vui lòng điền đầy đủ các trường bắt buộc');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: formName.trim(),
        account_id: formAccountId,
        dify_api_key: formApiKey.trim(),
        dify_webhook_url: formWebhookUrl.trim(),
        enabled: formEnabled,
        receive_groups: formReceiveGroups,
        send_groups: formSendGroups,
      };
      if (editingBot) {
        await api.adminBotUpdate(editingBot.id, payload);
        setStatus('Đã cập nhật bot');
      } else {
        await api.adminBotCreate(payload);
        setStatus('Đã tạo bot mới');
      }
      resetForm();
      setShowForm(false);
      loadBots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi lưu bot');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Xóa bot "${name}"?`)) return;
    try {
      await api.adminBotDelete(id);
      setStatus(`Đã xóa bot "${name}"`);
      loadBots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi xóa bot');
    }
  };

  const handleToggleEnabled = async (bot: DifyBot) => {
    try {
      await api.adminBotUpdate(bot.id, { enabled: !bot.enabled });
      setBots(bots.map((b) => (b.id === bot.id ? { ...b, enabled: !b.enabled } : b)));
      setStatus(`Bot "${bot.name}" đã ${!bot.enabled ? 'bật' : 'tắt'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi chuyển trạng thái');
    }
  };

  const renderGroupTag = (id: string) => {
    const name = entityNames[id];
    return (
      <Badge key={id} variant="outline" className="text-[10px] font-mono">
        {name ? name : id.replace('group:', '')}
      </Badge>
    );
  };

  // Load entity names for all bots on mount
  useEffect(() => {
    const allAccountIds = [...new Set(bots.map((b) => b.account_id))];
    allAccountIds.forEach((accountId) => {
      if (accountId && !entityNames[accountId + '__loaded']) {
        setEntityNames((prev) => ({ ...prev, [accountId + '__loaded']: '1' }));
        api.adminAccountEntities(accountId)
          .then((data) => {
            const nameMap: Record<string, string> = {};
            for (const e of data.entities) {
              if (!nameMap[e.id]) nameMap[e.id] = e.name;
            }
            setEntityNames((prev) => ({ ...prev, ...nameMap }));
          })
          .catch(() => {});
      }
    });
  }, [bots.length]);

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4">Đang tải...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-[#eee]">🤖 Dify Bots</h2>
        <Button
          size="sm"
          onClick={() => { resetForm(); setShowForm(true); }}
          className="text-xs"
        >
          + Tạo Bot
        </Button>
      </div>

      {bots.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground">Chưa có bot nào. Tạo bot đầu tiên để kết nối Dify.</p>
      )}

      <div className="grid grid-cols-1 gap-3">
        {bots.map((bot) => {
          const account = accounts.find((a) => a.accountId === bot.account_id);
          const receiveGroups = Array.isArray(bot.receive_groups) ? bot.receive_groups : [];
          const sendGroups = Array.isArray(bot.send_groups) ? bot.send_groups : [];
          return (
            <Card key={bot.id} className={cn('border border-[var(--border)] bg-[#0d1015]', !bot.enabled && 'opacity-50')}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-sm text-[#eee]">{bot.name}</CardTitle>
                  <p className="text-[11px] text-muted-foreground">
                    {account
                      ? `${account.hubAlias || account.displayName || account.accountId}${account.phoneNumber ? ` — ${account.phoneNumber}` : ''}`
                      : bot.account_id}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={bot.enabled ? 'default' : 'secondary'} className="text-[10px]">
                    {bot.enabled ? 'ON' : 'OFF'}
                  </Badge>
                  <Switch
                    checked={bot.enabled}
                    onCheckedChange={() => handleToggleEnabled(bot)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-1.5 text-[11px] text-muted-foreground">
                  <p>Webhook: <span className="text-[#aaa] font-mono text-[10px]">{bot.dify_webhook_url}</span></p>
                  <p>Token: <code className="text-[#aaa] font-mono text-[10px] select-all">{bot.bot_token}</code>
                    <Button variant="ghost" size="sm" className="text-[10px] h-5 px-1 ml-1"
                      onClick={() => { navigator.clipboard.writeText(bot.bot_token); setStatus('Đã copy token'); }}>
                      📋
                    </Button>
                  </p>

                  {receiveGroups.length > 0 && (
                    <div>
                      <span className="text-[#22d3ee]">Receive:</span>{' '}
                      <div className="inline-flex flex-wrap gap-1 ml-1 align-middle">
                        {receiveGroups.map(renderGroupTag)}
                      </div>
                    </div>
                  )}
                  {sendGroups.length > 0 && (
                    <div>
                      <span className="text-[#22d3ee]">Send:</span>{' '}
                      <div className="inline-flex flex-wrap gap-1 ml-1 align-middle">
                        {sendGroups.map(renderGroupTag)}
                      </div>
                    </div>
                  )}
                  {receiveGroups.length === 0 && sendGroups.length === 0 && (
                    <p>Whitelist: <span className="text-muted-foreground text-[10px]">(tất cả group)</span></p>
                  )}
                  <p>Cập nhật: {new Date(bot.updated_at).toLocaleString('vi-VN')}</p>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => openEdit(bot)}>
                    Sửa
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 text-[#ff8888] hover:text-[#ff6666]"
                    onClick={() => handleDelete(bot.id, bot.name)}
                  >
                    Xóa
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Form Modal */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { resetForm(); setShowForm(false); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto border-[var(--border)] bg-[#0d1015]">
          <DialogHeader>
            <DialogTitle className="text-sm text-[#eee]">
              {editingBot ? `Sửa bot: ${editingBot.name}` : 'Tạo Bot Dify mới'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[11px]">Tên bot *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="vd: CSKH Bot"
                className="text-xs h-8"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Tài khoản Zalo *</Label>
              <Select value={formAccountId} onValueChange={handleAccountChange}>
                <SelectTrigger className="text-xs h-8">
                  <SelectValue placeholder="Chọn tài khoản..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.accountId} value={acc.accountId} className="text-xs">
                      {acc.hubAlias || acc.displayName || acc.accountId}{acc.phoneNumber ? ` — ${acc.phoneNumber}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Dify API Key (tùy chọn — chỉ cần khi dùng API /v1/workflows/run)</Label>
              <Input
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                placeholder="app-xxxxx"
                type="password"
                className="text-xs h-8 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Dify Webhook URL *</Label>
              <Input
                value={formWebhookUrl}
                onChange={(e) => setFormWebhookUrl(e.target.value)}
                placeholder="https://dify.example.com/v1/webhook/..."
                className="text-xs h-8 font-mono"
              />
            </div>

            {/* Group Whitelist */}
            <div className="space-y-1.5 md:col-span-2 border-t border-[var(--border)] pt-4 mt-2">
              <Label className="text-[12px] text-[#fbbf24]">Conversation Whitelist</Label>
              {!formAccountId && (
                <p className="text-[10px] text-muted-foreground">Chọn tài khoản Zalo trước để tải danh sách group/contact.</p>
              )}
              {loadingEntities && (
                <p className="text-[10px] text-muted-foreground">Đang tải danh sách...</p>
              )}
            </div>

            {entitiesLoaded && (
              <>
                <div className="relative">
                  <MultiSelectDropdown
                    entities={entities}
                    selectedIds={formReceiveGroups}
                    onChange={setFormReceiveGroups}
                    label="Receive Groups (chỉ nhận webhook từ các group này)"
                    placeholder="Để trống = tất cả group"
                  />
                </div>
                <div className="relative">
                  <MultiSelectDropdown
                    entities={entities}
                    selectedIds={formSendGroups}
                    onChange={setFormSendGroups}
                    label="Send Groups (chỉ gửi reply vào các group này)"
                    placeholder="Để trống = tất cả group"
                  />
                </div>
              </>
            )}

            <div className="flex items-center gap-3 pt-6">
              <Switch checked={formEnabled} onCheckedChange={setFormEnabled} />
              <Label className="text-[11px]">{formEnabled ? 'Đang bật' : 'Đã tắt'}</Label>
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <Button size="sm" onClick={handleSubmit} disabled={saving} className="text-xs">
              {saving ? 'Đang lưu...' : editingBot ? 'Cập nhật' : 'Tạo Bot'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { resetForm(); setShowForm(false); }} className="text-xs">
              Hủy
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
