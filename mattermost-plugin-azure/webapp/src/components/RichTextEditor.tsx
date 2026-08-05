import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { fileFromClipboardEvent } from '../lib/clipboard-image';

type Props = {
  value: string;
  onChange: (html: string) => void;
  /** Register file + return blob: URL used as <img src>. */
  onImageFile: (file: File) => string;
  placeholder?: string;
};

export function RichTextEditor({
  value,
  onChange,
  onImageFile,
  placeholder = 'Текст…',
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      Image.configure({ inline: true, allowBase64: true }),
    ],
    content: value || '',
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'ado-prosemirror',
        role: 'textbox',
      },
      handleDOMEvents: {
        keydown: (_view, event) => {
          event.stopPropagation();
          return false;
        },
        keypress: (_view, event) => {
          event.stopPropagation();
          return false;
        },
        keyup: (_view, event) => {
          event.stopPropagation();
          return false;
        },
        focus: (_view, event) => {
          event.stopPropagation();
          return false;
        },
      },
      handlePaste: (_view, event) => {
        const e = event as ClipboardEvent;
        const items = e.clipboardData?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
              e.preventDefault();
              e.stopPropagation();
              void fileFromClipboardEvent(e).then((file) => {
                if (!file) return;
                const url = onImageFile(file);
                editor?.chain().focus().setImage({ src: url, alt: file.name }).run();
              });
              return true;
            }
          }
        }
        e.stopPropagation();
        return false;
      },
      handleDrop: (_view, event) => {
        const e = event as DragEvent;
        const files = e.dataTransfer?.files;
        if (!files?.length) return false;
        let handled = false;
        for (let i = 0; i < files.length; i++) {
          if (files[i].type.startsWith('image/')) {
            handled = true;
            e.preventDefault();
            e.stopPropagation();
            const file = files[i];
            const url = onImageFile(file);
            editor?.chain().focus().setImage({ src: url, alt: file.name }).run();
          }
        }
        return handled;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current && (value || '') !== current) {
      if (!editor.isFocused) {
        editor.commands.setContent(value || '', false);
      }
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div
      className="ado-editor"
      onMouseDown={(e) => {
        e.stopPropagation();
        if (!(e.target as HTMLElement).closest('button')) {
          editor.chain().focus().run();
        }
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="ado-editor-toolbar">
        <button
          type="button"
          className={editor.isActive('bold') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </button>
        <button
          type="button"
          className={editor.isActive('italic') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </button>
        <button
          type="button"
          className={editor.isActive('bulletList') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • List
        </button>
      </div>
      <EditorContent editor={editor} className="ado-editor-body" />
    </div>
  );
}
