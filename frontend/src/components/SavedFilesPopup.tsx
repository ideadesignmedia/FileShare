import React, { useRef, useState } from 'react';
import { FileMetadata } from '../utils/indexed-db';
import { formatBytes } from '../utils/format';
import { deleteFile, downloadFile } from '../utils/handle-file';
import Button from './Button';
import LoadingPage from './LoadingPage';
import device from '../constants/device-browser';
import useSavedFiles from '../hooks/useSavedFiles';
import { toast } from '../utils/toast';
import icons from './icons';

const SavedFile: React.FC<{ file: FileMetadata }> = ({ file }) => {
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  return <div className="grid grid-cols-[1fr_auto] gap-3 items-center w-full max-w-full p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors shadow-sm">
    <div className="min-w-0">
      <div className="font-medium text-slate-900 truncate">{file.name}</div>
      <div className="mt-0.5 text-sm text-slate-600 truncate">{file.type} • {formatBytes(file.size)}</div>
    </div>
    <div className="flex items-center justify-end gap-2">
      <Button size='sm' onClick={() => {
        /* Non-blocking save, handled below */
      }} className='hidden'>Hidden</Button>
      <Button size='sm' disabled={deleting || saving} onClick={() => {
        setSaving(true)
        downloadFile(file.fileId).then(() => {
          toast('File saved')
        }).catch(e => {
          console.error(e)
          toast('Error saving file: ' + (e.message || e.toString()))
        }).finally(() => setSaving(false))
      }}>
        {!saving ? <span className='inline-flex items-center gap-1'><span>{icons.save}</span><span>Save{(device.app || 'FilePicker' in window) ? ' As' : ''}</span></span> : 'Saving...'}
      </Button>
      {Boolean(localStorage.getItem('token')) && <Button size='sm' disabled={saving || deleting} onClick={() => {
        toast('not implemented')
      }}>
        <span className='inline-flex items-center gap-1'><span>{icons.send}</span><span>Send</span></span>
      </Button>}
      <Button size='sm' disabled={deleting || saving} variant='danger' onClick={() => {
        setDeleting(true)
        deleteFile(file.fileId).catch(e => {
          console.error(e)
        }).finally(() => setDeleting(false))
      }}>{!deleting ? <span className='inline-flex items-center gap-1'><span>{icons.trash}</span><span>Delete</span></span> : 'Deleting...'}</Button>
    </div>
  </div>
}

const SavedFilesPopup: React.FC = () => {
  const { files, loading: loadingFiles, reload: reloadFiles } = useSavedFiles()
  const fileInput = useRef<HTMLInputElement | null>(null)
  return (
    <div className="flex flex-col w-full max-w-full max-h-full overflow-hidden h-full gap-3">
      <div className="flex items-center justify-between w-full">
        <div className="text-base uppercase tracking-wide text-blue-700 font-semibold">Saved Files</div>
        <div className="flex items-center gap-2">
          <Button icon size='sm' variant='outline' className='h-10 w-10 p-0 inline-flex items-center justify-center leading-none border-blue-600 text-blue-700 hover:bg-blue-600 hover:text-white' aria-label='Reload' onClick={() => reloadFiles()}>{icons.refresh}</Button>
          <Button size='sm' onClick={() => {
            toast('not implemented')
          }}>
            <span className='inline-flex items-center gap-1'><span>{icons.folder}</span><span>Store Files</span></span>
          </Button>
          <Button size='sm' onClick={() => {
            toast('not implemented')
          }}>
            <span className='inline-flex items-center gap-1'><span>{icons.folder}</span><span>Store Folders</span></span>
          </Button>
        </div>
      </div>
      <div className="flex flex-col items-stretch justify-start w-full grow overflow-y-auto overflow-x-hidden gap-2">
        {loadingFiles ? (
          <div className='py-10'><LoadingPage /></div>
        ) : files.length ? (
          files.map(file => <SavedFile key={file.fileId} file={file} />)
        ) : (
          <div className='w-full py-10 text-center text-slate-500'>No files saved</div>
        )}
      </div>
      <input ref={fileInput} type="file" multiple className="hidden" />
    </div>
  );
};

export default SavedFilesPopup;
