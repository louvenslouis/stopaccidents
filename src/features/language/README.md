# Interface languages

French (`fr`) remains the default. Haitian Creole (`ht`) can be selected in the
profile. The preference is stored locally through SecureStore on native and
localStorage on web, independently of account sign-in and theme.

`ht.ts` uses the existing French application messages as translation keys.
`translateText` handles complete messages and numbered interpolations. Plural
suffix parameters only match `s`, so they cannot consume the rest of a sentence.
The French message is retained when no translation exists.

Use the presentation components from `native.tsx` for text, placeholders and
accessibility labels. They subscribe to the language context, preserving screen
and form state when the language changes. Keep database enum values unchanged.
Use `<Text translate={false}>` for user contributions, addresses and names;
translate fallback application labels separately. Input values are never translated.
For animated text and browser titles, use `useLanguage().t` explicitly.

`documents.ts` localizes fixed map labels and the exported share description,
while preserving public URLs and user-provided locations. French calendar month
labels have explicit Creole equivalents because Intl support for `ht` varies.

Run `node --test tests/language.test.mjs` for the catalog, interpolation, user
content, calendar, map and sharing checks.
