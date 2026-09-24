import { translateText, type Language } from './translate';
import type { ReportShare } from '../safety-report/share';

/** These substitutions target only fixed application literals, never supplied HTML or user data. */
export function localizeMapDocument(html: string, language: Language) {
  if (language === 'fr') return html;
  return html.replace('<html lang="fr">', '<html lang="ht">')
    .replace('aria-label="Carte interactive d’Haïti"', 'aria-label="Kat entèraktif Ayiti"')
    .replace('aria-label="Carte pour choisir un lieu en Haïti"', 'aria-label="Kat pou chwazi yon kote ann Ayiti"')
    .replace("'A · Départ'", "'A · Depa'").replace("'B · Arrivée'", "'B · Arive'")
    .replace("'Votre position'", "'Pozisyon ou'")
    .replace("' signalements dans cette zone'", "' rapò nan zòn sa a'")
    .replace("' stations dans cette zone'", "' estasyon nan zòn sa a'");
}

export function localizeReportShare(report: ReportShare, language: Language): ReportShare {
  if (language === 'fr') return report;
  const t = (text: string) => translateText(text, language);
  const title = t(report.title);
  const severity = report.severity ? { ...report.severity, label: t(report.severity.label) } : null;
  const date = t(report.date);
  const description = [title,
    `${t(report.estimated ? 'Zone estimée' : 'Lieu')} : ${report.location}`,
    `${t('Signalé le')} ${date}`,
    ...(severity ? [`${t('Gravité')} : ${severity.label}`] : []),
  ].join('\n');
  return { ...report, title, label: t(report.label), severity, date, description,
    message: `${description}\n\n${t('Voir l’événement sur Stop Accidents :')}\n${report.url}` };
}
