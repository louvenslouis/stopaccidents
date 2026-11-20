const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withOptionalPortrait(config) {
  return withAndroidManifest(config, (config) => {
    // A transitive barcode scanner activity requests portrait even when scanning is disabled.
    const manifest = config.modResults.manifest;
    const features = manifest['uses-feature'] ??= [];
    const name = 'android.hardware.screen.portrait';
    const feature = features.find((item) => item.$['android:name'] === name);
    if (feature) {
      feature.$['android:required'] = 'false';
    } else {
      features.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    return config;
  });
};
