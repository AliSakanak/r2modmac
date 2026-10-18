import type { InstalledMod, ModFolder, ModFolderKind } from '../types/profile';

/**
 * Sidebar folders for a profile's mods.
 *
 * Folders exist only in the profile (`modFolders`, and `folderId` on each
 * mod): nothing is created on disk. Everything here is pure so the sidebar,
 * Apply and export/import read one set of rules.
 */

export type SidebarRow =
    | {
        type: 'folder';
        folder: ModFolder;
        /** The folder's mods that pass the current search and filter. */
        mods: InstalledMod[];
        /** Every mod in the folder, filtered or not. */
        total: number;
        disabled: number;
        expanded: boolean;
    }
    | { type: 'mod'; mod: InstalledMod; depth: 0 | 1; folderId?: string };

export type IgnoreMode = 'linked' | 'frozen';

export const DEFAULT_FOLDER_NAME = 'New folder';
export const IGNORE_FOLDER_NAME = 'Ignore';

/** The folder a mod sits in, if that folder still exists. */
export function folderOf(mod: InstalledMod, folders: readonly ModFolder[] | undefined): ModFolder | undefined {
    if (!mod.folderId) return undefined;
    return folders?.find(folder => folder.id === mod.folderId);
}

export function ignoreFolder(folders: readonly ModFolder[] | undefined): ModFolder | undefined {
    return folders?.find(folder => folder.kind === 'ignore');
}

/**
 * How Apply treats a mod in the Ignore folder: a custom mod imported from a
 * folder is linked to that folder, so edits show up without another Apply;
 * any other mod, from any provider, is frozen as it is in the game.
 */
export function ignoreMode(mod: InstalledMod, folders: readonly ModFolder[] | undefined): IgnoreMode | null {
    if (folderOf(mod, folders)?.kind !== 'ignore') return null;
    return mod.source === 'local' && !!mod.sourcePath?.trim() ? 'linked' : 'frozen';
}

/**
 * Whether moving this mod into or out of the Ignore folder changes the game
 * folder. Only a custom mod imported from a folder does: Apply swaps its copy
 * for a link or back. Any other mod is left exactly as it is either way.
 */
export function ignoreMoveNeedsApply(mod: InstalledMod): boolean {
    return mod.source === 'local' && !!mod.sourcePath?.trim();
}

/** `New folder`, then `New folder 2`, `New folder 3`… whichever is free. */
export function nextFolderName(folders: readonly ModFolder[], base = DEFAULT_FOLDER_NAME): string {
    const taken = new Set(folders.map(folder => folder.name.trim().toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) {
        const name = `${base} ${n}`;
        if (!taken.has(name.toLowerCase())) return name;
    }
}

/** Add a folder. A profile has at most one Ignore folder; asking for a second changes nothing. */
export function createFolder(folders: readonly ModFolder[], kind: ModFolderKind, id: string): ModFolder[] {
    if (kind === 'ignore' && ignoreFolder(folders)) return [...folders];
    const name = kind === 'ignore' ? IGNORE_FOLDER_NAME : nextFolderName(folders);
    return [...folders, { id, name, kind }];
}

export function renameFolder(folders: readonly ModFolder[], id: string, name: string): ModFolder[] {
    const trimmed = name.trim();
    if (!trimmed) return [...folders];
    return folders.map(folder => folder.id === id ? { ...folder, name: trimmed } : folder);
}

export function toggleFolderCollapsed(folders: readonly ModFolder[], id: string): ModFolder[] {
    return folders.map(folder => folder.id === id ? { ...folder, collapsed: !folder.collapsed } : folder);
}

/** Where a dragged folder lands: next to a folder, next to a loose mod, or at the end. */
export type FolderDrop =
    | { kind: 'folder'; folderId: string; position: 'before' | 'after' }
    | { kind: 'mod'; modId: string; position: 'before' | 'after' }
    | { kind: 'end' };

/** The mods outside any (existing) folder, in profile order. */
function looseMods(mods: readonly InstalledMod[], folders: readonly ModFolder[]): InstalledMod[] {
    const known = new Set(folders.map(folder => folder.id));
    return mods.filter(mod => !mod.folderId || !known.has(mod.folderId));
}

/**
 * Move a folder anywhere in the list. A folder sits just before the loose mod
 * named by its `anchor`, at the top when it has none, or at the end with
 * `null`; folders sharing an anchor keep their order. The Ignore folder
 * always stays on top: it cannot be moved, and dropping on it puts the folder
 * right below it.
 */
export function placeFolder(
    folders: readonly ModFolder[],
    mods: readonly InstalledMod[],
    id: string,
    drop: FolderDrop,
): ModFolder[] {
    const moving = folders.find(folder => folder.id === id);
    if (!moving || moving.kind === 'ignore') return [...folders];
    if (drop.kind === 'folder' && drop.folderId === id) return [...folders];
    const rest = folders.filter(folder => folder.id !== id);
    const insertAt = (index: number, anchor: string | null | undefined) => {
        const placed: ModFolder = { ...moving };
        if (anchor === undefined) delete placed.anchor;
        else placed.anchor = anchor;
        rest.splice(index === -1 ? rest.length : index, 0, placed);
        return rest;
    };
    const firstWithAnchor = (anchor: string | null | undefined) =>
        rest.findIndex(folder => folder.kind !== 'ignore' && folder.anchor === anchor);

    if (drop.kind === 'end') return insertAt(-1, null);
    if (drop.kind === 'folder') {
        const target = rest.find(folder => folder.id === drop.folderId);
        if (!target) return [...folders];
        if (target.kind === 'ignore') return insertAt(firstWithAnchor(undefined), undefined);
        const index = rest.indexOf(target);
        return insertAt(drop.position === 'before' ? index : index + 1, target.anchor);
    }
    // Before a loose mod: last among the folders already waiting before it.
    if (drop.position === 'before') return insertAt(-1, drop.modId);
    // After a loose mod: first among the folders waiting before the next one.
    const loose = looseMods(mods, folders);
    const next = loose[loose.findIndex(mod => mod.uuid4 === drop.modId) + 1];
    const anchor = next ? next.uuid4 : null;
    return insertAt(firstWithAnchor(anchor), anchor);
}

/**
 * Keep folders where they were when the mod they sit before goes into a
 * folder: they move on to the next mod that is still loose, or to the end.
 */
export function reanchorFolders(
    folders: readonly ModFolder[],
    oldMods: readonly InstalledMod[],
    newMods: readonly InstalledMod[],
): ModFolder[] {
    const stillLoose = new Set(looseMods(newMods, folders).map(mod => mod.uuid4));
    return folders.map(folder => {
        if (typeof folder.anchor !== 'string' || stillLoose.has(folder.anchor)) return folder;
        const from = oldMods.findIndex(mod => mod.uuid4 === folder.anchor);
        if (from === -1) return folder;
        const next = oldMods.slice(from + 1).find(mod => stillLoose.has(mod.uuid4));
        return { ...folder, anchor: next ? next.uuid4 : null };
    });
}

/** Remove a folder; its mods stay in the profile, outside any folder. */
export function removeFolder(
    mods: readonly InstalledMod[],
    folders: readonly ModFolder[],
    id: string,
): { mods: InstalledMod[]; folders: ModFolder[] } {
    return {
        mods: mods.map(mod => mod.folderId === id ? withoutFolder(mod) : mod),
        folders: folders.filter(folder => folder.id !== id),
    };
}

/** Put mods in a folder, or take them out of any folder with `null`. */
export function moveModsToFolder(
    mods: readonly InstalledMod[],
    modIds: readonly string[],
    folderId: string | null,
): InstalledMod[] {
    const moving = new Set(modIds);
    return mods.map(mod => {
        if (!moving.has(mod.uuid4)) return mod;
        if (folderId === null) return withoutFolder(mod);
        return mod.folderId === folderId ? mod : { ...mod, folderId };
    });
}

/** Mods whose Ignore membership changes when moved to `folderId`. */
export function modsChangingIgnore(
    mods: readonly InstalledMod[],
    modIds: readonly string[],
    folders: readonly ModFolder[],
    folderId: string | null,
): InstalledMod[] {
    const target = folderId ? folders.find(folder => folder.id === folderId) : undefined;
    const intoIgnore = target?.kind === 'ignore';
    const moving = new Set(modIds);
    return mods.filter(mod => moving.has(mod.uuid4) && (folderOf(mod, folders)?.kind === 'ignore') !== intoIgnore);
}

export function modsInFolder(mods: readonly InstalledMod[], folders: readonly ModFolder[], id: string): InstalledMod[] {
    return mods.filter(mod => folderOf(mod, folders)?.id === id);
}

/**
 * The rows the sidebar draws: the Ignore folder first, then every other
 * folder where the user put it among the mods outside any folder.
 *
 * `visibleMods` are the mods that pass the search and filter, in profile
 * order; `allMods` are every mod in the profile, which fixes where folders
 * sit and gives their counts. While the list is filtered, folders with no
 * match disappear and the rest open, so a match is never hidden inside a
 * closed folder.
 */
export function buildSidebarRows(
    visibleMods: readonly InstalledMod[],
    allMods: readonly InstalledMod[],
    folders: readonly ModFolder[] | undefined,
    filtering: boolean,
): SidebarRow[] {
    const all = folders ?? [];
    const loose = looseMods(allMods, all);
    const looseIds = new Set(loose.map(mod => mod.uuid4));
    const visible = new Set(visibleMods.map(mod => mod.uuid4));
    const rows: SidebarRow[] = [];

    const pushFolder = (folder: ModFolder) => {
        const inFolder = visibleMods.filter(mod => mod.folderId === folder.id);
        if (filtering && inFolder.length === 0) return;
        const everyMod = allMods.filter(mod => mod.folderId === folder.id);
        const expanded = filtering || !folder.collapsed;
        rows.push({
            type: 'folder',
            folder,
            mods: inFolder,
            total: everyMod.length,
            disabled: everyMod.filter(mod => !mod.enabled).length,
            expanded,
        });
        if (expanded) {
            for (const mod of inFolder) rows.push({ type: 'mod', mod, depth: 1, folderId: folder.id });
        }
    };

    const normal = all.filter(folder => folder.kind !== 'ignore');
    all.filter(folder => folder.kind === 'ignore').forEach(pushFolder);
    normal.filter(folder => folder.anchor === undefined).forEach(pushFolder);
    for (const mod of loose) {
        normal.filter(folder => folder.anchor === mod.uuid4).forEach(pushFolder);
        if (visible.has(mod.uuid4)) rows.push({ type: 'mod', mod, depth: 0 });
    }
    // At the end on purpose, or because the mod a folder sat before is gone.
    normal
        .filter(folder => folder.anchor === null || (typeof folder.anchor === 'string' && !looseIds.has(folder.anchor)))
        .forEach(pushFolder);
    return rows;
}

/** A short summary for a folder row: `4 mods · 1 disabled`. */
export function folderSummary(total: number, disabled: number): string {
    const mods = `${total} ${total === 1 ? 'mod' : 'mods'}`;
    return disabled > 0 ? `${mods} · ${disabled} disabled` : mods;
}

/** A mod's name in an export: `Author-Name`, without the version. */
export function exportModName(mod: InstalledMod): string {
    const suffix = `-${mod.versionNumber}`;
    return mod.fullName.endsWith(suffix) ? mod.fullName.slice(0, -suffix.length) : mod.fullName;
}

/**
 * Folders as they travel in an export: by name and kind, listing the export
 * names of their mods, since ids mean nothing on another machine.
 */
export interface ExportedFolder {
    name: string;
    kind: ModFolderKind;
    mods: string[];
}

/**
 * Rebuild folders from an import. The Ignore folder pointed at the exporter's
 * disk, so it arrives as an ordinary folder with the same name.
 */
export function foldersFromImport(
    exported: readonly ExportedFolder[] | undefined,
    mods: readonly InstalledMod[],
    exportNameOf: (mod: InstalledMod) => string,
    newId: () => string,
): { mods: InstalledMod[]; folders: ModFolder[] } {
    const folders: ModFolder[] = [];
    const folderByMod = new Map<string, string>();
    for (const entry of exported ?? []) {
        const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
        if (!name || !Array.isArray(entry.mods)) continue;
        const id = newId();
        folders.push({ id, name, kind: 'normal' });
        for (const modName of entry.mods) {
            if (typeof modName === 'string' && !folderByMod.has(modName.toLowerCase())) {
                folderByMod.set(modName.toLowerCase(), id);
            }
        }
    }
    return {
        folders,
        mods: mods.map(mod => {
            const id = folderByMod.get(exportNameOf(mod).toLowerCase());
            return id ? { ...mod, folderId: id } : withoutFolder(mod);
        }),
    };
}

function withoutFolder(mod: InstalledMod): InstalledMod {
    if (mod.folderId === undefined) return mod;
    const copy = { ...mod };
    delete copy.folderId;
    return copy;
}
