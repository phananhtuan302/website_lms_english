import { CKEditor } from '@ckeditor/ckeditor5-react';
import {
  ClassicEditor,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading,
  Paragraph,
  List,
  BlockQuote,
  Table,
  TableToolbar,
  Link,
  Alignment,
  FontColor,
  FontBackgroundColor,
  FontSize,
  Highlight,
  HorizontalLine,
  RemoveFormat,
  Undo,
} from 'ckeditor5';
import 'ckeditor5/ckeditor5.css';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder = 'Nhập nội dung lý thuyết...',
  disabled = false,
}: RichTextEditorProps) {
  return (
    <div className="ckeditor-wrapper overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20">
      <CKEditor
        editor={ClassicEditor}
        disabled={disabled}
        data={value}
        config={{
          licenseKey: 'GPL', // CKEditor 5 open-source license key
          placeholder,
          plugins: [
            Paragraph,
            Heading,
            Bold,
            Italic,
            Underline,
            Strikethrough,
            List,
            BlockQuote,
            Table,
            TableToolbar,
            Link,
            Alignment,
            FontColor,
            FontBackgroundColor,
            FontSize,
            Highlight,
            HorizontalLine,
            RemoveFormat,
            Undo,
          ],
          toolbar: [
            'undo',
            'redo',
            '|',
            'heading',
            'fontSize',
            '|',
            'bold',
            'italic',
            'underline',
            'strikethrough',
            'fontColor',
            'fontBackgroundColor',
            'highlight',
            '|',
            'alignment',
            'bulletedList',
            'numberedList',
            '|',
            'insertTable',
            'blockQuote',
            'horizontalLine',
            'link',
            '|',
            'removeFormat',
          ],
          table: {
            contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'],
          },
        }}
        onChange={(_event, editor) => {
          const data = editor.getData();
          onChange(data);
        }}
        onBlur={(_event) => {
          if (onBlur) {
            onBlur();
          }
        }}
      />
    </div>
  );
}

export default RichTextEditor;
