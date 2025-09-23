export type TransferStatus = "uploading" | "paused" | "cancelled";
export type PeerMessage = { requestId?: string } & (
  | { type: "connect" }
  | { type: "webrtc-offer"; data: any }
  | { type: "webrtc-answer"; data: any }
  | { type: "webrtc-ice"; data: any }
  | { type: "file-accept"; fileId: string }
  | { type: "file-reject"; fileId: string }
  | { type: "resume-request"; data: { fileId: string; receivedChunks: number, receivedBytes?: number } }
  | { type: "resume-status"; data: { fileId: string; receivedChunks: number, receivedBytes: number } }
  | { type: "resume-offer"; data: { fileId: string } }
  | { type: "resume-unsupported"; data: { fileId: string } }
  | { type: "transfer-cancelled"; data: { fileId: string } }
  | {
    type: "file-metadata";
    data: {
      fileId: string;
      name: string;
      type: string;
      size: number;
      small: boolean;
    };
  }
);

export type FileMessage =
  | {
    type: "file-chunk";
    data: ArrayBuffer;
    fileId: string;
    chunkNumber: number;
    chunkPart: number;
    totalParts: number;
  }
  | { type: "file-end"; fileId: string; totalChunks: number }
  | {
    type: "file-metadata";
    fileId: string;
    data: {
      name: string;
      type: string;
      size: number;
      key: number[];
      iv: number[];
      small: boolean;
    };
  }
  | { type: "file-pause"; fileId: string }
  | { type: "file-resume"; fileId: string }
  | { type: "file-cancel"; fileId: string }
  | { type: "cancel-upload"; fileId: string };

export type PeerBroadCastMessage = {
  type: "ping";
};

export type Parts = { parts: Map<number, Uint8Array>; totalParts: number };
export type ReceivedFileInfo = {
  name: string;
  type: string;
  size: number;
  progress: number;
  chunkCount: number;
  chunksReceived: number;
  finalized: boolean;
  small: boolean;
  decrypt:
  | ((chunk: Uint8Array) => Promise<Uint8Array>)
  | ((chunk: Uint8Array, index: number) => Promise<Uint8Array>);
};
