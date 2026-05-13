interface QrOverlayProps {
  qrCode: string;
  statusMsg: string;
  onCancel: () => void;
}

export function QrOverlay({ qrCode, statusMsg, onCancel }: QrOverlayProps) {
  return (
    <div className="qr-overlay">
      <div className="qr-overlay-card">
        <span className="status-badge">Đang chờ quét QR...</span>
        {statusMsg && <p style={{ color: '#ff6666', margin: '8px 0', fontSize: 13 }}>{statusMsg}</p>}
        {qrCode ? (
          <div className="qr-wrapper">
            <img src={`data:image/png;base64,${qrCode}`} alt="QR đăng nhập Zalo" />
          </div>
        ) : (
          <div className="qr-placeholder">QR chưa sẵn sàng...</div>
        )}
        <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={onCancel}>Hủy</button>
      </div>
    </div>
  );
}
