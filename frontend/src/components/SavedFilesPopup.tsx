import React from 'react';
import { useAppContext } from '../context/AppContext';
import { FileMetadata } from '../utils/indexed-db';
import { formatBytes } from '../utils/format';
import { deleteFile, downloadFile } from '../utils/handle-file';
import Button from './Button';
import LoadingPage from './LoadingPage';

const SavedFile: React.FC<{ file: FileMetadata }> = ({ file }) => {
  return <div className="flex flex-col items-center justify-center w-full max-w-full">
    <span>{file.name} ({file.type} - ({formatBytes(file.size)}))</span>
    <div className="flex items-center justify-between w-full">
      <Button variant='danger' onClick={() => {
        deleteFile(file.fileId)
      }}>Delete</Button>
      <Button onClick={() => {
        downloadFile(file.fileId)
      }}>Download</Button>
    </div>
  </div>
}

const SavedFilesPopup: React.FC = () => {
  const { files, loadingFiles, reloadFiles } = useAppContext()
  return (
    <div className="flex flex-col justify-center items-center space-y-4 w-full max-w-full max-h-full overflow-hidden h-full">
      <div className="flex w-full items-center shrink-0 justify-between p-2">
        <h3>Saved Files</h3>
        <Button onClick={() => reloadFiles()}>Reload</Button>
      </div>
      <div className="flex flex-col items-center justify-start w-full grow">
        {loadingFiles ? <LoadingPage /> : files.length ? files.map(file => <SavedFile key={file.fileId} file={file} />) : <span>No Files Stored.</span>}
      </div>
    </div>
  );
};

export default SavedFilesPopup;