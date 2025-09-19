const known: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'image/heif': 'heif',

  'text/plain': 'txt',
  'text/html': 'html',
  'text/css': 'css',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'text/xml': 'xml',

  'application/json': 'json',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/x-tar': 'tar',
  'application/gzip': 'gz',
  'application/x-7z-compressed': '7z',
  'application/x-rar-compressed': 'rar',
  'application/octet-stream': 'bin',

  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba',

  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',

  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

export function extensionFromMime(mimeType?: string | null): string | null {
  if (!mimeType) return null;
  const type = String(mimeType).toLowerCase();
  if (known[type]) return known[type];
  const slash = type.indexOf('/');
  if (slash === -1) return null;
  let ext = type.slice(slash + 1);
  // Drop "+xml" etc. suffixes
  ext = ext.replace(/\+.*/, '');
  if (ext === 'jpeg') return 'jpg';
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : null;
}

