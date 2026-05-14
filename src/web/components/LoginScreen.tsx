import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface LoginScreenProps {
  loginPolling: boolean;
  qrCode: string;
  statusMsg: string;
  onStartLogin: () => void;
}

export function LoginScreen({ loginPolling, qrCode, statusMsg, onStartLogin }: LoginScreenProps) {
  return (
    <div className="flex-1 flex items-center justify-center flex-col gap-6 bg-gradient-to-br from-[#0f1117] to-[#1a2035]">
      <h1 className="text-[32px] font-bold text-white m-0">Zalo Hub</h1>
      <p className="text-[#888] text-[15px] m-0">Chat direct + group với tài khoản Zalo cá nhân</p>
      <div className="bg-white/5 border border-white/10 rounded-[20px] p-8 flex flex-col items-center gap-5 min-w-[320px]">
        <Badge variant="secondary">
          {loginPolling ? 'Đang chờ quét QR...' : 'Chưa đăng nhập'}
        </Badge>
        {qrCode ? (
          <div>
            <img
              src={`data:image/png;base64,${qrCode}`}
              alt="QR đăng nhập Zalo"
              className="w-[220px] h-[220px] rounded-xl bg-white p-2 block"
            />
          </div>
        ) : (
          <div className="w-[220px] h-[220px] rounded-xl bg-white/5 border-2 border-dashed border-white/15 flex items-center justify-center text-[#666] text-sm">
            QR chưa sẵn sàng
          </div>
        )}
        <Button onClick={onStartLogin} disabled={loginPolling}>
          {loginPolling ? 'Đang chờ...' : 'Tạo QR đăng nhập'}
        </Button>
        {statusMsg && <p className="text-[#ff8888] m-0 text-[13px]">{statusMsg}</p>}
      </div>
    </div>
  );
}
