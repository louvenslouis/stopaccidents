import { toBlob } from 'html-to-image';
import type { PrepareReportImage } from './share-image.types';

export const prepareReportImage: PrepareReportImage = async (view, report) => {
  await document.fonts.ready;
  const element = view as unknown as HTMLElement;
  const blob = await toBlob(element, {
    backgroundColor: '#FFFFFF',
    pixelRatio: 1080 / element.offsetWidth,
    // The card uses system fonts and no remote assets.
    skipFonts: true,
  });
  if (!blob) throw new Error('Impossible de générer l’image.');
  const file = new File([blob], report.filename, { type: 'image/png' });
  const uri = URL.createObjectURL(blob);
  const payload = { files: [file], title: report.title, text: report.message };
  return {
    uri,
    canShare: typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare(payload),
    // Called directly from the user's next tap, preserving browser activation.
    share: () => navigator.share(payload),
    download() {
      const link = document.createElement('a');
      link.href = uri;
      link.download = report.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    dispose: () => URL.revokeObjectURL(uri),
  };
};
