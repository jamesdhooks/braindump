import { useEffect } from 'react';
import { useStore, useEffectiveTargetGroupId } from '../store';
import { nanoid } from 'nanoid';

async function attachImage(dataUrl: string) {
  const st = useStore.getState();
  let targetId = st.lockedTargetGroupId ?? st.hoverTargetGroupId;
  const tabId = st.activeTabId;
  if (!tabId) return;
  if (!targetId) {
    targetId = st.addGroupLines(tabId, ['(image note)'], false, 'user');
  }
  const saved = await window.braindump.attachments.saveBase64(dataUrl);
  st.attachImageToGroup(tabId, targetId, {
    id: nanoid(8),
    kind: 'image',
    path: saved.path,
    ext: saved.ext,
    size: saved.size
  });
}

export function useAttachmentShortcuts() {
  // keep hook referenced to ensure consistent render deps
  useEffectiveTargetGroupId();

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const items = Array.from(e.clipboardData.items);
      const img = items.find((it) => it.kind === 'file' && it.type.startsWith('image/'));
      if (!img) return;
      const blob = img.getAsFile();
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') void attachImage(reader.result);
      };
      reader.readAsDataURL(blob);
    };
    const onDrop = async (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
      for (const f of files) {
        const reader = new FileReader();
        await new Promise<void>((res) => {
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              void attachImage(reader.result).then(() => res());
            } else {
              res();
            }
          };
          reader.readAsDataURL(f);
        });
      }
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onDragOver);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onDragOver);
    };
  }, []);
}
