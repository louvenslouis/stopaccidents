import { writeFile } from 'node:fs/promises';

// GitHub Pages must serve Expo's _expo directory without Jekyll filtering it.
await writeFile(new URL('../dist/.nojekyll', import.meta.url), '');
