import { Children, Fragment, cloneElement, isValidElement, forwardRef, type ReactNode } from 'react';
import {
  Text as NativeText, TextInput as NativeTextInput, View as NativeView,
  Pressable as NativePressable, ScrollView as NativeScrollView, Image as NativeImage,
  type TextProps, type TextInputProps, type ViewProps, type PressableProps,
  type ScrollViewProps, type ImageProps, type AccessibilityProps,
} from 'react-native';
import { useLanguage } from './language-provider';

// Localize at the presentation boundary so stored report values and API enums never change.
function useAccessibility<T extends AccessibilityProps>(props: T) {
  const { t } = useLanguage();
  return { ...props,
    accessibilityLabel: props.accessibilityLabel ? t(props.accessibilityLabel) : props.accessibilityLabel,
    accessibilityHint: props.accessibilityHint ? t(props.accessibilityHint) : props.accessibilityHint,
    accessibilityValue: props.accessibilityValue?.text
      ? { ...props.accessibilityValue, text: t(props.accessibilityValue.text) } : props.accessibilityValue,
  };
}
function translateChildren(children: ReactNode, t: (text: string) => string): ReactNode {
  const nodes = Children.toArray(children);
  // Keep interpolated numbers and suffixes together for sentence-level translations.
  if (nodes.every((node) => typeof node === 'string' || typeof node === 'number')) {
    const text = nodes.join('');
    const translated = t(text);
    return translated !== text ? translated : nodes.map((node) => typeof node === 'string' ? t(node) : node);
  }
  const result: ReactNode[] = [];
  let run: (string | number)[] = [];
  const flush = () => {
    if (run.length) result.push(translateChildren(run, t));
    run = [];
  };
  for (const node of nodes) {
    if (typeof node === 'string' || typeof node === 'number') { run.push(node); continue; }
    flush();
    result.push(isValidElement<{ children: ReactNode }>(node) && node.type === Fragment
      ? cloneElement(node, { children: translateChildren(node.props.children, t) }) : node);
  }
  flush();
  return result;
}
export type Text = NativeText;
// Value and ref type intentionally share the native component name.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const Text = forwardRef<NativeText, TextProps & { translate?: boolean }>(function Text({ children, translate = true, ...props }, ref) {
  const { t } = useLanguage();
  const localized = useAccessibility(props);
  return <NativeText {...localized} ref={ref}>{translate ? translateChildren(children, t) : children}</NativeText>;
});
export type TextInput = NativeTextInput;
// Value and ref type intentionally share the native component name.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function TextInput(props, ref) {
  const { t } = useLanguage();
  return <NativeTextInput {...useAccessibility(props)} ref={ref} placeholder={props.placeholder ? t(props.placeholder) : props.placeholder} />;
});
export type View = NativeView;
// Value and ref type intentionally share the native component name.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const View = forwardRef<NativeView, ViewProps>(function View(props, ref) { return <NativeView {...useAccessibility(props)} ref={ref} />; });
export const Pressable = forwardRef<NativeView, PressableProps>(function Pressable(props, ref) { return <NativePressable {...useAccessibility(props)} ref={ref} />; });
export type ScrollView = NativeScrollView;
// Value and ref type intentionally share the native component name.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const ScrollView = forwardRef<NativeScrollView, ScrollViewProps>(function ScrollView(props, ref) { return <NativeScrollView {...useAccessibility(props)} ref={ref} />; });
export const Image = forwardRef<NativeImage, ImageProps>(function Image(props, ref) { return <NativeImage {...useAccessibility(props)} ref={ref} />; });
