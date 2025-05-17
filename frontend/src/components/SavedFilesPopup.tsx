import React, { useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { FileMetadata } from '../utils/indexed-db';
import { formatBytes } from '../utils/format';
import { deleteFile, downloadFile } from '../utils/handle-file';
import Button from './Button';
import LoadingPage from './LoadingPage';
import device from '../constants/device-browser';

const SavedFile: React.FC<{ file: FileMetadata }> = ({ file }) => {
  const { state, flash } = useAppContext()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  return <div className="flex flex-col items-start justify-start w-full max-w-full p-2 rounded border-1 border-blue-500">
    <span>{file.name} ({file.type} - ({formatBytes(file.size)}))</span>
    <div className="flex items-center justify-between w-full">
      <Button disabled={deleting || saving} variant='danger' onClick={() => {
        setDeleting(true)
        deleteFile(file.fileId).catch(e => {
          console.error(e)
        }).finally(() => setDeleting(false))
      }}>{!deleting ? "Delete" : 'Deleting...'}</Button>
      {state.token && <Button disabled={saving || deleting} onClick={() => {
        flash('not implemented')
      }}>Send</Button>}
      <Button disabled={deleting || saving} onClick={() => {
        setSaving(true)
        downloadFile(file.fileId).then(() => {
          flash('File saved')
        }).catch(e => {
          console.error(e)
          flash('Error saving file: ' + e.message || e.toString())
        }).finally(() => setSaving(false))
      }}>{!saving ? `Save${(device.app || 'FilePicker' in window) ? ' As' : ''}` : 'Saving...'}</Button>
    </div>
  </div>
}

const SavedFilesPopup: React.FC = () => {
  const { files, loadingFiles, reloadFiles, flash } = useAppContext()
  const fileInput = useRef<HTMLInputElement | null>(null)
  return (
    <div className="flex flex-col justify-center items-center space-y-4 w-full max-w-full max-h-full overflow-hidden h-full gap-2">
      <div className="flex flex-col w-full items-center shrink-0 justify-start p-2 gap-1">
        <h3>Saved Files</h3>
        <div className="flex w-full items-center justify-end gap-2">
          <Button onClick={() => {
            //fileInput.current?.click()
            flash('not implemented')
          }}>Store Files</Button>
          <Button onClick={() => {
            //fileInput.current?.click()
            flash('not implemented')
          }}>Store Folders</Button>
          <Button onClick={() => reloadFiles()}>Reload</Button>
        </div>
      </div>
      <div className="flex flex-col items-center justify-start w-full grow overflow-y-auto overflow-x-hidden gap-2">
        {loadingFiles ? <LoadingPage /> : files.length ? files.map(file => <SavedFile key={file.fileId} file={file} />) : <span>No Files Stored.</span>}
      </div>
      <input ref={fileInput} type="file" multiple className="hidden" />
    </div>
  );
};

export default SavedFilesPopup;