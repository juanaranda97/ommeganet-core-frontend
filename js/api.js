// ============================================================
// OMMEGANET CORE — API Client
// ============================================================

class APIClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.token   = localStorage.getItem('access_token');
        this._wakeShown = false;
        // Multi-tenant: org activa (para impersonation)
        this.activeOrgId     = null;
        this.activeCompanyId = null;
    }

    setToken(token) {
        this.token = token;
        token ? localStorage.setItem('access_token', token)
              : localStorage.removeItem('access_token');
    }

    setActiveOrg(orgId, companyId = null) {
        this.activeOrgId     = orgId;
        this.activeCompanyId = companyId;
    }

    clearActiveOrg() {
        this.activeOrgId     = null;
        this.activeCompanyId = null;
    }

    _buildHeaders(extra = {}) {
        const h = { 'Content-Type': 'application/json', ...extra };
        if (this.token)          h['Authorization']  = `Bearer ${this.token}`;
        if (this.activeOrgId)    h['X-Org-Id']        = this.activeOrgId;
        if (this.activeCompanyId) h['X-Company-Id']   = this.activeCompanyId;
        return h;
    }

    _showWake() {
        if (this._wakeShown) return;
        this._wakeShown = true;
        const t = document.getElementById('wake-toast');
        if (t) t.classList.add('show');
    }

    _hideWake() {
        const t = document.getElementById('wake-toast');
        if (t) t.classList.remove('show');
        this._wakeShown = false;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const ctrl = new AbortController();
        const tOut = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
        const wakeT = setTimeout(() => this._showWake(), CONFIG.WAKE_TIMEOUT_MS);

        try {
            const resp = await fetch(url, {
                ...options,
                headers: this._buildHeaders(options.headers),
                signal: ctrl.signal,
            });
            clearTimeout(tOut); clearTimeout(wakeT); this._hideWake();

            if (resp.status === 401) {
                this.setToken(null); localStorage.removeItem('user');
                throw new Error('Sesión expirada');
            }

            const ct   = resp.headers.get('content-type') || '';
            const data = ct.includes('application/json') ? await resp.json() : null;

            if (!resp.ok) {
                const msg = data?.detail || data?.message || `Error ${resp.status}`;
                throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
            }
            return data;

        } catch (err) {
            clearTimeout(tOut); clearTimeout(wakeT); this._hideWake();
            if (err.name === 'AbortError')
                throw new Error('El servidor tardó demasiado. Intentá de nuevo.');
            if (err.name === 'TypeError' && err.message.includes('fetch'))
                throw new Error('No se pudo conectar con el servidor.');
            throw err;
        }
    }

    async requestFormData(endpoint, formData) {
        const url  = `${this.baseUrl}${endpoint}`;
        const ctrl = new AbortController();
        const tOut = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
        const wakeT = setTimeout(() => this._showWake(), CONFIG.WAKE_TIMEOUT_MS);

        const headers = {};
        if (this.token)           headers['Authorization']  = `Bearer ${this.token}`;
        if (this.activeOrgId)     headers['X-Org-Id']        = this.activeOrgId;
        if (this.activeCompanyId) headers['X-Company-Id']    = this.activeCompanyId;

        try {
            const resp = await fetch(url, { method:'POST', headers, body:formData, signal:ctrl.signal });
            clearTimeout(tOut); clearTimeout(wakeT); this._hideWake();
            if (resp.status === 401) { this.setToken(null); localStorage.removeItem('user'); throw new Error('Sesión expirada'); }
            const data = await resp.json().catch(() => null);
            if (!resp.ok) throw new Error(data?.detail || `Error ${resp.status}`);
            return data;
        } catch (err) {
            clearTimeout(tOut); clearTimeout(wakeT); this._hideWake();
            if (err.name === 'AbortError') throw new Error('Tiempo de espera agotado');
            throw err;
        }
    }

    // ============================================================
    // AUTH
    // ============================================================
    async login(email, password) {
        const d = await this.request('/auth/login', {
            method:'POST', body:JSON.stringify({email, password})
        });
        this.setToken(d.access_token);
        localStorage.setItem('user', JSON.stringify(d.user));
        return d;
    }
    async register(data) {
        const d = await this.request('/auth/register', { method:'POST', body:JSON.stringify(data) });
        this.setToken(d.access_token);
        localStorage.setItem('user', JSON.stringify(d.user));
        return d;
    }
    async logout() {
        try { await this.request('/auth/logout', { method:'POST' }); } catch {}
        this.setToken(null);
        localStorage.removeItem('user');
    }
    async getMe()           { return this.request('/auth/me'); }
    async getMyContext()    { return this.request('/auth/me/context'); }
    async updateMe(data)    { return this.request('/auth/me', { method:'PUT',   body:JSON.stringify(data) }); }

    // ============================================================
    // ORGANIZATIONS (multi-tenant)
    // ============================================================
    async getOrganizations()        { return this.request('/organizations/'); }
    async getOrganization(id)       { return this.request(`/organizations/${id}`); }
    async createOrganization(data)  { return this.request('/organizations/', { method:'POST', body:JSON.stringify(data) }); }
    async updateOrganization(id,d)  { return this.request(`/organizations/${id}`, { method:'PATCH', body:JSON.stringify(d) }); }
    async impersonateOrg(orgId, companyId = null, reason = '') {
        return this.request(`/organizations/${orgId}/impersonate`, {
            method:'POST',
            body:JSON.stringify({ organization_id:orgId, company_id:companyId, reason })
        });
    }

    // ============================================================
    // COMPANIES
    // ============================================================
    async getCompanies(orgId=null) {
        const qs = orgId ? `?organization_id=${orgId}` : '';
        return this.request(`/companies/${qs}`);
    }
    async getCompany(id)           { return this.request(`/companies/${id}`); }
    async createCompany(data)      { return this.request('/companies/', { method:'POST', body:JSON.stringify(data) }); }
    async updateCompany(id, data)  { return this.request(`/companies/${id}`, { method:'PATCH', body:JSON.stringify(data) }); }

    // ============================================================
    // TICKETS
    // ============================================================
    async createTicket(data)          { return this.request('/tickets/', { method:'POST', body:JSON.stringify(data) }); }
    async getMyTickets(f={})          { return this.request(`/tickets/my${qs(f)}`); }
    async getAllTickets(f={})         { return this.request(`/tickets/all${qs(f)}`); }
    async getTicket(id)               { return this.request(`/tickets/${id}`); }
    async updateTicket(id, data)      { return this.request(`/tickets/${id}`, { method:'PATCH', body:JSON.stringify(data) }); }
    async closeTicket(id, data)       { return this.request(`/tickets/${id}/close`, { method:'POST', body:JSON.stringify(data) }); }
    async getMyStats()                { return this.request('/tickets/stats/me'); }
    async getAllStats()               { return this.request('/tickets/stats/all'); }
    async uploadAttachment(tid, file, duration=null) {
        const fd = new FormData();
        fd.append('file', file);
        if (duration != null) fd.append('duration_seconds', duration);
        return this.requestFormData(`/tickets/${tid}/attachments`, fd);
    }
    async getAttachments(tid)         { return this.request(`/tickets/${tid}/attachments`); }
    async addComment(tid, comment, internal=false) {
        return this.request(`/tickets/${tid}/comments`, { method:'POST', body:JSON.stringify({comment, is_internal:internal}) });
    }
    async getComments(tid)            { return this.request(`/tickets/${tid}/comments`); }
    async submitSurvey(tid, data)     { return this.request(`/tickets/${tid}/survey`, { method:'POST', body:JSON.stringify(data) }); }

    // ============================================================
    // CATALOGUES
    // ============================================================
    async getCategories()              { return this.request('/categories/'); }
    async createCategory(data)         { return this.request('/categories/', { method:'POST', body:JSON.stringify(data) }); }
    async updateCategory(id, data)     { return this.request(`/categories/${id}`, { method:'PATCH', body:JSON.stringify(data) }); }
    async getLocations()               { return this.request('/locations/'); }
    async createLocation(data)         { return this.request('/locations/', { method:'POST', body:JSON.stringify(data) }); }

    // ============================================================
    // USERS
    // ============================================================
    async getUsers()                   { return this.request('/users/'); }
    async getTechnicians()             { return this.request('/users/technicians'); }
    async changeUserRole(uid, role)    { return this.request(`/users/${uid}/role`, { method:'PATCH', body:JSON.stringify({role}) }); }
    async toggleUserActive(uid)        { return this.request(`/users/${uid}/toggle-active`, { method:'PATCH' }); }

    // ============================================================
    // CONFIG
    // ============================================================
    async getConfig()                  { return this.request('/config/'); }
    async updateConfig(key, value)     { return this.request(`/config/${key}`, { method:'PATCH', body:JSON.stringify({key, value:String(value)}) }); }
    async bulkUpdateConfig(updates)    { return this.request('/config/bulk', { method:'POST', body:JSON.stringify(updates) }); }

    // ============================================================
    // NOTIFICATIONS
    // ============================================================
    async getNotifications()           { return this.request('/notifications/'); }
    async markRead(id)                 { return this.request(`/notifications/${id}/read`, { method:'PATCH' }); }
    async markAllRead()                { return this.request('/notifications/read-all', { method:'PATCH' }); }
}

function qs(filters) {
    const p = new URLSearchParams(
        Object.entries(filters).filter(([,v]) => v !== '' && v != null)
    );
    return p.toString() ? `?${p}` : '';
}

const api = new APIClient(CONFIG.API_URL);
