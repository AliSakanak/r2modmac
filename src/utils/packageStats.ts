/**
 * Package stats as a provider reported them, or null when it did not.
 *
 * Providers disagree on how to say "unknown": some leave the field out, some
 * send -1 (shown as "-1 downloads, -1 likes"), and a size of 0 bytes only ever
 * means nobody measured the file. The UI hides a stat it does not know rather
 * than printing a number that is wrong.
 */

export function knownCount(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** The first of the values that is a known count. */
export function firstKnownCount(...values: unknown[]): number | null {
    for (const value of values) {
        const count = knownCount(value);
        if (count !== null) return count;
    }
    return null;
}

export function knownSize(bytes: unknown): number | null {
    return typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0 ? bytes : null;
}
