// Only object URLs created in this tab by the send path are trusted. Provider
// DTO fields (including localId/localFile) cannot grant blob URL permission.
const previews = new Set<string>();
export function createLocalMediaPreview(file: Blob): string {
  const url = URL.createObjectURL(file);
  previews.add(url);
  return url;
}
export function revokeLocalMediaPreview(url: string) {
  previews.delete(url);
  URL.revokeObjectURL(url);
}
export function isLocalMediaPreview(url: string): boolean { return previews.has(url); }
