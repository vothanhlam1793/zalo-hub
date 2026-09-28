import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { bff } from '@/bff-api';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

export function CookieLoginDialog({ open, onOpenChange, onSuccess }: Props) {
  const [cookie, setCookie] = useState('');
  const [userAgent, setUserAgent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const oneClickScript = `javascript:(function(){const c=document.cookie;if(!c){alert('Không tìm thấy cookie Zalo! Hãy chắc chắn bạn đang mở chat.zalo.me');return;}navigator.clipboard.writeText(c).then(()=>{alert('✅ Đã copy Cookie Zalo vào Clipboard! Hãy quay lại ZaloHub dán vào ô nhập.');}).catch(()=>{prompt('Copy chuỗi cookie bên dưới:',c);});})();`;

  const copyScriptToClipboard = () => {
    navigator.clipboard.writeText(oneClickScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleLogin = async () => {
    const raw = cookie.trim();
    if (!raw) {
      setError('Vui lòng dán chuỗi Cookie Zalo vào ô bên dưới');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await bff.loginCookie(raw, userAgent.trim() || undefined);
      if (res.ok) {
        onSuccess();
        onOpenChange(false);
        setCookie('');
      } else {
        setError('Đăng nhập thất bại. Kiểm tra lại chuỗi Cookie.');
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi xác thực Cookie với Zalo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111] border-[var(--border)] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#eee] flex items-center gap-2 text-base">
            <span>🍪</span> Thêm tài khoản bằng Cookie Zalo Web
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Bỏ qua quét mã QR trên server — Đăng nhập bằng Cookie Zalo Web từ máy tính cá nhân để tránh bị Zalo chặn 100%.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* HƯỚNG DẪN LẤY COOKIE */}
          <div className="bg-[#161a22] border border-blue-500/20 rounded-lg p-3.5 text-xs text-slate-300 space-y-2.5">
            <div className="font-semibold text-blue-400 flex items-center justify-between">
              <span>📖 Cách lấy Cookie Zalo Web (Rất dễ - 30 giây):</span>
            </div>
            
            <ol className="list-decimal list-inside space-y-1.5 text-slate-400 leading-relaxed">
              <li>
                Mở trình duyệt trên máy tính vào{' '}
                <a href="https://chat.zalo.me" target="_blank" rel="noreferrer" className="text-blue-400 underline hover:text-blue-300">
                  chat.zalo.me
                </a>{' '}
                và đăng nhập tài khoản Zalo của bạn.
              </li>
              <li>
                <strong>Cách 1 (Nhanh nhất):</strong> Nhấn phím <strong>F12</strong> (hoặc chuột phải chọn <em>Inspect / Kiểm tra</em>) -&gt; chuyển sang tab <strong>Console</strong> -&gt; gõ lệnh:
                <div className="mt-1 bg-black/50 p-1.5 rounded font-mono text-emerald-400 select-all">
                  copy(document.cookie)
                </div>
                <em>(Lệnh này sẽ tự động copy toàn bộ cookie vào bộ nhớ đệm).</em>
              </li>
              <li>
                <strong>Cách 2 (Bookmarklet 1 click):</strong> Copy đoạn mã bên dưới và dán vào thanh URL của tab Zalo rồi nhấn Enter:
                <div className="mt-1 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-dashed text-blue-400 hover:text-blue-300"
                    onClick={copyScriptToClipboard}
                  >
                    {copied ? '✅ Đã copy mã Script!' : '📋 Copy mã 1-Click Script'}
                  </Button>
                </div>
              </li>
              <li>Quay lại ô bên dưới và nhấn <strong>Ctrl + V</strong> để dán chuỗi Cookie.</li>
            </ol>
          </div>

          {/* Ô NHẬP COOKIE */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">
              Chuỗi Cookie Zalo <span className="text-red-400">*</span>:
            </label>
            <textarea
              className="w-full h-28 bg-[#0a0c10] border border-[var(--border)] rounded-md p-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500 transition"
              placeholder="Dán cookie vào đây (ví dụ: zpw_sek=xxx; _zlang=vn; zpsid=yyy; ...)"
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="p-2.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              ⚠️ {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Hủy
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-blue-600 hover:bg-blue-500 text-white"
              onClick={handleLogin}
              disabled={loading || !cookie.trim()}
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang xác thực Cookie...
                </span>
              ) : (
                '✅ Xác nhận & Đăng nhập'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
