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
  baseDir: string;
  tempDir: string;
  backupDir: string;
  workingDir: string;
  fileDir: string;
  resolvePath(path: string, useTempDir?: boolean, useFileDir?: boolean): string;

  resolveLocalFileSystemURL?: (
    path: string,
    existsCallback: () => void,
    notExistsCallback: () => void
  ) => void;

  createDirectory(path: string): Promise<void>;
  deleteDirectory(path: string): Promise<void>;
  copyDirectory(srcDir: string, destDir: string, useTempDir?: boolean, useFileDir?: boolean): Promise<void>;
  copyFile(srcPath: string, destPath: string): Promise<void>;
  deleteFileIfExists(filePath: string): Promise<void>;
  ensureDirectoryExists(filePath: string, useTempDir?: boolean, useFileDir?: boolean): Promise<void>;
  createDirectories(path: string, useTempDir?: boolean, useFileDir?: boolean): Promise<void>;
  downloadFile(uri: string, destPath: string): Promise<any>;
  replaceFile(sourcePath: string, targetPath: string): Promise<void>;
}
// Type definitions for phonegap-plugin-push
// Project: https://github.com/havesource/cordova-plugin-push
// Definitions by: Frederico Galvão <https://github.com/fredgalvao>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare namespace PhonegapPluginPush {
  type EventResponse = RegistrationEventResponse | NotificationEventResponse | Error

  interface PushNotification {
    /**
     * The event registration will be triggered on each successful registration with the 3rd party push service.
     * @param event
     * @param callback
     */
    on(event: "registration", callback: (response: RegistrationEventResponse) => any): void
    /**
     * The event notification will be triggered each time a push notification is received by a 3rd party push service on the device.
     * @param event
     * @param callback
     */
    on(event: "notification", callback: (response: NotificationEventResponse) => any): void
    /**
     * The event error will trigger when an internal error occurs and the cache is aborted.
     * @param event
     * @param callback
     */
    on(event: "error", callback: (response: Error) => any): void
    /**
     *
     * @param event Name of the event to listen to. See below(above) for all the event names.
     * @param callback is called when the event is triggered.
     * @param event
     * @param callback
     */
    on(event: string, callback: (response: EventResponse) => any): void

    off(event: "registration", callback: (response: RegistrationEventResponse) => any): void
    off(event: "notification", callback: (response: NotificationEventResponse) => any): void
    off(event: "error", callback: (response: Error) => any): void
    /**
     * As stated in the example, you will have to store your event handler if you are planning to remove it.
     * @param event Name of the event type. The possible event names are the same as for the push.on function.
     * @param callback handle to the function to get removed.
     * @param event
     * @param callback
     */
    off(event: string, callback: (response: EventResponse) => any): void

    /**
     * The unregister method is used when the application no longer wants to receive push notifications.
     * Beware that this cleans up all event handlers previously registered,
     * so you will need to re-register them if you want them to function again without an application reload.
     * @param successHandler
     * @param errorHandler
     * @param topics
     */
    unregister(successHandler: () => any, errorHandler?: () => any, topics?: string[]): void

    /**
     * The subscribe method is used when the application wants to subscribe a new topic to receive push notifications.
     * @param topic Topic to subscribe to.
     * @param successHandler Is called when the api successfully unregisters.
     * @param errorHandler Is called when the api encounters an error while unregistering.
     */
    subscribe(topic: string, successHandler: () => any, errorHandler: () => any): void;

    /**
     * The unsubscribe method is used when the application no longer wants to receive push notifications
     * from a specific topic but continue to receive other push messages.
     * @param topic Topic to unsubscribe from.
     * @param successHandler Is called when the api successfully unregisters.
     * @param errorHandler Is called when the api encounters an error while unregistering.
     */
    unsubscribe(topic: string, successHandler: () => any, errorHandler: () => any): void;

    /*TODO according to js source code, "errorHandler" is optional, but is "count" also optional? I can't read objetive-C code (can anyone at all? I wonder...)*/
    /**
     * Set the badge count visible when the app is not running
     *
     * The count is an integer indicating what number should show up in the badge.
     * Passing 0 will clear the badge.
     * Each notification event contains a data.count value which can be used to set the badge to correct number.
     * @param successHandler
     * @param errorHandler
     * @param count
     */
    setApplicationIconBadgeNumber(successHandler: () => any, errorHandler: () => any, count: number): void

    /**
     * Get the current badge count visible when the app is not running
     * successHandler gets called with an integer which is the current badge count
     * @param successHandler
     * @param errorHandler
     */
    getApplicationIconBadgeNumber(successHandler: (count: number) => any, errorHandler: () => any): void

    /**
     * iOS only
     * Tells the OS that you are done processing a background push notification.
     * successHandler gets called when background push processing is successfully completed.
     * @param successHandler
     * @param errorHandler
     * @param id
     */
    finish(successHandler?: () => any, errorHandler?: () => any, id?: string): void

    /**
     * Tells the OS to clear all notifications from the Notification Center
     * @param successHandler Is called when the api successfully clears the notifications.
     * @param errorHandler Is called when the api encounters an error when attempting to clears the notifications.
     */
    clearAllNotifications(successHandler: () => any, errorHandler: () => any): void
  }

  /**
   * platform specific initialization options.
   */
  interface InitOptions {
    /**
     * Android specific initialization options.
     */
    android?: {
      /**
       * The name of a drawable resource to use as the small-icon. The name should not include the extension.
       */
      icon?: string
      /**
       * Sets the background color of the small icon on Android 5.0 and greater.
       * Supported Formats - http://developer.android.com/reference/android/graphics/Color.html#parseColor(java.lang.String)
       */
      iconColor?: string
      /**
       * If true it plays the sound specified in the push data or the default system sound. Default is true.
       */
      sound?: boolean
      /**
       * If true the device vibrates on receipt of notification. Default is true.
       */
      vibrate?: boolean
      /**
       * If true the icon badge will be cleared on init and before push messages are processed. Default is false.
       */
      clearBadge?: boolean
      /**
       * If true the app clears all pending notifications when it is closed. Default is true.
       */
      clearNotifications?: boolean
      /**
       * If true will always show a notification, even when the app is on the foreground. Default is false.
       */
      forceShow?: boolean
      /**
       * If the array contains one or more strings each string will be used to subscribe to a GcmPubSub topic.
       */
      topics?: string[]
      /**
       * The key to search for text of notification. Default is 'message'.
       */
      messageKey?: string
      /**
       * The key to search for title of notification. Default is 'title'.
       */
      titleKey?: string
    }

    /**
     * Browser specific initialization options.
     */
    browser?: {
      /**
       * URL for the push server you want to use. Default is 'http://push.api.phonegap.com/v1/push'.
       */
      pushServiceURL?: string
      /**
       * Your GCM API key if you are using VAPID keys.
       */
      applicationServerKey?: string
    }

    /**
     * iOS specific initialization options.
     */
    ios?: {
      /**
       * If true|"true" the device will be set up to receive VoIP Push notifications and the other options will be ignored
       * since VoIP notifications are silent notifications that should be handled in the "notification" event.
       * Default is false|"false".
       */
      voip?: boolean | string
      /**
       * If true|"true" the device sets the badge number on receipt of notification.
       * Default is false|"false".
       * Note: the value you set this option to the first time you call the init method will be how the application always acts.
       * Once this is set programmatically in the init method it can only be changed manually by the user in Settings>Notifications>App Name.
       * This is normal iOS behaviour.
       */
      badge?: boolean | string
      /**
       * If true|"true" the device plays a sound on receipt of notification.
       * Default is false|"false".
       * Note: the value you set this option to the first time you call the init method will be how the application always acts.
       * Once this is set programmatically in the init method it can only be changed manually by the user in Settings>Notifications>App Name.
       * This is normal iOS behaviour.
       */
      sound?: boolean | string
      /**
       * If true|"true" the device shows an alert on receipt of notification.
       * Default is false|"false".
       * Note: the value you set this option to the first time you call the init method will be how the application always acts.
       * Once this is set programmatically in the init method it can only be changed manually by the user in Settings>Notifications>App Name.
       * This is normal iOS behaviour.
       */
      alert?: boolean | string
      /**
       * If true|"true" the badge will be cleared on app startup. Defaults to false|"false".
       */
      clearBadge?: boolean | string
      /**
       * The data required in order to enable Action Buttons for iOS.
       * Action Buttons on iOS - https://github.com/havesource/cordova-plugin-push/blob/master/docs/PAYLOAD.md#action-buttons-1
       */
      categories?: CategoryArray
      /**
       * If `true` the device can show up critical alerts. (Possible since iOS 12 with a special entitlement)
       * Default is false|"false".
     * Note: the value you set this option to the first time you call the init method will be how the application always acts.
     * Once this is set programmatically in the init method it can only be changed manually by the user in Settings > Notifications > `App Name`.
     * This is normal iOS behaviour.
       */
      critical?: boolean
      /**
       * If the array contains one or more strings each string will be used to subscribe to a FcmPubSub topic. Defaults to [].
       */
      topics?: string[]
    }
  }

  interface CategoryArray {
    [name: string]: CategoryAction
  }

  interface CategoryAction {
    yes?: CategoryActionData
    no?: CategoryActionData
    maybe?: CategoryActionData
  }

  interface CategoryActionData {
    callback: string
    title: string
    foreground: boolean
    destructive: boolean
  }

  interface RegistrationEventResponse {
    /**
     * The registration ID provided by the 3rd party remote push service.
     */
    registrationId: string
  }

  interface NotificationEventResponse {
    /**
     * The text of the push message sent from the 3rd party service.
     */
    message: string
    /**
     * The optional title of the push message sent from the 3rd party service.
     */
    title?: string
    /**
     * The number of messages to be displayed in the badge iOS or message count in the notification shade in Android.
     */
    count: string
    /**
     * The name of the sound file to be played upon receipt of the notification.
     */
    sound: string
    /**
     * The path of the image file to be displayed in the notification.
     */
    image: string
    /**
     * An optional collection of data sent by the 3rd party push service that does not fit in the above properties.
     */
    additionalData: NotificationEventAdditionalData
  }

  /**
   * TODO: document all possible properties (I only got the android ones)
   *
   * Loosened up with a dictionary notation, but all non-defined properties need to use (map['prop']) notation
   *
   * Ideally the developer would overload (merged declaration) this or create a new interface that would extend this one
   * so that he could specify any custom code without having to use array notation (map['prop']) for all of them.
   */
  interface NotificationEventAdditionalData {
    [name: string]: any

    /**
     * Whether the notification was received while the app was in the foreground
     */
    foreground?: boolean
    /**
     * Will be true if the application is started by clicking on the push notification, false if the app is already started. (Android/iOS only)
     */
    coldstart?: boolean
    collapse_key?: string
    from?: string
    notId?: string
  }

  interface Channel {
    /**
     * The id of the channel. Must be unique per package. The value may be truncated if it is too long.
     */
    id: string;
    /**
     * The user visible name of the channel. The recommended maximum length is 40 characters; the value may be truncated if it is too long.
     */
    description: string;
    /**
     * The importance of the channel. This controls how interruptive notifications posted to this channel are. The importance property goes from 1 = Lowest, 2 = Low, 3 = Normal, 4 = High and 5 = Highest.
     */
    importance: number;
    /**
     * The name of the sound file to be played upon receipt of the notification in this channel. Empty string to disable sound. Cannot be changed after channel is created.
     */
    sound?: string;
    /**
     * Boolean sets whether notification posted to this channel should vibrate. Array sets custom vibration pattern. Example - vibration: [2000, 1000, 500, 500]. Cannot be changed after channel is created.
     */
    vibration?: boolean | number[];
    /**
     * Sets whether notifications posted to this channel appear on the lockscreen or not, and if so, whether they appear in a redacted form. 0 = Private, 1 = Public, -1 = Secret.
     */
    visibility?: number;
  }

  interface PushNotificationStatic {
    new(options: InitOptions): PushNotification
    /**
     * Initializes the plugin on the native side.
     * @param options An object describing relevant specific options for all target platforms.
     */
    init(options: InitOptions): PushNotification
    /**
     * Checks whether the push notification permission has been granted.
     * @param successCallback Is called when the api successfully retrieves the details on the permission.
     * @param errorCallback	Is called when the api fails to retrieve the details on the permission.
     */
    hasPermission(successCallback: (data: { isEnabled: boolean }) => void, errorCallback: () => void): void;
    /**
     * Android only
     * Create a new notification channel for Android O and above.
     * @param successCallback Is called when the api successfully creates a channel.
     * @param errorCallback Is called when the api fails to create a channel.
     * @param channel The options for the channel.
     */
    createChannel(successCallback: () => void, errorCallback: () => void, channel: Channel): void;
    /**
     * Android only
     * Delete a notification channel for Android O and above.
     * @param successCallback Is called when the api successfully deletes a channel.
     * @param errorCallback Is called when the api fails to create a channel.
     * @param channelId The ID of the channel.
     */
    deleteChannel(successCallback: () => void, errorCallback: () => void, channelId: string): void;
    /**
     * Android only
     * Returns a list of currently configured channels.
     * @param successCallback Is called when the api successfully retrieves the list of channels.
     * @param errorCallback Is called when the api fails to retrieve the list of channels.
     */
    listChannels(successCallback: (channels: Channel[]) => void, errorCallback: () => void): void;
  }
}

/** This interface represents a file system. */
interface FileSystem {
  /* The name of the file system, unique across the list of exposed file systems. */
  name: string;
  /** The root directory of the file system. */
  root: DirectoryEntry;
}

/**
* An abstract interface representing entries in a file system,
* each of which may be a File or DirectoryEntry.
*/
export interface Entry {
  /** Entry is a file. */
  isFile: boolean;
  /** Entry is a directory. */
  isDirectory: boolean;
  /** The name of the entry, excluding the path leading to it. */
  name: string;
  /** The full absolute path from the root to the entry. */
  fullPath: string;
  /** The file system on which the entry resides. */
  filesystem: FileSystem;
  nativeURL: string;
  /**
   * Look up metadata about this entry.
   * @param successCallback A callback that is called with the time of the last modification.
   * @param errorCallback   A callback that is called when errors happen.
   */
  getMetadata(
    successCallback: (metadata: Metadata) => void,
    errorCallback?: (error: FileError) => void): void;
  /**
   * Move an entry to a different location on the file system. It is an error to try to:
   *     move a directory inside itself or to any child at any depth;move an entry into its parent if a name different from its current one isn't provided;
   *     move a file to a path occupied by a directory;
   *     move a directory to a path occupied by a file;
   *     move any element to a path occupied by a directory which is not empty.
   * A move of a file on top of an existing file must attempt to delete and replace that file.
   * A move of a directory on top of an existing empty directory must attempt to delete and replace that directory.
   * @param parent  The directory to which to move the entry.
   * @param newName The new name of the entry. Defaults to the Entry's current name if unspecified.
   * @param successCallback A callback that is called with the Entry for the new location.
   * @param errorCallback   A callback that is called when errors happen.
   */
  moveTo(parent: DirectoryEntry,
    newName?: string,
    successCallback?: (entry: Entry) => void,
    errorCallback?: (error: FileError) => void): void;
  /**
   * Copy an entry to a different location on the file system. It is an error to try to:
   *     copy a directory inside itself or to any child at any depth;
   *     copy an entry into its parent if a name different from its current one isn't provided;
   *     copy a file to a path occupied by a directory;
   *     copy a directory to a path occupied by a file;
   *     copy any element to a path occupied by a directory which is not empty.
   *     A copy of a file on top of an existing file must attempt to delete and replace that file.
   *     A copy of a directory on top of an existing empty directory must attempt to delete and replace that directory.
   * Directory copies are always recursive--that is, they copy all contents of the directory.
   * @param parent The directory to which to move the entry.
   * @param newName The new name of the entry. Defaults to the Entry's current name if unspecified.
   * @param successCallback A callback that is called with the Entry for the new object.
   * @param errorCallback A callback that is called when errors happen.
   */
  copyTo(parent: DirectoryEntry,
    newName?: string,
    successCallback?: (entry: Entry) => void,
    errorCallback?: (error: FileError) => void): void;
  /**
   * Returns a URL that can be used as the src attribute of a <video> or <audio> tag.
   * If that is not possible, construct a cdvfile:// URL.
   * @return string URL
   */
  toURL(): string;
  /**
   * Return a URL that can be passed across the bridge to identify this entry.
   * @return string URL that can be passed across the bridge to identify this entry
   */
  toInternalURL(): string;
  /**
   * Deletes a file or directory. It is an error to attempt to delete a directory that is not empty. It is an error to attempt to delete the root directory of a filesystem.
   * @param successCallback A callback that is called on success.
   * @param errorCallback   A callback that is called when errors happen.
   */
  remove(successCallback: () => void,
    errorCallback?: (error: FileError) => void): void;
  /**
   * Look up the parent DirectoryEntry containing this Entry. If this Entry is the root of its filesystem, its parent is itself.
   * @param successCallback A callback that is called with the time of the last modification.
   * @param errorCallback   A callback that is called when errors happen.
   */
  getParent(successCallback: (entry: Entry) => void,
    errorCallback?: (error: FileError) => void): void;
}

/** This interface supplies information about the state of a file or directory. */
interface Metadata {
  /** This is the time at which the file or directory was last modified. */
  modificationTime: Date;
  /** The size of the file, in bytes. This must return 0 for directories. */
  size: number;
}

/** This interface represents a directory on a file system. */
export interface DirectoryEntry extends Entry {
  /**
   * Creates a new DirectoryReader to read Entries from this Directory.
   */
  createReader(): DirectoryReader;
  /**
   * Creates or looks up a file.
   * @param path    Either an absolute path or a relative path from this DirectoryEntry
   *                to the file to be looked up or created.
   *                It is an error to attempt to create a file whose immediate parent does not yet exist.
   * @param options If create and exclusive are both true, and the path already exists, getFile must fail.
   *                If create is true, the path doesn't exist, and no other error occurs, getFile must create it as a zero-length file and return a corresponding FileEntry.
   *                If create is not true and the path doesn't exist, getFile must fail.
   *                If create is not true and the path exists, but is a directory, getFile must fail.
   *                Otherwise, if no other error occurs, getFile must return a FileEntry corresponding to path.
   * @param successCallback A callback that is called to return the File selected or created.
   * @param errorCallback   A callback that is called when errors happen.
   */
  getFile(path: string, options?: Flags,
    successCallback?: (entry: FileEntry) => void,
    errorCallback?: (error: FileError) => void): void;
  /**
   * Creates or looks up a directory.
   * @param path    Either an absolute path or a relative path from this DirectoryEntry
   *                to the directory to be looked up or created.
   *                It is an error to attempt to create a directory whose immediate parent does not yet exist.
   * @param options If create and exclusive are both true and the path already exists, getDirectory must fail.
   *                If create is true, the path doesn't exist, and no other error occurs, getDirectory must create and return a corresponding DirectoryEntry.
   *                If create is not true and the path doesn't exist, getDirectory must fail.
   *                If create is not true and the path exists, but is a file, getDirectory must fail.
   *                Otherwise, if no other error occurs, getDirectory must return a DirectoryEntry corresponding to path.
   * @param successCallback A callback that is called to return the Directory selected or created.
   * @param errorCallback   A callback that is called when errors happen.
   */
  getDirectory(path: string, options?: Flags,
    successCallback?: (entry: DirectoryEntry) => void,
    errorCallback?: (error: FileError) => void): void;
  /**
   * Deletes a directory and all of its contents, if any. In the event of an error (e.g. trying
   * to delete a directory that contains a file that cannot be removed), some of the contents
   * of the directory may be deleted. It is an error to attempt to delete the root directory of a filesystem.
   * @param successCallback A callback that is called on success.
   * @param errorCallback   A callback that is called when errors happen.
   */
  removeRecursively(successCallback: () => void,
    errorCallback?: (error: FileError) => void): void;
}

/**
* This dictionary is used to supply arguments to methods
* that look up or create files or directories.
*/
interface Flags {
  /** Used to indicate that the user wants to create a file or directory if it was not previously there. */
  create?: boolean;
  /** By itself, exclusive must have no effect. Used with create, it must cause getFile and getDirectory to fail if the target path already exists. */
  exclusive?: boolean;
}

/**
* This interface lets a user list files and directories in a directory. If there are
* no additions to or deletions from a directory between the first and last call to
* readEntries, and no errors occur, then:
*     A series of calls to readEntries must return each entry in the directory exactly once.
*     Once all entries have been returned, the next call to readEntries must produce an empty array.
*     If not all entries have been returned, the array produced by readEntries must not be empty.
*     The entries produced by readEntries must not include the directory itself ["."] or its parent [".."].
*/
interface DirectoryReader {
  /**
   * Read the next block of entries from this directory.
   * @param successCallback Called once per successful call to readEntries to deliver the next
   *                        previously-unreported set of Entries in the associated Directory.
   *                        If all Entries have already been returned from previous invocations
   *                        of readEntries, successCallback must be called with a zero-length array as an argument.
   * @param errorCallback   A callback indicating that there was an error reading from the Directory.
   */
  readEntries(
    successCallback: (entries: Entry[]) => void,
    errorCallback?: (error: FileError) => void): void;
}

/** This interface represents a file on a file system. */
export interface FileEntry extends Entry {
  /**
   * Creates a new FileWriter associated with the file that this FileEntry represents.
   * @param successCallback A callback that is called with the new FileWriter.
   * @param errorCallback   A callback that is called when errors happen.
   */
  createWriter(successCallback: (
    writer: FileWriter) => void,
    errorCallback?: (error: FileError) => void): void;
  /**
   * Returns a File that represents the current state of the file that this FileEntry represents.
   * @param successCallback A callback that is called with the File.
   * @param errorCallback   A callback that is called when errors happen.
   */
  file(successCallback: (file: File) => void,
    errorCallback?: (error: FileError) => void): void;
}

/**
* This interface provides methods to monitor the asynchronous writing of blobs
* to disk using progress events and event handler attributes.
*/
interface FileSaver extends EventTarget {
  /** Terminate file operation */
  abort(): void;
  /**
   * The FileSaver object can be in one of 3 states. The readyState attribute, on getting,
   * must return the current state, which must be one of the following values:
   *     INIT
   *     WRITING
   *     DONE
   */
  readyState: number;
  /** Handler for writestart events. */
  onwritestart: (event: ProgressEvent) => void;
  /** Handler for progress events. */
  onprogress: (event: ProgressEvent) => void;
  /** Handler for write events. */
  onwrite: (event: ProgressEvent) => void;
  /** Handler for abort events. */
  onabort: (event: ProgressEvent) => void;
  /** Handler for error events. */
  onerror: (event: ProgressEvent) => void;
  /** Handler for writeend events. */
  onwriteend: (event: ProgressEvent) => void;
  /** The last error that occurred on the FileSaver. */
  error: Error;
}

/**
* This interface expands on the FileSaver interface to allow for multiple write
* actions, rather than just saving a single Blob.
*/
interface FileWriter extends FileSaver {
  /**
   * The byte offset at which the next write to the file will occur. This always less or equal than length.
   * A newly-created FileWriter will have position set to 0.
   */
  position: number;
  /**
   * The length of the file. If the user does not have read access to the file,
   * this will be the highest byte offset at which the user has written.
   */
  length: number;
  /**
   * Write the supplied data to the file at position.
   * @param {Blob|string|ArrayBuffer} data The blob to write.
   */
  write(data: Blob | string | ArrayBuffer): void;
  /**
   * The file position at which the next write will occur.
   * @param offset If nonnegative, an absolute byte offset into the file.
   *               If negative, an offset back from the end of the file.
   */
  seek(offset: number): void;
  /**
   * Changes the length of the file to that specified. If shortening the file, data beyond the new length
   * will be discarded. If extending the file, the existing data will be zero-padded up to the new length.
   * @param size The size to which the length of the file is to be adjusted, measured in bytes.
   */
  truncate(size: number): void;
}

/* FileWriter states */
declare var FileWriter: {
  INIT: number;
  WRITING: number;
  DONE: number
};

interface FileError {
  /** Error code */
  code: number;
}

declare var FileError: {
  new(code: number): FileError;
  NOT_FOUND_ERR: number;
  SECURITY_ERR: number;
  ABORT_ERR: number;
  NOT_READABLE_ERR: number;
  ENCODING_ERR: number;
  NO_MODIFICATION_ALLOWED_ERR: number;
  INVALID_STATE_ERR: number;
  SYNTAX_ERR: number;
  INVALID_MODIFICATION_ERR: number;
  QUOTA_EXCEEDED_ERR: number;
  TYPE_MISMATCH_ERR: number;
  PATH_EXISTS_ERR: number;
};

/*
* Constants defined in fileSystemPaths
*/
interface Cordova {
  file: {
    /* Read-only directory where the application is installed. */
    applicationDirectory: string;
    /* Root of app's private writable storage */
    applicationStorageDirectory: string;
    /* Where to put app-specific data files. */
    dataDirectory: string;
    /* Cached files that should survive app restarts. Apps should not rely on the OS to delete files in here. */
    cacheDirectory: string;
    /* Android: the application space on external storage. */
    externalApplicationStorageDirectory: string;
    /* Android: Where to put app-specific data files on external storage. */
    externalDataDirectory: string;
    /* Android: the application cache on external storage. */
    externalCacheDirectory: string;
    /* Android: the external storage (SD card) root. */
    externalRootDirectory: string;
    /* iOS: Temp directory that the OS can clear at will. */
    tempDirectory: string;
    /* iOS: Holds app-specific files that should be synced (e.g. to iCloud). */
    syncedDataDirectory: string;
    /* iOS: Files private to the app, but that are meaningful to other applciations (e.g. Office files) */
    documentsDirectory: string;
    /* BlackBerry10: Files globally available to all apps */
    sharedDirectory: string
  }
}


declare enum LocalFileSystem {
  PERSISTENT = 1,
  TEMPORARY = 0
}

declare global {
  interface Window {
    electron: any,
    updates: Updater,
    FileSystemAPI: FileSystemStatic,
    PushNotification: PhonegapPluginPush.PushNotificationStatic,
    push: PhonegapPluginPush.PushNotification,
    /**
 * Requests a filesystem in which to store application data.
 * @param type              Whether the filesystem requested should be persistent, as defined above. Use one of TEMPORARY or PERSISTENT.
 * @param size              This is an indicator of how much storage space, in bytes, the application expects to need.
 * @param successCallback   The callback that is called when the user agent provides a filesystem.
 * @param errorCallback     A callback that is called when errors happen, or when the request to obtain the filesystem is denied.
 */
    requestFileSystem(
      type: LocalFileSystem,
      size: number,
      successCallback: (fileSystem: FileSystem) => void,
      errorCallback?: (fileError: FileError) => void): void;
    /**
     * Look up file system Entry referred to by local URL.
     * @param string url       URL referring to a local file or directory
     * @param successCallback  invoked with Entry object corresponding to URL
     * @param errorCallback    invoked if error occurs retrieving file system entry
     */
    resolveLocalFileSystemURL(url: string,
      successCallback: (entry: Entry) => void,
      errorCallback?: (error: FileError) => void): void;
    /**
     * Look up file system Entry referred to by local URI.
     * @param string uri       URI referring to a local file or directory
     * @param successCallback  invoked with Entry object corresponding to URI
     * @param errorCallback    invoked if error occurs retrieving file system entry
     */
    resolveLocalFileSystemURI(uri: string,
      successCallback: (entry: Entry) => void,
      errorCallback?: (error: FileError) => void): void;
    resolveLocalDirectory: (uri: string) => Promise<DirectoryEntry | null>
    resolveLocalFile: (uri: string) => Promise<FileEntry | null>
    TEMPORARY: number;
    PERSISTENT: number;
    fileSystemAPI: {
      resolveLocalFileSystemURL: (path: string) => Promise<{ exists: boolean, isDirectory?: boolean, isFile?: boolean }>,
      saveFile: (path: string, data: any) => Promise<boolean>,
      createDirectory: (path: string) => Promise<boolean>,
      deleteDirectory: (path: string) => Promise<boolean>,
      copyDirectory: (src: string, dest: string) => Promise<boolean>,
      copyFile: (src: string, dest: string) => Promise<boolean>,
      deleteFileIfExists: (path: string) => Promise<boolean>,
      ensureDirectoryExists: (path: string) => Promise<boolean>,
      createDirectories: (path: string) => Promise<boolean>,
      downloadFile: (url: string, dest: string) => Promise<boolean>,
      replaceFile: (src: string, dest: string) => Promise<boolean>,
      moveFile: (src: string) => Promise<boolean>
    }
  }
}

export { };