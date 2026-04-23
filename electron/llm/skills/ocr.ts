import { z } from 'zod';

export const OcrSchema = z.object({
  text: z.string(),
  caption: z.string().optional()
});

export const OCR_PROMPT =
  'Extract ALL legible text from the image, preserving line breaks. Also write a 1-sentence caption. Return ONLY JSON: { "text": string, "caption": string }.';
