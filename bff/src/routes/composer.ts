import { Router } from 'express';
import multer from 'multer';
import { cookieAuth } from '../middleware/auth.js';
import { backend } from '../proxy/http-client.js';
import { success, mapBackendError, ErrorCode, error } from '../types/api.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/send', cookieAuth, upload.single('file'), async (req, res) => {
  const { accountId, conversationId, text, type, caption, stickerId, catId } = req.body as {
    accountId?: string; conversationId?: string; text?: string;
    type?: string; caption?: string; stickerId?: string; catId?: string;
  };

  if (!accountId || !conversationId) {
    res.status(400).json(error(ErrorCode.VALIDATION_MISSING_FIELD, 'Thieu accountId hoac conversationId'));
    return;
  }

  const encodedAid = encodeURIComponent(accountId);
  const encodedCid = encodeURIComponent(conversationId);

  let result: { ok: boolean; status: number; body: Record<string, unknown> };

  if (type === 'sticker' && stickerId && catId) {
    result = await backend.post(
      `/api/accounts/${encodedAid}/conversations/${encodedCid}/sticker`,
      { stickerId, catId },
      req.token,
    );
  } else if (req.file) {
    const fd = new FormData();
    fd.append('conversationId', conversationId);
    fd.append('file', new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype }), req.file.originalname);
    if (caption) fd.append('caption', caption);
    result = await backend.upload(`/api/accounts/${encodedAid}/send-attachment`, fd, req.token);
  } else if (text) {
    result = await backend.post(`/api/accounts/${encodedAid}/send`, { conversationId, text }, req.token);
  } else {
    res.status(400).json(error(ErrorCode.VALIDATION_MISSING_FIELD, 'Vui long nhap tin nhan hoac chon file'));
    return;
  }

  if (!result.ok) {
    res.status(result.status).json(mapBackendError(result.status, result.body, req.requestId));
    return;
  }

  res.json(success(result.body, req.requestId));
});

router.post('/typing', cookieAuth, async (req, res) => {
  const { accountId, conversationId, isTyping } = req.body as {
    accountId?: string; conversationId?: string; isTyping?: boolean;
  };
  if (!accountId || !conversationId) {
    res.status(400).json(error(ErrorCode.VALIDATION_MISSING_FIELD, 'Thieu accountId hoac conversationId'));
    return;
  }

  const result = await backend.post(
    `/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/typing`,
    { isTyping: !!isTyping },
    req.token,
  );

  if (!result.ok) {
    res.status(result.status).json(mapBackendError(result.status, result.body, req.requestId));
    return;
  }
  res.json(success(result.body, req.requestId));
});

router.post('/reaction', cookieAuth, async (req, res) => {
  const { accountId, conversationId, messageId, cliMsgId, icon } = req.body as {
    accountId?: string; conversationId?: string; messageId?: string;
    cliMsgId?: string; icon?: string;
  };
  if (!accountId || !conversationId || !messageId || !icon) {
    res.status(400).json(error(ErrorCode.VALIDATION_MISSING_FIELD, 'Thieu thong tin reaction'));
    return;
  }

  const result = await backend.post(
    `/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/reaction`,
    { messageId, cliMsgId: cliMsgId || messageId, icon },
    req.token,
  );

  if (!result.ok) {
    res.status(result.status).json(mapBackendError(result.status, result.body, req.requestId));
    return;
  }
  res.json(success(result.body, req.requestId));
});

router.post('/read-state', cookieAuth, async (req, res) => {
  const { accountId, conversationId, readAt } = req.body as {
    accountId?: string; conversationId?: string; readAt?: string;
  };
  if (!accountId || !conversationId) {
    res.status(400).json(error(ErrorCode.VALIDATION_MISSING_FIELD, 'Thieu accountId hoac conversationId'));
    return;
  }

  const result = await backend.post(
    `/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/read-state`,
    { readAt: readAt || new Date().toISOString() },
    req.token,
  );

  res.json(result.ok ? success(result.body, req.requestId) : mapBackendError(result.status, result.body, req.requestId));
});

router.post('/forward', cookieAuth, async (req, res) => {
  const { accountId, conversationId, messageId, toThreadId, toType } = req.body as {
    accountId?: string; conversationId?: string; messageId?: string;
    toThreadId?: string; toType?: string;
  };
  if (!accountId || !conversationId || !messageId || !toThreadId) {
    res.status(400).json(error(ErrorCode.VALIDATION_MISSING_FIELD, 'Thieu thong tin forward'));
    return;
  }

  const result = await backend.post(
    `/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/forward`,
    { messageId, toThreadId, toType: toType || 'direct' },
    req.token,
  );

  res.json(result.ok ? success(result.body, req.requestId) : mapBackendError(result.status, result.body, req.requestId));
});

router.post('/poll', cookieAuth, async (req, res) => {
  const { accountId, groupId, question, options } = req.body as {
    accountId?: string; groupId?: string; question?: string; options?: string[];
  };
  if (!accountId || !groupId || !question || !options?.length) {
    res.status(400).json(error(ErrorCode.VALIDATION_MISSING_FIELD, 'Thieu thong tin poll'));
    return;
  }

  const result = await backend.post(
    `/api/accounts/${encodeURIComponent(accountId)}/groups/${encodeURIComponent(groupId)}/poll`,
    { question, options },
    req.token,
  );

  res.json(result.ok ? success(result.body, req.requestId) : mapBackendError(result.status, result.body, req.requestId));
});

export default router;
