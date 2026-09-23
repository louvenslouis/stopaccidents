import { PixelRatio, TurboModuleRegistry } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import type { PrepareReportImage } from './share-image.types';

export const prepareReportImage: PrepareReportImage = async (view, report, size) => {
  const width = 1080 / PixelRatio.get();
  const uri = await captureRef(view, {
    format: 'png', quality: 1, result: 'tmpfile',
    width, height: width * size.height / size.width,
  });
  const canShare = Boolean(TurboModuleRegistry.get('RNShare'));
  let handedToShareSheet = false;
  return {
    uri,
    canShare,
    async share() {
      // Lazy import keeps Expo Go and older native builds usable without RNShare.
      const { default: Share } = await import('react-native-share');
      // Android can resolve when the target is chosen, before it has read the file.
      // Keep handed-off captures until view-shot clears its temporary files on exit.
      handedToShareSheet = true;
      await Share.open({
        title: report.title,
        subject: report.title,
        message: report.message,
        url: uri,
        type: 'image/png',
        filename: report.filename,
        failOnCancel: false,
      });
    },
    dispose() {
      if (!handedToShareSheet) releaseCapture(uri);
    },
  };
};
