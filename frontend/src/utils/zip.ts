import { ZipWriter } from "@zip.js/zip.js";

/**
 * Streams a zip archive containing the given files.
 * 
 * Each file is added using its webkitRelativePath (if available) or file name,
 * so that folder structure is preserved.
 *
 * @param files - An array of File objects.
 * @returns A ReadableStream<Uint8Array> representing the zip archive.
 */
export function streamFolderToZip(files: File[]): ReadableStream<Uint8Array> {
    // Create a TransformStream for the zip output.
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();

    // Immediately start an async process to write the zip data.
    (async () => {
        try {
            // Create a ZipWriter that writes to the writable stream.
            const zipWriter = new ZipWriter(writable);

            // For each file, add it to the zip archive.
            // Using file.webkitRelativePath (if available) preserves folder structure.
            for (const file of files) {
                // Note: webkitRelativePath may not be present on all File objects.
                const entryName = (file as any).webkitRelativePath || file.name;
                // file.stream() returns a ReadableStream<Uint8Array> that ZipWriter accepts.
                await zipWriter.add(entryName, file.stream());
            }

            // Finalize the zip archive.
            await zipWriter.close();
        } catch (err) {
            console.error("Error creating zip stream:", err);
            // Abort the writable stream if an error occurs.
            writable.getWriter().abort(err);
        }
    })();

    // Return the ReadableStream immediately.
    return readable;
}
type CompressionRatios = {
    [key: string]: number;
};

// Expanded compression ratios for a wide variety of file types
const COMPRESSION_RATIOS: CompressionRatios = {
    // Text-based files (Highly compressible)
    "text/plain": 0.3,         // .txt
    "text/html": 0.3,          // .html, .htm
    "application/json": 0.3,    // .json
    "application/xml": 0.3,     // .xml
    "text/css": 0.3,            // .css
    "text/csv": 0.25,           // .csv
    "application/javascript": 0.4, // .js
    "application/typescript": 0.4, // .ts

    // Image files (Mostly already compressed)
    "image/jpeg": 0.98,         // .jpg, .jpeg
    "image/png": 0.98,          // .png
    "image/gif": 0.95,          // .gif
    "image/webp": 0.98,         // .webp
    "image/bmp": 0.6,           // .bmp
    "image/tiff": 0.6,          // .tiff, .tif
    "image/svg+xml": 0.4,       // .svg (text-based)

    // Video files (Highly compressed already)
    "video/mp4": 0.99,
    "video/x-matroska": 0.99,
    "video/webm": 0.99,
    "video/quicktime": 0.98,
    "video/avi": 0.95,

    // Audio files (Mostly already compressed)
    "audio/mpeg": 0.98,         // .mp3
    "audio/wav": 0.5,           // .wav (uncompressed)
    "audio/ogg": 0.98,          // .ogg
    "audio/flac": 0.95,         // .flac
    "audio/aac": 0.98,          // .aac

    // Document files
    "application/pdf": 0.9,
    "application/msword": 0.85,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 0.85,
    "application/vnd.ms-excel": 0.8,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": 0.8,
    "application/vnd.ms-powerpoint": 0.85,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": 0.85,
    "application/rtf": 0.5,     // .rtf (Rich Text Format)

    // Archive files (Already compressed)
    "application/zip": 1.0,
    "application/x-rar-compressed": 1.0,
    "application/x-7z-compressed": 1.0,
    "application/x-tar": 0.6,   // .tar (Uncompressed)

    // Executable files
    "application/x-executable": 0.7,
    "application/octet-stream": 0.7, // General binary files

    // Code files (Highly compressible)
    "application/x-sh": 0.3,    // .sh (Shell scripts)
    "application/x-python": 0.35, // .py
    "application/x-java": 0.35,  // .java
    "application/x-c": 0.35,     // .c, .cpp
    "application/x-ruby": 0.35,  // .rb
    "application/x-php": 0.35,   // .php

    // Font files
    "font/otf": 0.9,
    "font/ttf": 0.9,
    "font/woff": 0.95,
    "font/woff2": 0.95,

    // Miscellaneous
    "application/vnd.sqlite3": 0.7, // .sqlite3 (Database files)
    "application/wasm": 0.8,        // .wasm (WebAssembly binary)
    "application/x-msdownload": 0.75, // .exe, .dll

    // General categories (Fallback)
    "image": 0.95,
    "video": 0.98,
    "audio": 0.98,
    "application": 0.7,
    "text": 0.3,
    "default": 0.6
};

export function estimateZipSize(files: File[]): number {
    let estimatedSize = 0;

    files.forEach(file => {
        const mimeType = file.type || "default";
        const fileSize = file.size;

        // Determine compression ratio based on MIME type or broader type
        const compressionRatio = COMPRESSION_RATIOS[mimeType] ||
            COMPRESSION_RATIOS[mimeType.split("/")[0]] ||
            COMPRESSION_RATIOS["default"];

        // Estimate compressed file size
        estimatedSize += fileSize * compressionRatio;
    });

    return Math.round(estimatedSize);
}