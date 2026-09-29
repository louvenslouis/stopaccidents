// Only these small, versioned appearance values are stored in account metadata.
export const avatarOptions = {
  skin: [
    { id: 'deep', label: 'Ébène', color: '#744735' },
    { id: 'brown', label: 'Brun', color: '#A56946' },
    { id: 'warm', label: 'Caramel', color: '#C58D62' },
    { id: 'tan', label: 'Doré', color: '#DDA979' },
    { id: 'light', label: 'Beige', color: '#F0C6A5' },
    { id: 'fair', label: 'Porcelaine', color: '#F7DAC5' },
  ],
  hair: [
    { id: 'curls', label: 'Boucles' }, { id: 'crop', label: 'Courts' },
    { id: 'afro', label: 'Afro' }, { id: 'bob', label: 'Carré' },
    { id: 'long', label: 'Longs' }, { id: 'bun', label: 'Chignon' },
    { id: 'bald', label: 'Rasés' },
  ],
  hairColor: [
    { id: 'black', label: 'Noir', color: '#251C1B' },
    { id: 'brown', label: 'Châtain', color: '#513021' },
    { id: 'copper', label: 'Cuivré', color: '#9A482D' },
    { id: 'gold', label: 'Blond', color: '#C89548' },
    { id: 'silver', label: 'Gris', color: '#9D9B9E' },
    { id: 'pink', label: 'Rose', color: '#B64F77' },
  ],
  expression: [
    { id: 'smile', label: 'Sourire' }, { id: 'joy', label: 'Joie' },
    { id: 'wink', label: 'Clin d’œil' },
  ],
  beard: [
    { id: 'none', label: 'Sans barbe' }, { id: 'short', label: 'Barbe courte' },
    { id: 'full', label: 'Barbe pleine' },
  ],
  glasses: [
    { id: 'none', label: 'Sans lunettes' }, { id: 'round', label: 'Rondes' },
    { id: 'square', label: 'Carrées' },
  ],
  background: [
    { id: 'mint', label: 'Menthe', color: '#C6ECD4' },
    { id: 'sand', label: 'Sable', color: '#E9DDD1' },
    { id: 'lavender', label: 'Lavande', color: '#DDD5FA' },
    { id: 'rose', label: 'Rosé', color: '#F5CDD4' },
    { id: 'sky', label: 'Ciel', color: '#CEE5FA' },
    { id: 'peach', label: 'Pêche', color: '#F8DDC0' },
  ],
} as const;

export type AvatarFeature = keyof typeof avatarOptions;
export type AvatarConfig = { version: 1 } & {
  [K in AvatarFeature]: (typeof avatarOptions)[K][number]['id'];
};

export const defaultAvatar: AvatarConfig = {
  version: 1, skin: 'brown', hair: 'curls', hairColor: 'black',
  expression: 'smile', beard: 'none', glasses: 'none', background: 'mint',
};

export function parseAvatar(value: unknown): AvatarConfig {
  const result = { ...defaultAvatar };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const stored = value as Record<string, unknown>;
  if (stored.version !== 1) return result;
  for (const key of Object.keys(avatarOptions) as AvatarFeature[]) {
    const option = avatarOptions[key].find(({ id }) => id === stored[key]);
    if (option) Object.assign(result, { [key]: option.id });
  }
  return result;
}

export function randomAvatar(): AvatarConfig {
  const result = { ...defaultAvatar };
  for (const key of Object.keys(avatarOptions) as AvatarFeature[]) {
    const options = avatarOptions[key];
    Object.assign(result, { [key]: options[Math.floor(Math.random() * options.length)].id });
  }
  return result;
}
