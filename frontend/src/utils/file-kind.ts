import { extensionFromMime } from './mime'

export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'zip' | 'code' | 'doc' | 'sheet' | 'slides' | 'text' | 'file'

export function fileKindFrom(type?: string | null, name?: string | null): FileKind {
  const mime = (type || '').toLowerCase()
  const nameStr = (name || '').toLowerCase()
  const ext = (extensionFromMime(mime) || (nameStr.split('.').pop() || '')).toLowerCase()
  if (mime.startsWith('image/') || ['jpg','jpeg','png','gif','webp','svg','heic','heif'].includes(ext)) return 'image'
  if (mime.startsWith('video/') || ['mp4','webm','ogv','mov','m4v','avi','mkv'].includes(ext)) return 'video'
  if (mime.startsWith('audio/') || ['mp3','wav','aac','ogg','weba','flac','m4a'].includes(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  if (['zip','rar','7z','gz','tar'].includes(ext)) return 'zip'
  if (['js','ts','tsx','jsx','json','yml','yaml','xml','html','css','c','cpp','h','hpp','java','py','rb','go','rs','sh'].includes(ext)) return 'code'
  if (['doc','docx','rtf','odt','pages'].includes(ext)) return 'doc'
  if (['xls','xlsx','csv','ods','numbers'].includes(ext)) return 'sheet'
  if (['ppt','pptx','key','odp'].includes(ext)) return 'slides'
  if (mime.startsWith('text/') || ['txt','md','log'].includes(ext)) return 'text'
  return 'file'
}

