import { haitianCreole } from './ht';

export type Language = 'fr' | 'ht';
export const LANGUAGE_STORAGE_KEY = 'stopaccidents.language';
export const languages = [{ id: 'fr', label: 'Français' }, { id: 'ht', label: 'Kreyòl ayisyen' }] as const;
export function parseLanguage(value: unknown): Language { return value === 'ht' ? 'ht' : 'fr'; }

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.entries(haitianCreole)
  .filter(([source]) => /\{\d+\}/.test(source))
  // Prefer the most specific sentence before a generic prefix such as “Voir les…”.
  .sort(([a], [b]) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length)
  .map(([source, target]) => {
    const indices: string[] = [];
    const parts = source.split(/(\{\d+\})/g).map((part, index, chunks) => {
      if (/^\{\d+\}$/.test(part)) {
        indices.push(part);
        if (/(?:événement|signalement|témoignage|témoin|signalé|récompensé)$/.test(chunks[index - 1] ?? '')) return '(s?)';
        if (part === '{0}' && /^\{0\} (?:événement|signalement|témoignage|témoin)/.test(source)) return '([\\d\\s.,+-]+)';
        return '(.*?)';
      }
      return escapeRegex(part);
    });
    return { source, regex: new RegExp(`^${parts.join('')}$`), target, indices };
  });

/** Translate application messages only. Names, addresses and user contributions must bypass this. */
export function translateText(value: string, language: Language, depth = 0): string {
  if (language === 'fr' || !value || depth > 4) return value;
  const normalized = normalize(value);
  let translated = Object.hasOwn(haitianCreole, normalized) ? haitianCreole[normalized] : undefined;
  if (!translated) {
    for (const { source, regex, target, indices } of patterns) {
      const match = normalized.match(regex);
      if (!match) continue;
      translated = target.replace(/\{\d+\}/g, (key) => {
        const captured = match[indices.indexOf(key) + 1] ?? '';
        // Place names and supplied descriptions are not translation keys.
        if (/^(Afficher |Choisir |Ouvrir |Zone estimée|Voir l’arrivée|Modifier le repère|Couleur|Immatriculation)/.test(source)) return captured;
        return translateText(captured, language, depth + 1);
      });
      break;
    }
  }
  if (!translated) {
    // Intl engines commonly fall back to English for ht. Localize the French
    // calendar output explicitly, keeping all numeric dates and times intact.
    const months: Record<string, string> = { 'janv.': 'jan.', 'févr.': 'fev.', mars: 'mas', 'avr.': 'avr.', mai: 'me', juin: 'jen', 'juil.': 'jiy.', août: 'out', 'sept.': 'sept.', 'oct.': 'okt.', 'nov.': 'nov.', 'déc.': 'des.' };
    if (/^\d{1,2} (?:janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\.)(?:[ ,\d:–—à-]*)$/.test(normalized)) {
      return value.replace(/janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\./g, (month) => months[month]).replace(' à ', ' a ');
    }
    // Compound app labels (map pins, summaries and accessibility descriptions).
    if (depth < 4 && / · | – | — |\. /.test(value)) {
      return value.split(/( · | – | — |\. )/).map((part) => translateText(part, language, depth + 1)).join('');
    }
    return value;
  }
  return `${value.match(/^\s*/)?.[0] ?? ''}${translated}${value.match(/\s*$/)?.[0] ?? ''}`;
}
