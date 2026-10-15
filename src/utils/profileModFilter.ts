export type ProfileModStatusFilter = 'all' | 'enabled' | 'disabled' | 'deprecated' | 'outdated';

export const PROFILE_MOD_STATUS_FILTERS: ReadonlyArray<{ value: ProfileModStatusFilter; label: string }> = [
    { value: 'all', label: 'All mods' },
    { value: 'enabled', label: 'Enabled' },
    { value: 'disabled', label: 'Disabled' },
    { value: 'deprecated', label: 'Deprecated' },
    { value: 'outdated', label: 'Updates' },
];

export function matchesProfileModStatus(
    filter: ProfileModStatusFilter,
    state: { enabled: boolean; deprecated: boolean; outdated: boolean },
): boolean {
    switch (filter) {
        case 'enabled': return state.enabled;
        case 'disabled': return !state.enabled;
        case 'deprecated': return state.deprecated;
        case 'outdated': return state.outdated;
        default: return true;
    }
}
