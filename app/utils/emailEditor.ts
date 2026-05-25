import { TaskList, TaskItem } from '@tiptap/extension-list'
import TextAlign from '@tiptap/extension-text-align'

// Extra extensions on top of the editor's defaults (StarterKit + image/link).
export const emailEditorExtensions = [
  TaskList,
  TaskItem.configure({ nested: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] })
]

// Full toolbar shared by the Settings template editor and the invoice Send step.
export const emailEditorItems = [
  [
    { kind: 'undo', icon: 'i-lucide-undo-2' },
    { kind: 'redo', icon: 'i-lucide-redo-2' }
  ],
  [
    { kind: 'heading', level: 1, icon: 'i-lucide-heading-1' },
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2' },
    { kind: 'heading', level: 3, icon: 'i-lucide-heading-3' }
  ],
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold' },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic' },
    { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline' },
    { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough' },
    { kind: 'mark', mark: 'code', icon: 'i-lucide-code' }
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list' },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered' },
    { kind: 'taskList', icon: 'i-lucide-list-todo' }
  ],
  [
    { kind: 'blockquote', icon: 'i-lucide-text-quote' },
    { kind: 'codeBlock', icon: 'i-lucide-code-xml' }
  ],
  [
    { kind: 'textAlign', align: 'left', icon: 'i-lucide-align-left' },
    { kind: 'textAlign', align: 'center', icon: 'i-lucide-align-center' },
    { kind: 'textAlign', align: 'right', icon: 'i-lucide-align-right' }
  ],
  [
    { kind: 'link', icon: 'i-lucide-link' },
    { kind: 'image', icon: 'i-lucide-image' },
    { kind: 'horizontalRule', icon: 'i-lucide-minus' }
  ],
  [
    { kind: 'clearFormatting', icon: 'i-lucide-remove-formatting' }
  ]
]