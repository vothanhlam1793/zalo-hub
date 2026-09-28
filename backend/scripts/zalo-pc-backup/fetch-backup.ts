import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Helper tìm và kéo file sao lưu Zalo PC từ các nguồn khác nhau:
 * 1. Từ máy Mac/Linux qua SSH
 * 2. Từ máy Orion Nextcloud (docker internal)
 * 3. Từ Nextcloud public share link
 */

export async function fetchFromSsh(sshUser: string, sshHost: string, remoteFilePath?: string, localDestDir = '/tmp/opencode/zalo_backup'): Promise<string> {
  fs.mkdirSync(localDestDir, { recursive: true });

  let targetRemotePath = remoteFilePath;
  if (!targetRemotePath) {
    console.log(`🔍 Đang dò tìm file backup_zalo*.zl.zip trên ${sshUser}@${sshHost}...`);
    const searchCmd = `ssh ${sshUser}@${sshHost} "find ~/Desktop ~/Downloads /Users/*/Desktop /Users/*/Downloads -name 'backup_zalo*.zl.zip' 2>/dev/null | head -n 1"`;
    try {
      const found = execSync(searchCmd, { encoding: 'utf8' }).trim();
      if (!found) {
        throw new Error(`Không tìm thấy file backup_zalo*.zl.zip nào trên Desktop hoặc Downloads của ${sshHost}`);
      }
      targetRemotePath = found;
      console.log(`🎯 Tìm thấy: ${targetRemotePath}`);
    } catch (e: any) {
      throw new Error(`Lỗi dò tìm file từ SSH: ${e.message}`);
    }
  }

  const filename = path.basename(targetRemotePath);
  const localPath = path.join(localDestDir, filename);

  console.log(`⬇️ Đang kéo file ${targetRemotePath} về ${localPath}...`);
  const scpCmd = `scp -C ${sshUser}@${sshHost}:"${targetRemotePath}" "${localPath}"`;
  execSync(scpCmd, { stdio: 'inherit' });
  console.log(`✅ Đã tải xong: ${localPath} (${(fs.statSync(localPath).size / (1024 * 1024 * 1024)).toFixed(2)} GB)`);
  return localPath;
}

export async function fetchFromOrionNextcloud(containerPath: string, localDestDir = '/tmp/opencode/zalo_backup'): Promise<string> {
  fs.mkdirSync(localDestDir, { recursive: true });
  const filename = path.basename(containerPath);
  const localPath = path.join(localDestDir, filename);

  console.log(`⬇️ Đang stream file từ Orion Docker nextcloud (${containerPath}) về ${localPath}...`);
  const streamCmd = `ssh black@10.7.0.2 "docker exec nextcloud cat '${containerPath}'" > "${localPath}"`;
  execSync(streamCmd, { stdio: 'inherit', maxBuffer: 1024 * 1024 * 1024 * 10 });
  console.log(`✅ Đã tải xong: ${localPath}`);
  return localPath;
}

export async function fetchFromPublicShare(url: string, filename = 'backup_zalo.zl.zip', localDestDir = '/tmp/opencode/zalo_backup'): Promise<string> {
  fs.mkdirSync(localDestDir, { recursive: true });
  const localPath = path.join(localDestDir, filename);

  const downloadUrl = url.endsWith('/download') ? url : `${url.replace(/\/$/, '')}/download`;
  console.log(`⬇️ Đang tải từ Nextcloud link ${downloadUrl} về ${localPath}...`);
  const curlCmd = `curl -L -C - --retry 5 "${downloadUrl}" -o "${localPath}"`;
  execSync(curlCmd, { stdio: 'inherit' });
  console.log(`✅ Đã tải xong: ${localPath}`);
  return localPath;
}

// CLI test
if (process.argv[1]?.endsWith('fetch-backup.ts')) {
  const args = process.argv.slice(2);
  const mode = args[0]; // ssh | orion | url
  const target = args[1];

  if (mode === 'ssh') {
    const [user, host] = target.split('@');
    const remoteFile = args[2];
    fetchFromSsh(user, host, remoteFile).catch(console.error);
  } else if (mode === 'orion') {
    fetchFromOrionNextcloud(target).catch(console.error);
  } else if (mode === 'url') {
    fetchFromPublicShare(target).catch(console.error);
  } else {
    console.log(`Cách dùng:
  npx tsx scripts/zalo-pc-backup/fetch-backup.ts ssh vothanhlam@10.7.0.15 [/path/to/file.zl.zip]
  npx tsx scripts/zalo-pc-backup/fetch-backup.ts orion /var/www/html/data/admin/files/03-TECHNICAL/Zalo/backup.zl.zip
  npx tsx scripts/zalo-pc-backup/fetch-backup.ts url https://nextcloud.cameramamnon.com/s/AKdy4wZJ25M2ta4
`);
  }
}
