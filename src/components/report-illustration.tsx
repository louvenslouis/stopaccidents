import { Image } from 'expo-image';

const illustrations = {
  gunfire: require('../../assets/images/report-illustrations/gunfire.png'),
  suspicious_vehicle: require('../../assets/images/report-illustrations/suspicious-vehicle.png'),
  armed_presence: require('../../assets/images/report-illustrations/armed-presence.png'),
  barricade: require('../../assets/images/barricade-types/other.png'),
  accident: require('../../assets/images/report-illustrations/accident.png'),
  breakdown: require('../../assets/images/breakdown-report/breakdown.png'),
  kidnapping: require('../../assets/images/report-illustrations/kidnapping.png'),
  success: require('../../assets/images/report-illustrations/success.png'),
} as const;

// Decorative artwork: the surrounding card or heading supplies the accessible label.
export function ReportIllustration({
  kind,
  size = 80,
}: {
  kind: keyof typeof illustrations;
  size?: number;
}) {
  return (
    <Image
      source={illustrations[kind]}
      style={{ width: size, height: size, flexShrink: 0 }}
      contentFit="contain"
      accessible={false}
      alt=""
    />
  );
}
