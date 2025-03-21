export const formatBytes = (bytes: number, decimals = 2, toNumber = false) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const number = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
    if (toNumber) return number;
    return number + ' ' + sizes[i];
}