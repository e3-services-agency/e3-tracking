/**
 * Trigger images (T-4-24, item 6): a `triggers_json` entry keeps its original single `image_path`
 * (now always the first image, so older readers still work) and gains an additive ordered
 * `images: string[]`. Pure helper shared by the document builder, the backup collector, the HTML
 * export and the editor.
 */
export interface TriggerImageFields {
  image_path?: string | null;
  images?: unknown;
}

/** Ordered, de-duplicated, non-empty image paths of one trigger entry. */
export function triggerImages(entry: TriggerImageFields | null | undefined): string[] {
  if (!entry) return [];
  const out: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim() && !out.includes(value.trim())) out.push(value.trim());
  };
  if (Array.isArray(entry.images)) entry.images.forEach(add);
  add(entry.image_path);
  return out;
}

/** The two stored fields for an ordered image list: `image_path` mirrors the first image. */
export function triggerImageFields(images: string[]): { image_path: string | null; images: string[] } {
  return { image_path: images[0] ?? null, images };
}
