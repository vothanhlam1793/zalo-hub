import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { api } from "../api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

export function CookieLoginDialog({ open, onOpenChange, onSuccess }: Props) {
  const [cookie, setCookie] = useState("");
  const [userAgent, setUserAgent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    const raw = cookie.trim();
    if (!raw) {
      setError("Vui lòng dán chuỗi Cookie Zalo vào ô bên dưới");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.loginCookie(raw, userAgent.trim() || undefined);
      if (res.ok) {
        onSuccess();
        onOpenChange(false);
        setCookie("");
      } else {
        setError("Đăng nhập thất bại. Kiểm tra lại chuỗi Cookie.");
      }
    } catch (err: any) {
      setError(err.message || "Lỗi xác thực Cookie với Zalo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111] border-white/10 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#eee] flex items-center gap-2 text-sm">
            <span>🍪</span> Thêm tài khoản bằng Cookie Zalo Web
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <div className="bg-[#161a22] border border-blue-500/20 rounded p-3 text-xs text-slate-300 space-y-2">
            <div className="font-semibold text-blue-400">
              📖 Cách lấy Cookie Zalo Web trên máy tính (30 giây):
            </div>
            <ol className="list-decimal list-inside space-y-1 text-slate-400">
              <li>Mở trình duyệt vào <strong>chat.zalo.me</strong> và đăng nhập.</li>
              <li>Nhấn <strong>F12</strong> -&gt; chuyển sang tab <strong>Console</strong> -&gt; gõ: <code className="bg-black/50 p-1 text-emerald-400">copy(document.cookie)</code></li>
              <li>Quay lại ô bên dưới và nhấn <strong>Ctrl + V</strong> để dán.</li>
            </ol>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">
              Chuỗi Cookie Zalo:
            </label>
            <textarea
              className="w-full h-24 bg-[#0a0c10] border border-white/10 rounded p-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
              placeholder="zpw_sek=xxx; _zlang=vn; zpsid=yyy; ..."
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
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
              {loading ? "Đang kiểm tra..." : "✅ Đăng nhập Cookie"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
