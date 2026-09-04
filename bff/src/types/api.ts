export enum ErrorCode {
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_NOT_AUTHENTICATED = 'AUTH_NOT_AUTHENTICATED',
  AUTH_FORBIDDEN = 'AUTH_FORBIDDEN',
  AUTH_ACCOUNT_NOT_ACTIVE = 'AUTH_ACCOUNT_NOT_ACTIVE',
  VALIDATION_MISSING_FIELD = 'VALIDATION_MISSING_FIELD',
  VALIDATION_INVALID = 'VALIDATION_INVALID',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  SERVER_INTERNAL = 'SERVER_INTERNAL',
  ZALO_SESSION_EXPIRED = 'ZALO_SESSION_EXPIRED',
  REQUEST_TOO_LARGE = 'REQUEST_TOO_LARGE',
}

export interface BffSuccess<T = unknown> {
  ok: true;
  data: T;
  requestId?: string;
}

export interface BffErrorBody {
  ok: false;
  code: ErrorCode;
  message: string;
  detail?: string;
  requestId?: string;
}

export type BffResponse<T = unknown> = BffSuccess<T> | BffErrorBody;

export function success<T>(data: T, requestId?: string): BffSuccess<T> {
  return { ok: true, data, ...(requestId ? { requestId } : {}) };
}

export function error(code: ErrorCode, message: string, detail?: string, requestId?: string): BffErrorBody {
  return { ok: false, code, message, ...(detail ? { detail } : {}), ...(requestId ? { requestId } : {}) };
}

export function mapBackendError(status: number, body: Record<string, unknown>, requestId?: string): BffErrorBody {
  const msg = (body.error as string) || `Backend error ${status}`;
  let code = ErrorCode.SERVER_INTERNAL;

  if (status === 400) code = ErrorCode.VALIDATION_INVALID;
  else if (status === 401) code = ErrorCode.AUTH_NOT_AUTHENTICATED;
  else if (status === 403) code = ErrorCode.AUTH_FORBIDDEN;
  else if (status === 404) code = ErrorCode.VALIDATION_INVALID;
  else if (status === 413) code = ErrorCode.REQUEST_TOO_LARGE;

  if (msg.includes('khong con active') || msg.includes('het han')) {
    code = ErrorCode.ZALO_SESSION_EXPIRED;
  } else if (msg.includes('Token khong hop le') || msg.includes('het han')) {
    code = ErrorCode.AUTH_TOKEN_EXPIRED;
  }

  return error(code, msg, undefined, requestId);
}
