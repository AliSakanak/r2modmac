import type { InstalledMod, ModFolder } from '../types/profile';

/**
 * Undo and redo for how a profile's sidebar is organised: its folders, their
 * names and order, and which mod sits in which folder.
 *
 * Only the arrangement is remembered, never the mods themselves. Undoing a
 * folder move must not bring back a mod uninstalled since, or switch a mod
 * back off, so a snapshot holds folder ids by mod and nothing else.
 */
export interface LayoutSnapshot {
    folders: ModFolder[];
    /** Mod uuid4 → folder id, for the mods that were in a folder. */
    folderOf: Record<string, string>;
}

export interface LayoutHistory {
    undo: LayoutSnapshot[];
    redo: LayoutSnapshot[];
}

export const EMPTY_LAYOUT_HISTORY: LayoutHistory = { undo: [], redo: [] };

/** How many steps back a session keeps, so it cannot grow without limit. */
const HISTORY_LIMIT = 100;

/**
 * Open or closed is how the user is looking at a folder, not an edit to it;
 * like a file manager, undo leaves it alone.
 */
const withoutViewState = (folders: readonly ModFolder[]): ModFolder[] =>
    folders.map(folder => {
        const { collapsed, ...rest } = folder;
        void collapsed;
        return rest;
    });

export function snapshotLayout(mods: readonly InstalledMod[], folders: readonly ModFolder[] | undefined): LayoutSnapshot {
    const folderOf: Record<string, string> = {};
    for (const mod of mods) {
        if (mod.folderId) folderOf[mod.uuid4] = mod.folderId;
    }
    return { folders: withoutViewState(folders ?? []), folderOf };
}

export function sameLayout(a: LayoutSnapshot, b: LayoutSnapshot): boolean {
    if (JSON.stringify(a.folders) !== JSON.stringify(b.folders)) return false;
    const aKeys = Object.keys(a.folderOf);
    if (aKeys.length !== Object.keys(b.folderOf).length) return false;
    return aKeys.every(key => a.folderOf[key] === b.folderOf[key]);
}

/** Remember the layout an edit replaced. A fresh edit drops anything undone. */
export function recordLayoutChange(history: LayoutHistory, before: LayoutSnapshot, after: LayoutSnapshot): LayoutHistory {
    if (sameLayout(before, after)) return history;
    return { undo: [...history.undo, before].slice(-HISTORY_LIMIT), redo: [] };
}

export function undoLayout(
    history: LayoutHistory,
    current: LayoutSnapshot,
): { history: LayoutHistory; snapshot: LayoutSnapshot | null } {
    const snapshot = history.undo[history.undo.length - 1];
    if (!snapshot) return { history, snapshot: null };
    return {
        history: { undo: history.undo.slice(0, -1), redo: [...history.redo, current] },
        snapshot,
    };
}

export function redoLayout(
    history: LayoutHistory,
    current: LayoutSnapshot,
): { history: LayoutHistory; snapshot: LayoutSnapshot | null } {
    const snapshot = history.redo[history.redo.length - 1];
    if (!snapshot) return { history, snapshot: null };
    return {
        history: { undo: [...history.undo, current], redo: history.redo.slice(0, -1) },
        snapshot,
    };
}

/**
 * Put a remembered layout back onto the profile as it is now. Mods added
 * since land outside any folder, mods removed since stay removed, and each
 * folder keeps whether the user has it open or closed today.
 */
export function applyLayout(
    mods: readonly InstalledMod[],
    currentFolders: readonly ModFolder[] | undefined,
    snapshot: LayoutSnapshot,
): { mods: InstalledMod[]; folders: ModFolder[] } {
    const collapsed = new Map((currentFolders ?? []).map(folder => [folder.id, folder.collapsed]));
    const folders = snapshot.folders.map(folder => {
        const isCollapsed = collapsed.get(folder.id);
        return isCollapsed === undefined ? folder : { ...folder, collapsed: isCollapsed };
    });
    const known = new Set(folders.map(folder => folder.id));
    return {
        folders,
        mods: mods.map(mod => {
            const folderId = snapshot.folderOf[mod.uuid4];
            if (folderId && known.has(folderId)) return mod.folderId === folderId ? mod : { ...mod, folderId };
            if (mod.folderId === undefined) return mod;
            const copy = { ...mod };
            delete copy.folderId;
            return copy;
        }),
    };
}
