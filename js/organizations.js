// ============================================================
// OMMEGANET CORE — Módulo Organizaciones (multi-tenant)
// ============================================================

const Orgs = {
    list: [],
    companiesByOrg: {},   // cache de empresas por org
    view: localStorage.getItem('orgs_view') || 'cards',  // 'cards' | 'table'
    editingId: null,

    // ============================================================
    // CARGA
    // ============================================================
    async load() {
        const container = document.getElementById('orgs-container');
        if (container) container.innerHTML = this._skeleton();

        try {
            this.list = await api.getOrganizations() || [];
        } catch (e) {
            if (container) container.innerHTML = `<div class="empty"><h3>No se pudieron cargar</h3><p>${escHtml(e.message)}</p></div>`;
            return;
        }

        this._renderHeader();
        this.render();
    },

    setView(v) {
        this.view = v;
        localStorage.setItem('orgs_view', v);
        document.querySelectorAll('.orgs-view-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.view === v));
        this.render();
    },

    // ============================================================
    // HEADER (contador + toggle de vista)
    // ============================================================
    _renderHeader() {
        const totalCompanies = this.list.reduce((s, o) => s + (o.company_count || 0), 0);
        const head = document.getElementById('orgs-head');
        if (!head) return;
        head.innerHTML = `
            <div>
                <h1>Organizaciones</h1>
                <div class="page-sub">${this.list.length} organizaciones · ${totalCompanies} empresas</div>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
                <div class="orgs-view-toggle">
                    <button class="orgs-view-btn ${this.view==='cards'?'active':''}" data-view="cards" onclick="Orgs.setView('cards')" title="Tarjetas">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                    </button>
                    <button class="orgs-view-btn ${this.view==='table'?'active':''}" data-view="table" onclick="Orgs.setView('table')" title="Tabla">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                    </button>
                </div>
                <button class="btn btn-primary" onclick="Orgs.openCreate()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Nueva organización
                </button>
            </div>`;
    },

    // ============================================================
    // RENDER (según vista elegida)
    // ============================================================
    render() {
        const container = document.getElementById('orgs-container');
        if (!container) return;
        if (!this.list.length) {
            container.innerHTML = `<div class="empty"><h3>Sin organizaciones</h3><p>Creá la primera para empezar.</p></div>`;
            return;
        }
        container.innerHTML = this.view === 'cards' ? this._renderCards() : this._renderTable();
    },

    _typeInfo(org) {
        if (org.org_type === 'platform') return { label:'plataforma', cls:'cyan',   icon:'building' };
        if (org.is_group)                return { label:'grupo',      cls:'violet', icon:'group' };
        return { label:'cliente', cls:'green', icon:'building' };
    },

    _iconSvg(name) {
        const icons = {
            building: '<path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/>',
            group: '<path d="M3 21h18M9 8h1m-1 4h1m-1 4h1m4-8h1m-1 4h1m-1 4h1M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/>',
        };
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${icons[name]||icons.building}</svg>`;
    },

    _renderCards() {
        const cards = this.list.map(org => {
            const t = this._typeInfo(org);
            return `
            <div class="org-card" onclick="Orgs.openDetail('${org.id}')">
                <div class="org-card-head">
                    <div class="org-icon org-icon-${t.cls}">${this._iconSvg(t.icon)}</div>
                    <div class="org-card-title">
                        <div class="org-name">${escHtml(org.name)}</div>
                        <span class="badge badge-${t.cls}">${t.label}</span>
                    </div>
                </div>
                <div class="org-stats">
                    <span><strong>${org.company_count ?? 0}</strong> ${(org.company_count===1)?'empresa':'empresas'}</span>
                    <span><strong>${org.user_count ?? 0}</strong> usuarios</span>
                </div>
                <button class="btn btn-ghost btn-full btn-sm org-enter" onclick="event.stopPropagation(); Orgs.enter('${org.id}','${escHtml(org.name)}')">
                    Entrar →
                </button>
            </div>`;
        }).join('');
        return `<div class="orgs-grid">${cards}</div>`;
    },

    _renderTable() {
        const rows = this.list.map(org => {
            const t = this._typeInfo(org);
            return `
            <tr onclick="Orgs.openDetail('${org.id}')">
                <td style="font-weight:600;">${escHtml(org.name)}</td>
                <td><span class="badge badge-${t.cls}">${t.label}</span></td>
                <td style="text-align:center;">${org.company_count ?? 0}</td>
                <td style="text-align:center;">${org.user_count ?? 0}</td>
                <td style="text-align:right;">
                    <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); Orgs.enter('${org.id}','${escHtml(org.name)}')">Entrar →</button>
                </td>
            </tr>`;
        }).join('');
        return `
        <div class="card" style="padding:0;">
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Organización</th><th>Tipo</th><th style="text-align:center;">Empresas</th><th style="text-align:center;">Usuarios</th><th></th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
    },

    // ============================================================
    // DETALLE (panel con empresas)
    // ============================================================
    async openDetail(orgId) {
        const org = this.list.find(o => o.id === orgId);
        if (!org) return;
        const t = this._typeInfo(org);

        document.getElementById('modal-org-title').innerHTML = `
            <div class="org-icon org-icon-${t.cls}" style="width:30px;height:30px;">${this._iconSvg(t.icon)}</div>
            ${escHtml(org.name)}`;

        const body = document.getElementById('modal-org-body');
        body.innerHTML = `
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px;">
                <span class="badge badge-${t.cls}">${t.label}</span>
                <span class="badge badge-violet">${org.plan || 'free'}</span>
                <span class="badge ${org.is_active!==false?'badge-green':'badge-red'}">${org.is_active!==false?'activa':'suspendida'}</span>
            </div>
            <div class="org-detail-stats">
                <div class="ods-item"><div class="ods-num">${org.company_count ?? 0}</div><div class="ods-lbl">Empresas</div></div>
                <div class="ods-item"><div class="ods-num">${org.user_count ?? 0}</div><div class="ods-lbl">Usuarios</div></div>
                <div class="ods-item"><div class="ods-num">${org.active_user_count ?? org.user_count ?? 0}</div><div class="ods-lbl">Activos</div></div>
            </div>
            <h4 style="margin:20px 0 10px;">Empresas</h4>
            <div id="org-companies-list"><div class="loading-inline">Cargando empresas...</div></div>`;

        // Footer con acciones
        document.getElementById('modal-org-footer').innerHTML = `
            <button class="btn btn-ghost" onclick="Orgs.openEdit('${org.id}')">Editar</button>
            <button class="btn btn-primary" onclick="Orgs.enter('${org.id}','${escHtml(org.name)}')">Entrar a esta organización →</button>`;

        openModal('modal-org');

        // Cargar empresas
        try {
            const companies = this.companiesByOrg[orgId] || await api.getCompanies(orgId);
            this.companiesByOrg[orgId] = companies;
            const el = document.getElementById('org-companies-list');
            if (!companies.length) {
                el.innerHTML = `<div class="empty" style="padding:20px;"><p>Esta organización no tiene empresas cargadas.</p></div>`;
            } else {
                el.innerHTML = companies.map(c => `
                    <div class="company-row">
                        <div class="company-icon">${(c.name||'?').charAt(0).toUpperCase()}</div>
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:13px; font-weight:600;">${escHtml(c.name)}</div>
                            ${c.industry ? `<div style="font-size:11px; color:var(--text-2);">${escHtml(c.industry)}</div>` : ''}
                        </div>
                        <span style="font-size:11px; color:var(--text-2); font-family:var(--font-mono);">${c.user_count ?? 0} users</span>
                    </div>`).join('');
            }
        } catch (e) {
            const el = document.getElementById('org-companies-list');
            if (el) el.innerHTML = `<div class="empty" style="padding:20px;"><p>Error cargando empresas: ${escHtml(e.message)}</p></div>`;
        }
    },

    // ============================================================
    // IMPERSONATION (Entrar a una org)
    // ============================================================
    async enter(orgId, orgName) {
        const org = this.list.find(o => o.id === orgId);
        // Si es la propia org de plataforma del usuario, no hace falta impersonar
        try {
            await api.impersonateOrg(orgId, null, 'Acceso desde panel de organizaciones');
            api.setActiveOrg(orgId, null);
            localStorage.setItem('impersonating', JSON.stringify({ id: orgId, name: orgName }));
            closeModal('modal-org');
            App.showImpersonationBanner(orgName);
            toast(`Entraste a ${orgName}`, 'success');
            // Recargar el dashboard con el nuevo contexto
            switchView('dashboard');
            App.loadDashboard();
        } catch (e) {
            toast('No se pudo entrar: ' + e.message, 'error');
        }
    },

    // ============================================================
    // CREAR / EDITAR
    // ============================================================
    openCreate() {
        this.editingId = null;
        document.getElementById('modal-org-form-title').textContent = 'Nueva organización';
        document.getElementById('org-form').reset();
        document.getElementById('org-f-type').value = 'cliente';
        openModal('modal-org-form');
    },

    openEdit(orgId) {
        const org = this.list.find(o => o.id === orgId);
        if (!org) return;
        this.editingId = orgId;
        document.getElementById('modal-org-form-title').textContent = 'Editar organización';
        const f = document.getElementById('org-form');
        f.reset();
        document.getElementById('org-f-name').value = org.name || '';
        document.getElementById('org-f-slug').value = org.slug || '';
        document.getElementById('org-f-type').value = org.org_type || 'cliente';
        document.getElementById('org-f-plan').value = org.plan || 'free';
        closeModal('modal-org');
        openModal('modal-org-form');
    },

    async save() {
        const name = document.getElementById('org-f-name').value.trim();
        const slug = document.getElementById('org-f-slug').value.trim() ||
                     name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (name.length < 2) { toast('El nombre es muy corto', 'warning'); return; }

        const data = {
            name,
            slug,
            org_type: document.getElementById('org-f-type').value,
            plan: document.getElementById('org-f-plan').value,
            is_group: document.getElementById('org-f-type').value === 'grupo',
        };
        // El backend espera org_type 'cliente'/'platform'; 'grupo' es cliente + is_group
        if (data.org_type === 'grupo') data.org_type = 'cliente';

        const btn = document.getElementById('org-save-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
        try {
            if (this.editingId) {
                await api.updateOrganization(this.editingId, data);
                toast('Organización actualizada', 'success');
            } else {
                await api.createOrganization(data);
                toast('Organización creada', 'success');
            }
            closeModal('modal-org-form');
            this.companiesByOrg = {};
            await this.load();
        } catch (e) {
            toast('Error: ' + e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
        }
    },

    _skeleton() {
        return `<div class="orgs-grid">${Array(4).fill('<div class="org-card org-skeleton"></div>').join('')}</div>`;
    },
};

// Hook: el form usa data-type con opción "grupo" que mapea a cliente+is_group
