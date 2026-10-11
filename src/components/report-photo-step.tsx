import { useEffect, useState } from 'react';
import { ReportCamera } from '@/components/report-camera';
import { ReportPhotos } from '@/components/report-photos';
import { ReportModalSheet } from '@/components/ui/report-modal-sheet';
import { MAX_PHOTOS, type CapturedPhoto } from '@/features/accident-report/model';
import type { ReportContext } from '@/features/report-events/context';

export function ReportPhotoStep({ photos, context, active, disabled, onChange, onBusyChange }: {
  photos: CapturedPhoto[];
  context: ReportContext;
  active: boolean;
  disabled: boolean;
  onChange: (photos: CapturedPhoto[]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  useEffect(() => {
    if (!active) {
      onBusyChange(false);
    }
    else if (cameraOpen) onBusyChange(true);
  }, [active, cameraOpen, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  const closeCamera = () => {
    setCameraOpen(false);
    onBusyChange(false);
  };
  return <>
    <ReportPhotos photos={photos} context={context} disabled={disabled}
      onChange={onChange} onCamera={() => { setCameraOpen(true); onBusyChange(true); }} onBusyChange={onBusyChange} />
    {cameraOpen && active && <ReportModalSheet visible dismissDisabled={capturing} onRequestClose={closeCamera}>
      <ReportCamera subject="l’événement" onClose={closeCamera} onBusyChange={setCapturing} onCapture={(photo) => {
        onChange([...photos, { ...photo, source: 'camera' as const }].slice(0, MAX_PHOTOS));
        closeCamera();
      }} />
    </ReportModalSheet>}
  </>;
}
