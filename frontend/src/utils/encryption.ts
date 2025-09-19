/**
 * ============================
 * AES-GCM (Small File Mode)
 * ============================
 */

// Generate a salt (for key derivation) and IV (for GCM)
export const genSalts = () => ({
    salt: crypto.getRandomValues(new Uint8Array(16)), // used as salt for key derivation
    iv: crypto.getRandomValues(new Uint8Array(12))      // IV for AES-GCM
});

// Encrypt a chunk using AES-GCM (for small files, you might encrypt the entire file in one go)
export async function createEncryptionStream(
    password: string,
    salt: Uint8Array,
    iv: Uint8Array
): Promise<(chunk: Uint8Array) => Promise<Uint8Array>> {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    const privKey = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );

    const encryptChunk = async (chunk: Uint8Array): Promise<Uint8Array> => {
        const encryptedBuffer = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            privKey,
            chunk
        );
        return new Uint8Array(encryptedBuffer);
    };

    return encryptChunk;
}

// Decrypt a chunk using AES-GCM
export async function createDecryptionStream(
    password: string,
    salt: Uint8Array,
    iv: Uint8Array
): Promise<(chunk: Uint8Array) => Promise<Uint8Array>> {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );

    const decryptChunk = async (chunk: Uint8Array): Promise<Uint8Array> => {
        try {
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                chunk
            );
            return new Uint8Array(decryptedBuffer);
        } catch (e) {
            throw new Error('Failed to decrypt chunk');
        }
    };

    return decryptChunk;
}

// Helper to decrypt an array of chunks (if you encrypted the file in one go and then split it)
export async function decryptChunks(
    chunks: Uint8Array[],
    password: string,
    salt: Uint8Array,
    iv: Uint8Array
): Promise<Uint8Array[]> {
    const decrypt = await createDecryptionStream(password, salt, iv);
    const decryptedChunks: Uint8Array[] = [];
    for (const chunk of chunks) {
        const decryptedChunk = await decrypt(chunk);
        if (decryptedChunk) decryptedChunks.push(decryptedChunk);
    }
    return decryptedChunks;
}

/**
 * ============================
 * AES-CTR (Large File Streaming Mode)
 * ============================
 *
 * In this mode each chunk is processed individually. An internal counter is incremented per chunk,
 * and we derive a unique counter (nonce) for each chunk.
 */

// Helper: derive a per-chunk counter from a base counter by updating the last 4 bytes.
function deriveCounter(baseCounter: Uint8Array, chunkIndex: number): Uint8Array {
    const counter = new Uint8Array(baseCounter); // copy the base counter
    const view = new DataView(counter.buffer);
    view.setUint32(counter.length - 4, chunkIndex, false); // update last 4 bytes (big-endian)
    return counter;
}

// Create a stateful encryption stream for AES-CTR.
export async function createEncryptionStreamCTR(
    password: string,
    salt: Uint8Array,
    baseCounter: Uint8Array
): Promise<(chunk: Uint8Array, index: number) => Promise<Uint8Array>> {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    const privKey = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-CTR', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );

    const encryptChunk = async (chunk: Uint8Array, index: number): Promise<Uint8Array> => {
        const counter = deriveCounter(baseCounter, index);
        const encryptedBuffer = await crypto.subtle.encrypt(
            {
                name: 'AES-CTR',
                counter,
                length: 64 // using a 64-bit counter segment; must match decryption
            },
            privKey,
            chunk
        );
        return new Uint8Array(encryptedBuffer);
    };

    return encryptChunk;
}
export const getCTRBase = () => {
    return {
        baseCounter: crypto.getRandomValues(new Uint8Array(16)),
        salt: genSalts().salt
    }
}
// Create a stateful decryption stream for AES-CTR.
export async function createDecryptionStreamCTR(
    password: string,
    salt: Uint8Array,
    baseCounter: Uint8Array
): Promise<(chunk: Uint8Array, index: number) => Promise<Uint8Array>> {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-CTR', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );

    const decryptChunk = async (chunk: Uint8Array, index: number): Promise<Uint8Array> => {
        const counter = deriveCounter(baseCounter, index);
        try {
            const decryptedBuffer = await crypto.subtle.decrypt(
                {
                    name: 'AES-CTR',
                    counter,
                    length: 64
                },
                key,
                chunk
            );
            return new Uint8Array(decryptedBuffer);
        } catch (e) {
            throw new Error(`Failed to decrypt chunk at index ${index}`);
        }
    };

    return decryptChunk;
}


export const createEncrypter = async (password: string): Promise<{ key: Uint8Array, iv: Uint8Array, encrypt: (chunk: Uint8Array) => Promise<Uint8Array> }> => {
    const { salt: key, iv } = genSalts()
    const encrypt = await createEncryptionStream(password, key, iv)
    return { encrypt, key, iv }
}

export const createEncrypterCTR = async (password: string): Promise<{ key: Uint8Array, iv: Uint8Array, encrypt: ((chunk: Uint8Array, index: number) => Promise<Uint8Array>) | ((chunk: Uint8Array, index: number) => Promise<Uint8Array>) }> => {
    const { baseCounter, salt } = getCTRBase()
    const encrypt = await createEncryptionStreamCTR(password, salt, baseCounter)
    return { encrypt, key: salt, iv: baseCounter }
}

export const createDecrypter = (password: string, key: Uint8Array, iv: Uint8Array) => {
    return createDecryptionStream(password, key, iv)
}

export const createDecrypterCTR = (password: string, salt: Uint8Array, baseCounter: Uint8Array) => {
    return createDecryptionStreamCTR(password, salt, baseCounter)
}