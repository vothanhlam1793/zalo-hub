import type { Response } from 'express';
import type { GoldRuntime } from '../../core/runtime.js';
import type { AccountRuntimeManager } from '../account-manager.js';

export async function getRuntimeForAccount(accountId: string, accountManager: AccountRuntimeManager) {
  const normalized = accountId.trim();
  if (!normalized) {
    throw new Error('accountId la bat buoc');
  }
  return accountManager.ensureRuntime(normalized);
}

export function markLegacyRoute(res: Response, replacement: string) {
  res.setHeader('X-Gold-Legacy-Route', 'true');
  res.setHeader('X-Gold-Replacement-Route', replacement);
}

export async function getLegacyPrimaryContextOrRespond(
  res: Response,
  accountManager: AccountRuntimeManager,
  replacement: string,
) {
  markLegacyRoute(res, replacement);
  const accountId = accountManager.getPrimaryAccountId();
  if (!accountId) {
    res.status(401).json({ error: 'Chua co active account. Hay chon account hoac dang nhap lai.' });
    return undefined;
  }

  try {
    const runtime = await getRuntimeForAccount(accountId, accountManager);
    if (!runtime.isSessionActive()) {
      res.status(401).json({ error: 'Phien dang nhap khong con active. Hay dang nhap lai.' });
      return undefined;
    }
    return { accountId, runtime } as { accountId: string; runtime: GoldRuntime };
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Khong tai duoc active account runtime' });
    return undefined;
  }
}
