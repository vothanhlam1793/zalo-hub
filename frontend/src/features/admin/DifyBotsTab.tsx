import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { api } from '@/api';
import type { AccountSummary } from '@/types';

interface DifyBot {
  id: string;
  account_id: string;
  name: string;
  dify_api_key: string;
  dify_webhook_url: string;
  enabled: boolean;
  filter_mode: 'all' | 'keywords' | 'mention';
  filter_keywords: string[];
  created_at: string;
  updated_at: string;
}

interface Props {
  setError: (msg: string) => void;
  setStatus: (msg: string) => void;
}

export default function DifyBotsTab({ setError, setStatus }: Props) {
  const [bots, setBots] = useState<DifyBot[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBot, setEditingBot] = useState<DifyBot | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formAccountId, setFormAccountId] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formWebhookUrl, setFormWebhookUrl] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formFilterMode, setFormFilterMode] = useState<'all' | 'keywords' | 'mention'>('all');
  const [formKeywords, setFormKeywords] = useState('');
  const [saving, setSaving] = useState(false);

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

  const resetForm = () => {
    setFormName('');
    setFormAccountId('');
    setFormApiKey('');
    setFormWebhookUrl('');
    setFormEnabled(true);
    setFormFilterMode('all');
    setFormKeywords('');
    setEditingBot(null);
  };

  const openEdit = (bot: DifyBot) => {
    setEditingBot(bot);
    setFormName(bot.name);
    setFormAccountId(bot.account_id);
    setFormApiKey(bot.dify_api_key);
    setFormWebhookUrl(bot.dify_webhook_url);
    setFormEnabled(bot.enabled);
    setFormFilterMode(bot.filter_mode);
    setFormKeywords((bot.filter_keywords ?? []).join(', '));
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim() || !formAccountId || !formApiKey.trim() || !formWebhookUrl.trim()) {
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
        filter_mode: formFilterMode,
        filter_keywords: formKeywords.split(',').map((k) => k.trim()).filter(Boolean),
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

      {/* List */}
      {bots.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground">Chưa có bot nào. Tạo bot đầu tiên để kết nối Dify.</p>
      )}

      <div className="grid grid-cols-1 gap-3">
        {bots.map((bot) => {
          const account = accounts.find((a) => a.accountId === bot.account_id);
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
                  <p>Filter: <Badge variant="outline" className="text-[10px]">{bot.filter_mode}</Badge>
                    {bot.filter_keywords && bot.filter_keywords.length > 0 && (
                      <span className="ml-1">— {bot.filter_keywords.join(', ')}</span>
                    )}
                  </p>
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

      {/* Form */}
      {showForm && (
        <Card className="mt-4 border border-[var(--border)] bg-[#0d1015]">
          <CardHeader>
            <CardTitle className="text-sm text-[#eee]">
              {editingBot ? `Sửa bot: ${editingBot.name}` : 'Tạo Bot Dify mới'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <div className="space-y-1.5">
                <Label className="text-[11px]">Tên bot *</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="vd: CSKH Bot"
                  className="text-xs h-8"
                />
              </div>

              {/* Account */}
              <div className="space-y-1.5">
                <Label className="text-[11px]">Tài khoản Zalo *</Label>
                <Select value={formAccountId} onValueChange={setFormAccountId}>
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

              {/* API Key */}
              <div className="space-y-1.5">
                <Label className="text-[11px]">Dify API Key *</Label>
                <Input
                  value={formApiKey}
                  onChange={(e) => setFormApiKey(e.target.value)}
                  placeholder="app-xxxxx"
                  type="password"
                  className="text-xs h-8 font-mono"
                />
              </div>

              {/* Webhook URL */}
              <div className="space-y-1.5">
                <Label className="text-[11px]">Dify Webhook URL *</Label>
                <Input
                  value={formWebhookUrl}
                  onChange={(e) => setFormWebhookUrl(e.target.value)}
                  placeholder="https://dify.example.com/v1/webhook/..."
                  className="text-xs h-8 font-mono"
                />
              </div>

              {/* Filter Mode */}
              <div className="space-y-1.5">
                <Label className="text-[11px]">Chế độ lọc</Label>
                <Select value={formFilterMode} onValueChange={(v: 'all' | 'keywords' | 'mention') => setFormFilterMode(v)}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Tất cả tin nhắn</SelectItem>
                    <SelectItem value="keywords" className="text-xs">Theo từ khóa</SelectItem>
                    <SelectItem value="mention" className="text-xs">Khi được @mention</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Keywords */}
              {formFilterMode === 'keywords' && (
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Từ khóa (phân cách bằng dấu phẩy)</Label>
                  <Textarea
                    value={formKeywords}
                    onChange={(e) => setFormKeywords(e.target.value)}
                    placeholder="giá, báo giá, hỗ trợ"
                    className="text-xs min-h-[60px]"
                  />
                </div>
              )}

              {/* Enabled */}
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
