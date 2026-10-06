/** T-4-27: the app-wide Sheet presentation preference (side panel or centred modal). Pure helpers. */
export const SHEET_VIEWS = ['panel', 'modal'] as const;
export type SheetView = (typeof SHEET_VIEWS)[number];
export const SHEET_VIEW_KEY = 'e3.sheet.view';

export function parseSheetView(raw: unknown): SheetView {
  return raw === 'modal' ? 'modal' : 'panel';
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function readSheetView(storage: StorageLike | null | undefined): SheetView {
  try {
    return parseSheetView(storage?.getItem(SHEET_VIEW_KEY));
  } catch {
    return 'panel';
  }
}

export function writeSheetView(storage: StorageLike | null | undefined, view: SheetView): void {
  try {
    storage?.setItem(SHEET_VIEW_KEY, view);
  } catch {
    /* storage unavailable: the preference just is not remembered */
  }
}

export function toggleSheetView(view: SheetView): SheetView {
  return view === 'panel' ? 'modal' : 'panel';
}
