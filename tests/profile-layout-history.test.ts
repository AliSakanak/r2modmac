import assert from 'node:assert/strict';
import test from 'node:test';

import type { InstalledMod, ModFolder } from '../src/types/profile.ts';
import {
    applyLayout,
    EMPTY_LAYOUT_HISTORY,
    recordLayoutChange,
    redoLayout,
    sameLayout,
    snapshotLayout,
    undoLayout,
} from '../src/utils/profileLayoutHistory.ts';
import { createFolder, moveModsToFolder, renameFolder } from '../src/utils/profileModFolders.ts';

const mod = (uuid4: string, extra: Partial<InstalledMod> = {}): InstalledMod => ({
    uuid4,
    fullName: `Author-${uuid4}-1.0.0`,
    versionNumber: '1.0.0',
    enabled: true,
    ...extra,
});

test('undo puts a moved mod back, and redo moves it again', () => {
    const folders: ModFolder[] = [{ id: 'f', name: 'Tools', kind: 'normal' }];
    const before = [mod('a'), mod('b')];
    const after = moveModsToFolder(before, ['a'], 'f');
    let history = recordLayoutChange(EMPTY_LAYOUT_HISTORY, snapshotLayout(before, folders), snapshotLayout(after, folders));

    const back = undoLayout(history, snapshotLayout(after, folders));
    assert.ok(back.snapshot);
    history = back.history;
    const undone = applyLayout(after, folders, back.snapshot!);
    assert.equal(undone.mods[0].folderId, undefined);

    const again = redoLayout(history, snapshotLayout(undone.mods, undone.folders));
    assert.ok(again.snapshot);
    assert.equal(applyLayout(undone.mods, undone.folders, again.snapshot!).mods[0].folderId, 'f');
});

test('undo brings back a deleted folder with its mods, and a rename', () => {
    const created = createFolder([], 'normal', 'f');
    const named = renameFolder(created, 'f', 'Tools');
    const mods = moveModsToFolder([mod('a')], ['a'], 'f');
    const full = snapshotLayout(mods, named);

    // Delete the folder: the mod leaves it.
    const deleted = applyLayout(mods, named, { folders: [], folderOf: {} });
    const history = recordLayoutChange(EMPTY_LAYOUT_HISTORY, full, snapshotLayout(deleted.mods, deleted.folders));
    const back = undoLayout(history, snapshotLayout(deleted.mods, deleted.folders));
    const restored = applyLayout(deleted.mods, deleted.folders, back.snapshot!);
    assert.deepEqual(restored.folders, [{ id: 'f', name: 'Tools', kind: 'normal' }]);
    assert.equal(restored.mods[0].folderId, 'f');
});

test('undo never brings back a mod uninstalled since, or changes its state', () => {
    const folders: ModFolder[] = [{ id: 'f', name: 'Tools', kind: 'normal' }];
    const snapshot = snapshotLayout([mod('a', { folderId: 'f' }), mod('gone', { folderId: 'f' })], folders);
    const now = [mod('a', { enabled: false }), mod('new')];
    const result = applyLayout(now, folders, snapshot);
    assert.deepEqual(result.mods.map(m => m.uuid4), ['a', 'new']);
    assert.equal(result.mods[0].enabled, false, 'a toggle made since stays');
    assert.equal(result.mods[0].folderId, 'f');
    assert.equal(result.mods[1].folderId, undefined, 'a mod added since lands outside any folder');
});

test('opening or closing a folder is not an edit', () => {
    const open: ModFolder[] = [{ id: 'f', name: 'Tools', kind: 'normal' }];
    const closed: ModFolder[] = [{ id: 'f', name: 'Tools', kind: 'normal', collapsed: true }];
    assert.ok(sameLayout(snapshotLayout([], open), snapshotLayout([], closed)));
    assert.equal(recordLayoutChange(EMPTY_LAYOUT_HISTORY, snapshotLayout([], open), snapshotLayout([], closed)), EMPTY_LAYOUT_HISTORY);
    // And undo keeps each folder the way the user has it now.
    const restored = applyLayout([], closed, snapshotLayout([], open));
    assert.equal(restored.folders[0].collapsed, true);
});

test('a fresh edit drops what was undone', () => {
    const a = snapshotLayout([], []);
    const b = snapshotLayout([], [{ id: 'f', name: 'F', kind: 'normal' }]);
    const c = snapshotLayout([], [{ id: 'g', name: 'G', kind: 'normal' }]);
    let history = recordLayoutChange(EMPTY_LAYOUT_HISTORY, a, b);
    history = undoLayout(history, b).history;
    assert.equal(history.redo.length, 1);
    history = recordLayoutChange(history, a, c);
    assert.equal(history.redo.length, 0);
});

test('nothing to undo or redo changes nothing', () => {
    const current = snapshotLayout([], []);
    assert.equal(undoLayout(EMPTY_LAYOUT_HISTORY, current).snapshot, null);
    assert.equal(redoLayout(EMPTY_LAYOUT_HISTORY, current).snapshot, null);
});
