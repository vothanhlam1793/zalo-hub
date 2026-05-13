interface LoginScreenProps {
  loginPolling: boolean;
  qrCode: string;
  statusMsg: string;
  onStartLogin: () => void;
}

export function LoginScreen({ loginPolling, qrCode, statusMsg, onStartLogin }: LoginScreenProps) {
  return (
    <div className="login-screen">
      <h1>Zalo Hub</h1>
      <p className="subtitle">Chat direct + group với tài khoản Zalo cá nhân</p>
      <div className="login-card">
        <span className={`status-badge ${loginPolling ? '' : ''}`}>
          {loginPolling ? 'Đang chờ quét QR...' : 'Chưa đăng nhập'}
        </span>
        {qrCode ? (
          <div className="qr-wrapper">
            <img src={`data:image/png;base64,${qrCode}`} alt="QR đăng nhập Zalo" />
          </div>
        ) : (
          <div className="qr-placeholder">QR chưa sẵn sàng</div>
        )}
        <button className="btn btn-primary" onClick={onStartLogin} disabled={loginPolling}>
          {loginPolling ? 'Đang chờ...' : 'Tạo QR đăng nhập'}
        </button>
        {statusMsg && <p style={{ color: '#ff8888', margin: 0, fontSize: 13 }}>{statusMsg}</p>}
      </div>
    </div>
  );
}
