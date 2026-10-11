import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

async function compile(path, dependencies = {}) {
  const source = await readFile(path, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, (name) => dependencies[name]);
  return exports;
}
const catalog = await compile('src/features/language/ht.ts');
const model = await compile('src/features/language/translate.ts', { './ht': catalog });
const { translateText: t, parseLanguage } = model;
test('French remains the default; Haitian Creole is restored from its language code', () => {
  for (const value of [null, undefined, '', 'en', {}, 1]) assert.equal(parseLanguage(value), 'fr');
  assert.equal(parseLanguage('ht'), 'ht');
  assert.equal(t('Accueil', 'fr'), 'Accueil');
  assert.equal(t('Accueil', 'ht'), 'Akèy');
  assert.equal(t('Delmas 33', 'ht'), 'Delmas 33');
});
test('Creole interpolations handle counts, nested labels, whitespace and plural suffixes', () => {
  assert.equal(t('Étape 2 : Gravité', 'ht'), 'Etap 2: Gravite');
  assert.equal(t('Ajoutez au maximum 4 photos.', 'ht'), 'Ajoute 4 foto pou pi plis.');
  assert.equal(t('  Voir les détails  ', 'ht'), '  Gade detay yo  ');
  assert.equal(t('0 signalements récompensés · 25 points par parcours terminé', 'ht'), '0 rapò rekonpanse · 25 pwen pou chak pwosesis ki fini');
  assert.equal(t('2 témoignages', 'ht'), '2 temwayaj');
});
test('catalog has no empty translations or invented interpolation parameters', () => {
  assert.ok(Object.keys(catalog.haitianCreole).length > 1000);
  for (const [source, target] of Object.entries(catalog.haitianCreole)) {
    assert.ok(target.trim(), source);
    for (const parameter of target.match(/\{\d+\}/g) ?? []) assert.ok(source.includes(parameter), source);
  }
});
const direction = await compile('src/features/language/text-direction.ts');
const native = await compile('src/features/language/native.tsx', {
  react: React, 'react/jsx-runtime': jsxRuntime,
  'react-native': { Text: ({ style, ...props }) => React.createElement('span', props), TextInput: 'input', View: 'div', Pressable: 'button', ScrollView: 'div', Image: 'img' },
  './language-provider': { useLanguage: () => ({ t: (value) => t(value, 'ht') }) },
  './text-direction': direction,
});
test('text rendering translates full sentences and preserves explicitly marked user content', () => {
  assert.equal(renderToStaticMarkup(React.createElement(native.Text, null, 'Étape ', 2, ' : Gravité')), '<span>Etap 2: Gravite</span>');
  assert.equal(renderToStaticMarkup(React.createElement(native.Text, { translate: false }, 'Travail')), '<span>Travail</span>');
});
test('direction controls cannot reverse displayed testimony letters or nested text', () => {
  const testimony = '\u202EVéhicule rouge — AB-123\u202C';
  assert.equal(renderToStaticMarkup(React.createElement(native.Text, { translate: false }, testimony)), '<span>Véhicule rouge — AB-123</span>');
  const children = React.createElement(React.Fragment, null,
    'Repère : ', React.createElement(native.Text, { translate: false }, '\u2067Delmas 33\u2069'), ' — ', '\u202E2 véhicules\u202C');
  assert.equal(renderToStaticMarkup(React.createElement(native.Text, { translate: false }, children)), '<span>Repère : <span>Delmas 33</span> — 2 véhicules</span>');
  assert.equal(renderToStaticMarkup(React.createElement(native.Text, null, '\u202EÉtape ', 2, ' : Gravité\u202C')), '<span>Etap 2: Gravite</span>');
});
test('normalization preserves accents, whitespace, punctuation, emoji and natural script order', () => {
  const content = '  Pétion-Ville, Kreyòl ayisyen : é e\u0301 — AB-123 (2)\n👩\u200D🚒 שלום العربية  ';
  assert.equal(direction.normalizeTextDirection(content), content);
  assert.equal(direction.normalizeTextDirection('\u061C\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069' + content), content);
});
test('form input removes reversal controls from restored values and newly typed or pasted text', () => {
  const changes = [];
  const style = { textAlign: 'center', fontSize: 17, textAlignVertical: 'top' };
  const props = {
    value: '\u202ETravail — Pétion-Ville\u202C',
    placeholder: '\u202EAutres informations\u202C',
    accessibilityLabel: '\u202EAutres informations\u202C',
    multiline: true, maxLength: 500, selection: { start: 4, end: 4 }, style,
    onChangeText: value => changes.push(value),
  };
  const ref = { current: null };
  const input = native.TextInput.render(props, ref).props;
  assert.equal(input.value, 'Travail — Pétion-Ville');
  assert.equal(input.placeholder, 'Lòt enfòmasyon');
  assert.equal(input.accessibilityLabel, 'Lòt enfòmasyon');
  assert.equal(input.ref, ref);
  assert.deepEqual(input.style, [style, direction.leftToRightText]);
  assert.equal(input.multiline, true);
  assert.equal(input.maxLength, 500);
  assert.deepEqual(input.selection, props.selection);
  input.onChangeText('\u202EVoiture rouge\u202C\nAB-123');
  input.onChangeText('Kreyòl 👩\u200D🚒');
  assert.deepEqual(changes, ['Voiture rouge\nAB-123', 'Kreyòl 👩\u200D🚒']);
  const uncontrolled = native.TextInput.render({ defaultValue: '\u202EDelmas 33\u202C' }, null).props;
  assert.equal(uncontrolled.defaultValue, 'Delmas 33');
  assert.equal(uncontrolled.value, undefined);
  assert.equal(uncontrolled.onChangeText, undefined);
});
test('read-only text keeps its alignment while using left-to-right writing', () => {
  const style = { textAlign: 'right', fontWeight: '700' };
  const text = native.Text.render({ translate: false, children: '\u202EAB-123\u202C', style }, null);
  assert.deepEqual(text.props.style, [style, direction.leftToRightText]);
  assert.equal(text.props.children, 'AB-123');
});
const documents = await compile('src/features/language/documents.ts', { './translate': model });
test('shared descriptions are translated without changing the location or public URL', () => {
  const report = { title: 'Accident · Deux voitures', label: 'Deux voitures', severity: { label: 'Des blessés' }, date: '24/09/2026', location: 'Travail', estimated: false, url: 'https://example.com/?signalement=abc', message: '', description: '' };
  const translated = documents.localizeReportShare(report, 'ht');
  assert.equal(translated.title, 'Aksidan · De machin');
  assert.equal(translated.location, 'Travail');
  assert.ok(translated.message.includes('Kote : Travail'));
  assert.ok(translated.message.endsWith(report.url));
  assert.equal(documents.localizeReportShare(report, 'fr'), report);
});
test('embedded maps declare Creole and translate only fixed labels', () => {
  const html = `<html lang="fr"><div aria-label="Carte interactive d’Haïti"></div><script>label='Votre position'; road='Delmas';</script>`;
  assert.match(documents.localizeMapDocument(html, 'ht'), /lang="ht"/);
  assert.match(documents.localizeMapDocument(html, 'ht'), /Pozisyon ou/);
  assert.match(documents.localizeMapDocument(html, 'ht'), /road='Delmas'/);
});
test('calendar month labels and compound labels translate without relying on ht Intl support', () => {
  assert.equal(t('24 août 2026, 09:40', 'ht'), '24 out 2026, 09:40');
  assert.equal(t('Deux voitures · Des blessés', 'ht'), 'De machin · Gen moun blese');
  assert.equal(t('Afficher Travail sur la carte', 'ht'), 'Montre Travail sou kat la');
  assert.equal(t('constructor', 'ht'), 'constructor');
});
test('plural templates never swallow a sentence containing the word signalement', () => {
  const sentence = 'Événements regroupés à partir des signalements de la communauté. Les chiffres sont déclaratifs et ne constituent pas des statistiques officielles. Mise à jour à 07:27, heure d’Haïti.';
  const translated = t(sentence, 'ht');
  assert.ok(translated.includes('yo pa estatistik ofisyèl'));
  assert.ok(translated.endsWith('07:27, lè Ayiti.'));
  assert.equal(t('26 août – 24 sept. 2026', 'ht'), '26 out – 24 sept. 2026');
  const fragment = React.createElement(React.Fragment, null,
    React.createElement(native.Text, null, '22 sept.'), ' : ', 17, ' événement', 's', ', le niveau le plus élevé de la sélection.');
  const rendered = renderToStaticMarkup(React.createElement(native.Text, null, fragment));
  assert.ok(rendered.includes('17 evènman, nivo ki pi wo'));
  assert.ok(!rendered.includes('evènmans'));
});
