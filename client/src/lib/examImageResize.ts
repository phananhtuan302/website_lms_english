/**
 * Client-side resize for exam-page photos (feature 3, AI exam-image import) — caps the
 * longest edge and re-encodes as JPEG before the image is ever sent anywhere, same
 * "resize client-side, no object storage" convention as `AvatarUpload.tsx`'s
 * `resizeToSquareJpeg`. Unlike that one, this preserves the original aspect ratio (a full
 * exam page, not a square avatar) and targets legibility for AI vision/OCR rather than a
 * small thumbnail — see `server/src/routes/teacherTests.routes.ts`'s
 * `/tests/import-from-images` doc comment for why staying well under a few hundred KB per
 * page matters (keeps the whole multi-page request under the server's existing global
 * JSON body limit without needing a larger one).
 */

const MAX_EDGE_PX = 2000;
const JPEG_QUALITY = 0.8;

export function resizeExamPageImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode failed'));
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('no 2d context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
