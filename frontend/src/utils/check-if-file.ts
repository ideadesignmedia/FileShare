export const checkIfFile = (file: File | ReadableStream): boolean => Boolean(file instanceof File || (
    file
    && typeof (file as any).name === 'string'
    && typeof (file as any).type === 'string'
    && typeof (file as any).size === 'number'
    && file instanceof Blob
))