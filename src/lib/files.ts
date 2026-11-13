/** Shrinks a photo to at most `maxDim` px on its longest side and re-encodes it as JPEG. */
export async function compressImage(file: File, maxDim = 900, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (JPG or PNG).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Could not read this image.'));
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not compress image.'))), 'image/jpeg', quality));
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const EXCEL_ACCEPT = '.xlsx,.xls,.csv,.pdf,image/*';
export const DOC_ACCEPT = '.pdf,image/*,.doc,.docx,.xlsx,.xls';
