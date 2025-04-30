// src/global.d.ts
interface Updater extends EventTarget {
  isUpdating: boolean;
  details: any | null;
  state: 'Complete' | 'Started' | 'Failed' | string;
  progress: number;
  noInitialUpdates: boolean;

  updateStarted(details: any): void;
  stateChange(e: string): void;
  progressChange(e: number): void;
  updateFailed(e: any): void;
  updateCompleted(): void;
}
interface FileSystemStatic {
  fileExt: RegExp;
  seperator: string;

  resolvePath(path: string, useTempDir: boolean): string;

  resolveLocalFileSystemURL(
    path: string,
    existsCallback: () => void,
    notExistsCallback: () => void
  ): void;

  createDirectory(path: string): Promise<any>;
  deleteDirectory(path: string): Promise<any>;
  copyDirectory(srcDir: string, destDir: string, useTempDir?: boolean): Promise<any>;
  copyFile(srcPath: string, destPath: string): Promise<any>;
  deleteFileIfExists(filePath: string): Promise<any>;
  ensureDirectoryExists(filePath: string, useTempDir?: boolean): Promise<any>;
  createDirectories(path: string, useTempDir?: boolean): Promise<any>;
  downloadFile(uri: string, destPath: string): Promise<any>;
  replaceFile(sourcePath: string, targetPath: string): Promise<any>;
}
declare global {
  interface Window {
    cordova?: any,
    electron?: any,
    updates?: Updater,
    FileSystem?: FileSystemStatic
  }
}

export { };