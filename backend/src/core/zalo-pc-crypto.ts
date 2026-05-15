import { generateKeyPairSync, createSign, randomBytes, createPublicKey, createPrivateKey } from 'node:crypto';

export interface PcSignalKeys {
  iKey: { id: number; key: string };
  spKey: { id: number; key: string };
  iKeySig: string;
  opKeys: Array<{ id: number; key: string }>;
  identityKey: string;
  registrationId: number;
}

interface GeneratedKeys {
  keyId: number;
  privateKeyJwk: object;
  publicKeyRaw: Buffer;
}

function generateKeys(keyId: number): GeneratedKeys {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const pubBuf = publicKey as Buffer;
  const rawPub = pubBuf.subarray(pubBuf.length - 65);

  return {
    keyId,
    privateKeyJwk: { key: privateKey, format: 'pem', type: 'pkcs8' },
    publicKeyRaw: rawPub,
  };
}

function compressedPublicKey(rawPub: Buffer): string {
  const x = rawPub.subarray(1, 33);
  const prefix = (rawPub[64] & 1) === 0 ? 0x02 : 0x03;
  return Buffer.concat([Buffer.from([prefix]), x]).toString('base64');
}

export function generatePcSignalKeys(): PcSignalKeys {
  const baseKeyId = 8000 + Math.floor(Math.random() * 9000);

  const iKey = generateKeys(baseKeyId);
  const spKey = generateKeys(baseKeyId + 1);

  const iKeySigInput = Buffer.concat([iKey.publicKeyRaw, Buffer.from([0x01])]);
  const sign = createSign('SHA256');
  sign.update(iKeySigInput);
  sign.end();
  const signature = sign.sign(iKey.privateKeyJwk as any);

  const numOpKeys = 3 + Math.floor(Math.random() * 3);
  const opKeys: Array<{ id: number; key: string }> = [];
  for (let i = 0; i < numOpKeys; i++) {
    const opKey = generateKeys(baseKeyId + 2 + i);
    opKeys.push({ id: opKey.keyId, key: compressedPublicKey(opKey.publicKeyRaw) });
  }

  const regBytes = randomBytes(2) as unknown as Buffer;
  const registrationId = (regBytes.readUInt16LE(0) & 0x3FFF) || 5678;

  return {
    iKey: { id: iKey.keyId, key: compressedPublicKey(iKey.publicKeyRaw) },
    spKey: { id: spKey.keyId, key: compressedPublicKey(spKey.publicKeyRaw) },
    iKeySig: signature.toString('base64'),
    opKeys,
    identityKey: iKey.publicKeyRaw.toString('base64'),
    registrationId,
  };
}

export function buildSignalReq0Payload(keys: PcSignalKeys) {
  return {
    delSS: 1,
    key: {
      deviceId: 1,
      preKey: {
        iKey: keys.iKey,
        signature: keys.iKeySig,
        spKey: keys.spKey,
      },
      opKeys: keys.opKeys,
      updateFromOtherDevice: false,
      identityKey: keys.identityKey,
      registrationId: keys.registrationId,
    },
  };
}
