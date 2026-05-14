import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface QrOverlayProps {
  qrCode: string;
  statusMsg: string;
  onCancel: () => void;
}

export function QrOverlay({ qrCode, statusMsg, onCancel }: QrOverlayProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-[360px] bg-[#1a2035] border-white/12">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="secondary">Đang chờ quét QR...</Badge>
          {statusMsg && <p className="text-[#ff6666] text-[13px] m-0">{statusMsg}</p>}
          {qrCode ? (
            <div>
              <img
                src={`data:image/png;base64,${qrCode}`}
                alt="QR đăng nhập Zalo"
                className="w-[200px] h-[200px] rounded-xl bg-white p-2 block"
              />
            </div>
          ) : (
            <div className="w-[200px] h-[200px] rounded-xl bg-white/5 border-2 border-dashed border-white/15 flex items-center justify-center text-[#666] text-sm">
              QR chưa sẵn sàng...
            </div>
          )}
          <Button variant="ghost" onClick={onCancel}>Hủy</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
