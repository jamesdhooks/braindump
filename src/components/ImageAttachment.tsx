import { useEffect, useState } from 'react';
import { X, ScanText, Loader2 } from 'lucide-react';
import { useStore } from '../store';
import type { Attachment } from '../types';
import { activeProviderIdForFeature } from './Settings/util';

export function ImageAttachment({ tabId, groupId, att }: { tabId: string; groupId: string; att: Attachment }) {
  const [src, setSrc] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const removeAttachment = useStore((s) => s.removeAttachment);
  const setAttachmentOcr = useStore((s) => s.setAttachmentOcr);
  const overrides = useStore((s) => s.featureProviderOverrides);
  const active = useStore((s) => s.activeProviderId);

  useEffect(() => {
    void window.braindump.attachments.read(att.path).then((d) => setSrc(d));
  }, [att.path]);

  async function runOcr() {
    setOcrBusy(true);
    try {
      const providerId = activeProviderIdForFeature('vision', overrides, active);
      const dataUrl = src ?? (await window.braindump.attachments.read(att.path));
      if (!dataUrl) return;
      const result = await window.braindump.llm.vision({
        providerId,
        imagePath: '',
        imageBase64: dataUrl,
        prompt:
          'Extract ALL legible text from the image, preserving line breaks. Also write a 1-sentence caption. Return ONLY JSON: { "text": string, "caption": string }.'
      });
      try {
        const j = JSON.parse(result) as { text: string; caption?: string };
        setAttachmentOcr(tabId, groupId, att.id, j.text, j.caption);
      } catch {
        setAttachmentOcr(tabId, groupId, att.id, result);
      }
    } finally {
      setOcrBusy(false);
    }
  }

  return (
    <>
      <div className="relative group/att inline-block">
        {src ? (
          <img
            src={src}
            alt={att.caption || 'attachment'}
            className="max-h-36 rounded border border-ink-700 cursor-zoom-in"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(true);
            }}
          />
        ) : (
          <div className="h-20 w-20 rounded bg-ink-800 animate-pulse" />
        )}
        {att.ocrText && (
          <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-ink-900/80 text-[10px] text-ink-300 rounded-b truncate">
            {att.caption || 'OCR available'}
          </div>
        )}
        <div className="absolute top-1 right-1 opacity-0 group-hover/att:opacity-100 flex gap-1">
          <button
            className="p-1 bg-ink-900/80 rounded hover:bg-ink-800 text-ink-300 hover:text-accent-400"
            title="OCR / caption"
            onClick={(e) => {
              e.stopPropagation();
              void runOcr();
            }}
          >
            {ocrBusy ? <Loader2 size={11} className="animate-spin" /> : <ScanText size={11} />}
          </button>
          <button
            className="p-1 bg-ink-900/80 rounded hover:bg-ink-800 text-ink-300 hover:text-red-400"
            title="Remove"
            onClick={(e) => {
              e.stopPropagation();
              removeAttachment(tabId, groupId, att.id);
            }}
          >
            <X size={11} />
          </button>
        </div>
      </div>
      {lightbox && src && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
          onClick={() => setLightbox(false)}
        >
          <img src={src} alt="" className="max-h-full max-w-full rounded" />
        </div>
      )}
    </>
  );
}
