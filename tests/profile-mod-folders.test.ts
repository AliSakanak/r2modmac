import assert from 'node:assert/strict';
import test from 'node:test';

import type { InstalledMod, ModFolder } from '../src/types/profile.ts';
import {
    buildSidebarRows,
    createFolder,
    folderSummary,
    foldersFromImport,
    ignoreMode,
    ignoreMoveNeedsApply,
    modsChangingIgnore,
    placeFolder,
    reanchorFolders,
    moveModsToFolder,
    nextFolderName,
    removeFolder,
    renameFolder,
    toggleFolderCollapsed,
} from '../src/utils/profileModFolders.ts';

const mod = (uuid4: string, extra: Partial<InstalledMod> = {}): InstalledMod => ({
    uuid4,
    fullName: `Author-${uuid4}-1.0.0`,
    versionNumber: '1.0.0',
    enabled: true,
    ...extra,
});

const tools: ModFolder = { id: 'f-tools', name: 'Tools', kind: 'normal' };
const ignore: ModFolder = { id: 'f-ignore', name: 'Ignore', kind: 'ignore' };

test('rows put the Ignore folder first, then folders, then loose mods', () => {
    const mods = [mod('a', { folderId: 'f-tools' }), mod('b'), mod('c', { folderId: 'f-ignore' })];
    const rows = buildSidebarRows(mods, mods, [tools, ignore], false);
    assert.deepEqual(
        rows.map(row => row.type === 'folder' ? `folder:${row.folder.name}` : `mod:${row.mod.uuid4}:${row.depth}`),
        ['folder:Ignore', 'mod:c:1', 'folder:Tools', 'mod:a:1', 'mod:b:0'],
    );
});

test('a closed folder hides its mods but still counts them', () => {
    const mods = [mod('a', { folderId: 'f-tools' }), mod('b', { folderId: 'f-tools', enabled: false })];
    const rows = buildSidebarRows(mods, mods, [{ ...tools, collapsed: true }], false);
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.equal(row.type, 'folder');
    if (row.type === 'folder') {
        assert.equal(row.expanded, false);
        assert.equal(row.total, 2);
        assert.equal(row.disabled, 1);
    }
});

test('an empty folder still shows until the list is filtered', () => {
    assert.equal(buildSidebarRows([], [], [tools], false).length, 1);
    assert.equal(buildSidebarRows([], [], [tools], true).length, 0);
});

test('filtering opens closed folders that hold a match', () => {
    const all = [mod('a', { folderId: 'f-tools' }), mod('b', { folderId: 'f-tools' })];
    const rows = buildSidebarRows([all[1]], all, [{ ...tools, collapsed: true }], true);
    assert.deepEqual(rows.map(row => row.type), ['folder', 'mod']);
    const [folderRow] = rows;
    if (folderRow.type === 'folder') assert.equal(folderRow.total, 2, 'the count covers the whole folder');
});

test('a mod pointing at a deleted folder shows as loose', () => {
    const mods = [mod('a', { folderId: 'gone' })];
    assert.deepEqual(buildSidebarRows(mods, mods, [tools], false).map(row => row.type), ['folder', 'mod']);
    const rows = buildSidebarRows(mods, mods, [], false);
    assert.equal(rows[0].type === 'mod' && rows[0].depth, 0);
});

test('Ignore links custom mods with a source folder and freezes everything else', () => {
    const folders = [ignore, tools];
    const inIgnore = { folderId: 'f-ignore' };
    assert.equal(ignoreMode(mod('dev', { ...inIgnore, source: 'local', sourcePath: '/dev/MyMod' }), folders), 'linked');
    assert.equal(ignoreMode(mod('zip', { ...inIgnore, source: 'local' }), folders), 'frozen');
    for (const source of ['thunderstore', 'hexium', 'outerwilds'] as const) {
        assert.equal(ignoreMode(mod(source, { ...inIgnore, source }), folders), 'frozen', source);
    }
    assert.equal(ignoreMode(mod('ts'), folders), null);
    assert.equal(ignoreMode(mod('ts', { folderId: 'f-tools' }), folders), null);
});

test('a profile gets at most one Ignore folder', () => {
    const once = createFolder([], 'ignore', 'i1');
    const twice = createFolder(once, 'ignore', 'i2');
    assert.deepEqual(twice, [{ id: 'i1', name: 'Ignore', kind: 'ignore' }]);
});

test('new folders take the first free name', () => {
    let folders = createFolder([], 'normal', 'a');
    folders = createFolder(folders, 'normal', 'b');
    assert.deepEqual(folders.map(folder => folder.name), ['New folder', 'New folder 2']);
    assert.equal(nextFolderName([{ id: 'x', name: 'new FOLDER', kind: 'normal' }]), 'New folder 2');
});

test('renaming trims, and a blank name changes nothing', () => {
    assert.equal(renameFolder([tools], 'f-tools', '  Utility  ')[0].name, 'Utility');
    assert.equal(renameFolder([tools], 'f-tools', '   ')[0].name, 'Tools');
});

test('collapsing toggles only the folder asked for', () => {
    const folders = toggleFolderCollapsed([tools, ignore], 'f-tools');
    assert.equal(folders[0].collapsed, true);
    assert.equal(folders[1].collapsed, undefined);
});

test('moving mods in and out of a folder', () => {
    const mods = [mod('a'), mod('b'), mod('c', { folderId: 'f-tools' })];
    const moved = moveModsToFolder(mods, ['a', 'b'], 'f-tools');
    assert.deepEqual(moved.map(m => m.folderId), ['f-tools', 'f-tools', 'f-tools']);
    const out = moveModsToFolder(moved, ['c'], null);
    assert.equal('folderId' in out[2], false, 'leaving a folder drops the field');
    assert.strictEqual(moveModsToFolder(mods, ['c'], 'f-tools')[2], mods[2], 'unchanged mods keep their identity');
});

test('removing a folder keeps its mods in the profile', () => {
    const mods = [mod('a', { folderId: 'f-tools' }), mod('b', { folderId: 'f-ignore' })];
    const result = removeFolder(mods, [tools, ignore], 'f-tools');
    assert.deepEqual(result.folders, [ignore]);
    assert.equal(result.mods.length, 2);
    assert.equal(result.mods[0].folderId, undefined);
    assert.equal(result.mods[1].folderId, 'f-ignore');
});

test('only moves across the Ignore boundary change how Apply treats a mod', () => {
    const folders = [tools, ignore];
    const mods = [mod('a'), mod('b', { folderId: 'f-ignore' }), mod('c', { folderId: 'f-tools' })];
    assert.deepEqual(modsChangingIgnore(mods, ['a', 'c'], folders, 'f-tools').map(m => m.uuid4), []);
    assert.deepEqual(modsChangingIgnore(mods, ['a', 'b'], folders, 'f-ignore').map(m => m.uuid4), ['a']);
    assert.deepEqual(modsChangingIgnore(mods, ['b', 'c'], folders, null).map(m => m.uuid4), ['b']);
});

test('folder summaries read naturally', () => {
    assert.equal(folderSummary(1, 0), '1 mod');
    assert.equal(folderSummary(4, 1), '4 mods · 1 disabled');
});

test('imported folders come back as ordinary folders on the matching mods', () => {
    let next = 0;
    const mods = [mod('a'), mod('b'), mod('c')];
    const exportName = (m: InstalledMod) => m.fullName.replace(/-1\.0\.0$/, '');
    const result = foldersFromImport(
        [
            { name: 'Tools', kind: 'normal', mods: ['Author-a', 'author-B'] },
            { name: 'Ignore', kind: 'ignore', mods: ['Author-c'] },
            { name: '', kind: 'normal', mods: ['Author-c'] },
        ],
        mods,
        exportName,
        () => `id${++next}`,
    );
    assert.deepEqual(result.folders, [
        { id: 'id1', name: 'Tools', kind: 'normal' },
        { id: 'id2', name: 'Ignore', kind: 'normal' },
    ]);
    assert.deepEqual(result.mods.map(m => m.folderId), ['id1', 'id1', 'id2']);
});

test('an export without folders (r2modman) imports flat', () => {
    const mods = [mod('a', { folderId: 'stale' })];
    const result = foldersFromImport(undefined, mods, m => m.fullName, () => 'x');
    assert.deepEqual(result.folders, []);
    assert.equal(result.mods[0].folderId, undefined);
});

const order = (mods: InstalledMod[], folders: ModFolder[]) =>
    buildSidebarRows(mods, mods, folders, false)
        .filter(row => row.type === 'folder' || row.depth === 0)
        .map(row => row.type === 'folder' ? row.folder.id : row.mod.uuid4);

test('a folder can sit anywhere among the loose mods, and Ignore stays on top', () => {
    const a: ModFolder = { id: 'A', name: 'A', kind: 'normal' };
    const b: ModFolder = { id: 'B', name: 'B', kind: 'normal' };
    const mods = [mod('m1'), mod('m2'), mod('m3')];
    let folders: ModFolder[] = [ignore, a, b];
    assert.deepEqual(order(mods, folders), ['f-ignore', 'A', 'B', 'm1', 'm2', 'm3']);

    folders = placeFolder(folders, mods, 'A', { kind: 'mod', modId: 'm2', position: 'before' });
    assert.deepEqual(order(mods, folders), ['f-ignore', 'B', 'm1', 'A', 'm2', 'm3']);

    folders = placeFolder(folders, mods, 'B', { kind: 'mod', modId: 'm1', position: 'after' });
    assert.deepEqual(order(mods, folders), ['f-ignore', 'm1', 'B', 'A', 'm2', 'm3'], 'right after m1, before A');

    folders = placeFolder(folders, mods, 'A', { kind: 'mod', modId: 'm3', position: 'after' });
    assert.deepEqual(order(mods, folders), ['f-ignore', 'm1', 'B', 'm2', 'm3', 'A']);

    folders = placeFolder(folders, mods, 'A', { kind: 'folder', folderId: 'B', position: 'before' });
    assert.deepEqual(order(mods, folders), ['f-ignore', 'm1', 'A', 'B', 'm2', 'm3']);

    folders = placeFolder(folders, mods, 'B', { kind: 'end' });
    assert.deepEqual(order(mods, folders), ['f-ignore', 'm1', 'A', 'm2', 'm3', 'B']);

    folders = placeFolder(folders, mods, 'B', { kind: 'folder', folderId: 'f-ignore', position: 'after' });
    assert.deepEqual(order(mods, folders), ['f-ignore', 'B', 'm1', 'A', 'm2', 'm3'], 'dropped on Ignore: right below it');

    assert.deepEqual(placeFolder(folders, mods, 'f-ignore', { kind: 'end' }), folders, 'Ignore cannot move');
    assert.deepEqual(placeFolder(folders, mods, 'A', { kind: 'folder', folderId: 'A', position: 'after' }), folders);
});

test('a folder keeps its place when the mod it sat before goes into a folder', () => {
    const a: ModFolder = { id: 'A', name: 'A', kind: 'normal', anchor: 'm2' };
    const b: ModFolder = { id: 'B', name: 'B', kind: 'normal' };
    const before = [mod('m1'), mod('m2'), mod('m3')];
    const after = moveModsToFolder(before, ['m2'], 'B');
    const folders = reanchorFolders([a, b], before, after);
    assert.equal(folders[0].anchor, 'm3');
    assert.deepEqual(order(after, folders), ['B', 'm1', 'A', 'm3']);

    const last = reanchorFolders([{ ...a, anchor: 'm3' }, b], before, moveModsToFolder(before, ['m3'], 'B'));
    assert.equal(last[0].anchor, null, 'no loose mod left after it: the end');
});

test('a folder whose mod was uninstalled falls to the end instead of vanishing', () => {
    const a: ModFolder = { id: 'A', name: 'A', kind: 'normal', anchor: 'gone' };
    assert.deepEqual(order([mod('m1')], [a]), ['m1', 'A']);
});

test('only a linked custom mod needs an Apply when it crosses the Ignore boundary', () => {
    assert.equal(ignoreMoveNeedsApply(mod('dev', { source: 'local', sourcePath: '/dev/Dev' })), true);
    assert.equal(ignoreMoveNeedsApply(mod('zip', { source: 'local' })), false);
    for (const source of ['thunderstore', 'hexium', 'outerwilds'] as const) {
        assert.equal(ignoreMoveNeedsApply(mod(source, { source })), false, source);
    }
});
