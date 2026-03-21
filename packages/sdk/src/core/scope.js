/**
 * PulsarJS — Scope Management
 * Isolated context per async boundary. Prevents PII and tag bleeding across operations.
 */
export class Scope {
    constructor() {
        this._breadcrumbs = [];
        this._tags = {};
        this._user = {};
        this._extra = {};
        this._maxBreadcrumbs = 100;
    }

    setTag(key, value) { this._tags[key] = value; return this; }
    setUser(user) { this._user = user; return this; }
    setExtra(key, value) { this._extra[key] = value; return this; }
    setMaxBreadcrumbs(max) { this._maxBreadcrumbs = max; return this; }

    addBreadcrumb(crumb) {
        this._breadcrumbs.push({
            timestamp: Date.now(),
            ...crumb
        });
        if (this._breadcrumbs.length > this._maxBreadcrumbs) {
            this._breadcrumbs = this._breadcrumbs.slice(-this._maxBreadcrumbs);
        }
        return this;
    }

    getScopeData() {
        return {
            user: this._user,
            tags: this._tags,
            extra: this._extra,
            breadcrumbs: this._breadcrumbs.map(crumb => ({
                ...crumb,
                timestamp: typeof crumb.timestamp === 'number'
                    ? new Date(crumb.timestamp).toISOString()
                    : crumb.timestamp
            }))
        };
    }

    clone() {
        const cloned = new Scope();
        cloned._breadcrumbs = [...this._breadcrumbs];
        cloned._tags = { ...this._tags };
        cloned._user = { ...this._user };
        cloned._extra = { ...this._extra };
        cloned._maxBreadcrumbs = this._maxBreadcrumbs;
        return cloned;
    }
}
