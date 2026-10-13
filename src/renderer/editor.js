// Code editor (CodeMirror 6) with the BuildCraft palette.
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { java } from '@codemirror/lang-java';
import { php } from '@codemirror/lang-php';
import { yaml } from '@codemirror/lang-yaml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const theme = EditorView.theme(
  {
    '&': { color: '#d7e0e8', backgroundColor: '#0a0d11', height: '100%', fontSize: '13px' },
    '.cm-scroller': { fontFamily: "'JetBrains Mono', Consolas, monospace", lineHeight: '1.6' },
    '.cm-content': { caretColor: '#34d17a', padding: '10px 0' },
    '.cm-cursor': { borderLeftColor: '#34d17a', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(52, 209, 122, 0.22) !important' },
    '.cm-gutters': { backgroundColor: '#0a0d11', color: '#4a5562', border: 'none', paddingRight: '6px' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#a3afbd' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
    '.cm-matchingBracket': { backgroundColor: 'rgba(76, 201, 240, 0.2)', outline: 'none' },
    '.cm-tooltip': { backgroundColor: '#181d25', border: '1px solid #2f3947' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'rgba(52, 209, 122, 0.2)' },
  },
  { dark: true }
);

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword], color: '#a98bff' },
  { tag: [t.typeName, t.className], color: '#4cc9f0' },
  { tag: [t.string, t.special(t.string)], color: '#6ff0a6' },
  { tag: [t.number, t.bool, t.null], color: '#f5b83d' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#5d6a79', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#ffd479' },
  { tag: [t.annotation, t.meta], color: '#ff9ac1' },
  { tag: [t.propertyName, t.attributeName], color: '#8fd3ff' },
  { tag: t.variableName, color: '#d7e0e8' },
  { tag: t.operator, color: '#9aa7b4' },
]);

const languageFor = (file) => (file.endsWith('.java') ? java() : file.endsWith('.php') ? php() : /\.ya?ml$/.test(file) ? yaml() : []);

export function createCodeEditor(parent, { onChange, onSave } = {}) {
  const view = new EditorView({ parent });
  const load = (file, text) => {
    view.setState(
      EditorState.create({
        doc: text,
        extensions: [
          basicSetup,
          theme,
          syntaxHighlighting(highlight),
          languageFor(file),
          keymap.of([indentWithTab, { key: 'Mod-s', preventDefault: true, run: () => (onSave?.(), true) }]),
          EditorView.updateListener.of((u) => u.docChanged && onChange?.()),
        ],
      })
    );
  };
  return { view, load, value: () => view.state.doc.toString() };
}
