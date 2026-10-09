// Keep version 1 additive: existing accounts retain their choices and receive defaults for new layers.
export const avatarOptions = {
  skin: [
    { id: 'espresso', label: 'Cacao', color: '#54362C' },
    { id: 'deep', label: 'Ébène', color: '#744735' },
    { id: 'brown', label: 'Brun', color: '#A56946' },
    { id: 'cinnamon', label: 'Cannelle', color: '#B77A55' },
    { id: 'warm', label: 'Caramel', color: '#C58D62' },
    { id: 'tan', label: 'Doré', color: '#DDA979' },
    { id: 'olive', label: 'Olive', color: '#C5A077' },
    { id: 'light', label: 'Beige', color: '#F0C6A5' },
    { id: 'fair', label: 'Porcelaine', color: '#F7DAC5' },
    { id: 'rosy', label: 'Rosé clair', color: '#EFC1B1' },
  ],
  face: [
    { id: 'oval', label: 'Ovale' }, { id: 'round', label: 'Rond' }, { id: 'square', label: 'Anguleux' },
  ],
  eyeColor: [
    { id: 'brown', label: 'Marron', color: '#684332' },
    { id: 'hazel', label: 'Noisette', color: '#9B733E' },
    { id: 'green', label: 'Vert', color: '#547D65' },
    { id: 'blue', label: 'Bleu', color: '#5489AA' },
    { id: 'gray', label: 'Gris', color: '#7E8697' },
    { id: 'black', label: 'Noir', color: '#30282B' },
  ],
  hair: [
    { id: 'curls', label: 'Boucles' }, { id: 'crop', label: 'Courts' },
    { id: 'afro', label: 'Afro' }, { id: 'bob', label: 'Carré' },
    { id: 'long', label: 'Longs' }, { id: 'bun', label: 'Chignon' },
    { id: 'braids', label: 'Tresses' }, { id: 'locs', label: 'Locks' },
    { id: 'puffs', label: 'Afro couettes' }, { id: 'ponytail', label: 'Queue haute' },
    { id: 'waves', label: 'Ondulés' }, { id: 'pixie', label: 'Pixie' },
    { id: 'fade', label: 'Dégradé' }, { id: 'sidepart', label: 'Raie de côté' },
    { id: 'mohawk', label: 'Crête' }, { id: 'bald', label: 'Rasés' },
  ],
  hairColor: [
    { id: 'black', label: 'Noir', color: '#251C1B' },
    { id: 'brown', label: 'Châtain', color: '#513021' },
    { id: 'copper', label: 'Cuivré', color: '#A65334' },
    { id: 'gold', label: 'Blond', color: '#C89548' },
    { id: 'cream', label: 'Blond polaire', color: '#E5D4B4' },
    { id: 'silver', label: 'Gris', color: '#9D9B9E' },
    { id: 'pink', label: 'Rose', color: '#C6658C' },
    { id: 'plum', label: 'Prune', color: '#765074' },
    { id: 'blue', label: 'Bleu nuit', color: '#405B83' },
    { id: 'auburn', label: 'Acajou', color: '#713934' },
  ],
  expression: [
    { id: 'smile', label: 'Sourire' }, { id: 'joy', label: 'Joie' },
    { id: 'wink', label: 'Clin d’œil' }, { id: 'calm', label: 'Paisible' },
    { id: 'laugh', label: 'Éclat de rire' }, { id: 'surprised', label: 'Surprise' },
  ],
  beard: [
    { id: 'none', label: 'Sans barbe' }, { id: 'short', label: 'Barbe courte' },
    { id: 'full', label: 'Barbe pleine' }, { id: 'goatee', label: 'Bouc' },
    { id: 'mustache', label: 'Moustache' },
  ],
  glasses: [
    { id: 'none', label: 'Sans lunettes' }, { id: 'round', label: 'Rondes' },
    { id: 'square', label: 'Carrées' }, { id: 'catEye', label: 'Papillon' },
    { id: 'sun', label: 'Solaires' }, { id: 'aviator', label: 'Aviateur' },
  ],
  glassesColor: [
    { id: 'ink', label: 'Encre', color: '#302A34' },
    { id: 'gold', label: 'Or', color: '#B68B45' },
    { id: 'tortoise', label: 'Écaille', color: '#87523D' },
    { id: 'berry', label: 'Framboise', color: '#A04768' },
    { id: 'ocean', label: 'Océan', color: '#377C8B' },
  ],
  earrings: [
    { id: 'none', label: 'Sans boucles' }, { id: 'stud', label: 'Puces' },
    { id: 'hoop', label: 'Créoles' }, { id: 'drop', label: 'Pendantes' },
    { id: 'pearl', label: 'Perles' }, { id: 'silverHoop', label: 'Anneaux argentés' },
    { id: 'star', label: 'Étoiles' },
  ],
  headwear: [
    { id: 'none', label: 'Sans coiffe' }, { id: 'straw', label: 'Chapeau de paille' },
    { id: 'wideStraw', label: 'Grand chapeau' }, { id: 'headscarf', label: 'Foulard noué' },
    { id: 'bandana', label: 'Bandana' },
  ],
  headwearColor: [
    { id: 'terracotta', label: 'Terre cuite', color: '#B66C4F' },
    { id: 'indigo', label: 'Indigo', color: '#485F91' },
    { id: 'sage', label: 'Sauge', color: '#758B67' },
    { id: 'ochre', label: 'Ocre', color: '#C79943' },
    { id: 'cream', label: 'Crème', color: '#E6D9BD' },
    { id: 'berry', label: 'Framboise', color: '#A04768' },
  ],
  clothing: [
    { id: 'tee', label: 'T-shirt' }, { id: 'hoodie', label: 'Sweat à capuche' },
    { id: 'shirt', label: 'Chemise' }, { id: 'knit', label: 'Col roulé' },
    { id: 'jacket', label: 'Veste' }, { id: 'overalls', label: 'Salopette' },
    { id: 'gingham', label: 'Chemise à carreaux' }, { id: 'blouse', label: 'Blouse brodée' },
  ],
  clothingColor: [
    { id: 'forest', label: 'Forêt', color: '#347B68' },
    { id: 'navy', label: 'Marine', color: '#3E567C' },
    { id: 'coral', label: 'Corail', color: '#D67566' },
    { id: 'lilac', label: 'Lilas', color: '#9581B8' },
    { id: 'cream', label: 'Crème', color: '#E6D9BD' },
    { id: 'mustard', label: 'Moutarde', color: '#C99B44' },
    { id: 'charcoal', label: 'Anthracite', color: '#454657' },
    { id: 'rose', label: 'Rose', color: '#C57E9B' },
    { id: 'sky', label: 'Azur', color: '#6B9EB9' },
    { id: 'white', label: 'Ivoire', color: '#EDECE6' },
    { id: 'earth', label: 'Terre', color: '#8B634C' },
    { id: 'clay', label: 'Argile', color: '#B66C4F' },
    { id: 'linen', label: 'Lin', color: '#CDC09D' },
  ],
  background: [
    { id: 'mint', label: 'Menthe', color: '#C6ECD4' },
    { id: 'sand', label: 'Sable', color: '#E9DDD1' },
    { id: 'lavender', label: 'Lavande', color: '#DDD5FA' },
    { id: 'rose', label: 'Rosé', color: '#F5CDD4' },
    { id: 'sky', label: 'Ciel', color: '#CEE5FA' },
    { id: 'peach', label: 'Pêche', color: '#F8DDC0' },
    { id: 'butter', label: 'Vanille', color: '#F4E7AC' },
    { id: 'aqua', label: 'Lagon', color: '#B8E3E4' },
    { id: 'slate', label: 'Ardoise', color: '#A6B5CF' },
    { id: 'sage', label: 'Sauge', color: '#CDD6BB' },
  ],
  backgroundPattern: [
    { id: 'halo', label: 'Halo' }, { id: 'plain', label: 'Uni' },
    { id: 'dots', label: 'Confettis' }, { id: 'arches', label: 'Arches' },
  ],
} as const;

export type AvatarFeature = keyof typeof avatarOptions;
export type AvatarConfig = { version: 1 } & {
  [K in AvatarFeature]: (typeof avatarOptions)[K][number]['id'];
};

export const defaultAvatar: AvatarConfig = {
  version: 1, skin: 'brown', face: 'oval', eyeColor: 'brown', hair: 'curls', hairColor: 'black',
  expression: 'smile', beard: 'none', glasses: 'none', glassesColor: 'ink', earrings: 'none',
  headwear: 'none', headwearColor: 'terracotta',
  clothing: 'tee', clothingColor: 'forest', background: 'mint', backgroundPattern: 'halo',
};

export const avatarPresets: { id: string; label: string; avatar: AvatarConfig }[] = [
  { id: 'breeze', label: 'Brise', avatar: { ...defaultAvatar, hair: 'braids', earrings: 'hoop', clothing: 'shirt', clothingColor: 'white', background: 'aqua' } },
  { id: 'sunny', label: 'Soleil', avatar: { ...defaultAvatar, skin: 'deep', hair: 'afro', expression: 'joy', clothingColor: 'mustard', background: 'butter', backgroundPattern: 'arches' } },
  { id: 'studio', label: 'Studio', avatar: { ...defaultAvatar, skin: 'tan', hair: 'sidepart', glasses: 'round', glassesColor: 'gold', clothing: 'knit', clothingColor: 'navy', background: 'sand' } },
  { id: 'bloom', label: 'Fleur', avatar: { ...defaultAvatar, skin: 'fair', hair: 'waves', hairColor: 'copper', eyeColor: 'green', earrings: 'stud', clothing: 'jacket', clothingColor: 'lilac', background: 'lavender', backgroundPattern: 'dots' } },
  { id: 'city', label: 'Urbain', avatar: { ...defaultAvatar, skin: 'espresso', hair: 'fade', beard: 'short', glasses: 'sun', clothing: 'hoodie', clothingColor: 'coral', background: 'peach' } },
  { id: 'cloud', label: 'Nuage', avatar: { ...defaultAvatar, skin: 'warm', face: 'round', hair: 'puffs', hairColor: 'plum', expression: 'wink', earrings: 'drop', clothingColor: 'cream', background: 'rose', backgroundPattern: 'arches' } },
  { id: 'lakou', label: 'Lakou', avatar: { ...defaultAvatar, skin: 'deep', hair: 'crop', headwear: 'straw', headwearColor: 'sage', clothing: 'overalls', clothingColor: 'navy', background: 'sage', backgroundPattern: 'plain' } },
  { id: 'harvest', label: 'Récolte', avatar: { ...defaultAvatar, skin: 'warm', hair: 'braids', headwear: 'headscarf', headwearColor: 'terracotta', earrings: 'hoop', clothing: 'blouse', clothingColor: 'cream', background: 'butter' } },
  { id: 'garden', label: 'Jardin', avatar: { ...defaultAvatar, skin: 'tan', hair: 'long', hairColor: 'brown', headwear: 'wideStraw', headwearColor: 'berry', clothing: 'gingham', clothingColor: 'forest', background: 'mint', backgroundPattern: 'dots' } },
  { id: 'market', label: 'Marché', avatar: { ...defaultAvatar, skin: 'brown', hair: 'locs', headwear: 'bandana', headwearColor: 'indigo', clothing: 'gingham', clothingColor: 'clay', background: 'sand', expression: 'joy' } },
];

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
  // Leave room for the face instead of stacking accessories in every suggestion.
  if (Math.random() < 0.6) result.beard = 'none';
  if (Math.random() < 0.45) result.glasses = 'none';
  if (Math.random() < 0.45) result.earrings = 'none';
  if (Math.random() < 0.55) result.headwear = 'none';
  return result;
}
