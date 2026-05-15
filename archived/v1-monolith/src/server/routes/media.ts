import { Router } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { mediaDir } from '../../core/media-store.js';

export function createMediaRouter() {
  const router = Router();

  router.get('/*', (req, res) => {
    const relativePath = req.path.slice(1).trim();
    const target = path.resolve(mediaDir, relativePath);
    if (!target.startsWith(mediaDir) || !existsSync(target)) {
      res.status(404).json({ error: 'Khong tim thay media' });
      return;
    }
    res.sendFile(target);
  });

  return router;
}
