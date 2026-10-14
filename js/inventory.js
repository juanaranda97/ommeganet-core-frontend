// ============================================================
// OMMEGANET CORE — Módulo Inventario (ITAM) — ITAM-02
// Pertenencia multiempresa, departamento, responsable y selectores dependientes.
// ============================================================
const Inventory = {
    state: {
        items: [], meta: null, editingId: null, assignId: null, assignCompany: null,
        searchT: null, respT: null, isPlatform: false, orgOptions: [],
    },

    ESTADO_COLORS: { disponible:'#4ade80', asignado:'#22d3ee', reparacion:'#fbbf24', baja:'#f87171', extraviado:'#a78bfa' },
    ESTADO_LABELS: { disponible:'Disponible', asignado:'Asignado', reparacion:'En reparación', baja:'De baja', extraviado:'Extraviado' },
    TIPO_LABELS: { NB:'Notebook', PC:'PC', Monitor:'Monitor', Mouse:'Mouse', Teclado:'Teclado', Auricular:'Auricular', Impresora:'Impresora', Router:'Router', Switch:'Switch', Servidor:'Servidor', Otro:'Otro' },
    tipoLabel(t){ return this.TIPO_LABELS[t] || t || '—'; },
    estadoLabel(e){ return this.ESTADO_LABELS[e] || e || '—'; },

    SPECS: [
        ['procesador','Procesador'],['ram','RAM'],['tipo_ram','Tipo RAM'],
        ['drive','Almacenamiento'],['tipo_drive','Tipo de disco'],['marca_drive','Marca disco'],
        ['sistema_operativo','Sistema operativo'],['version_so','Versión SO'],
        ['antivirus','Antivirus'],['antivirus_version','Versión antivirus'],
        ['monitor_marca','Monitor (marca)'],['monitor_tamano','Monitor (tamaño)'],
        ['mouse_modelo','Mouse'],['anydesk_id','AnyDesk ID'],['onedrive_estado','OneDrive'],
    ],
    DATES: [
        ['fecha_compra','Fecha de compra'],['fecha_garantia_hasta','Garantía hasta'],
        ['fecha_fabricacion','Fecha fabricación'],['so_instalado_el','SO instalado el'],
    ],

    // ---------------------------------------------------- LISTADO
    async load(initMeta=false) {
        try {
            if (initMeta || !this.state.meta) await this.loadMeta();
            const [stats, items] = await Promise.all([
                api.getInventoryStats(),
                api.getInventory(this.filters()),
            ]);
            this.renderStats(stats);
            this.state.items = items || [];
            this.renderTable(this.state.items);
        } catch (e) { toast('Error cargando inventario: ' + e.message, 'error'); }
    },

    filters() {
        return {
            search: val('inv-search'),
            organization_id: val('inv-f-org'),
            company_id: val('inv-f-company'),
            department_id: val('inv-f-department'),
            branch_id: val('inv-f-branch'),
            tipo: val('inv-f-tipo'),
            estado: val('inv-f-estado'),
            serial: val('inv-f-serial'),
            limit: 500,
        };
    },

    debouncedSearch() { clearTimeout(this.state.searchT); this.state.searchT = setTimeout(() => this.load(), 350); },

    async loadMeta() {
        const meta = await api.getInventoryMeta();
        this.state.meta = meta;
        this.state.isPlatform = App.state.context?.is_platform_user === true;
        fillSelect('inv-f-tipo', 'Tipo', (meta.tipos||[]).map(t => [t, this.tipoLabel(t)]));
        fillSelect('inv-f-estado', 'Estado', (meta.estados||[]).map(e => [e, this.estadoLabel(e)]));
        // Organizaciones y empresas para los filtros
        try {
            const orgs = await api.getInvOrganizations();
            this.state.orgOptions = orgs || [];
            if (this.state.isPlatform && orgs.length > 1) {
                document.getElementById('inv-f-org').style.display = '';
                fillSelect('inv-f-org', 'Organización', orgs.map(o => [o.id, o.name]));
            }
            // empresas del único/propio org si corresponde
            const orgId = (orgs.length === 1) ? orgs[0].id : '';
            if (orgId) await this._fillCompanyFilter(orgId);
        } catch {}
    },

    async _fillCompanyFilter(orgId) {
        try {
            const comps = orgId ? await api.getInvCompanies(orgId) : [];
            fillSelect('inv-f-company', 'Empresa', comps.map(c => [c.id, c.name]));
        } catch { fillSelect('inv-f-company', 'Empresa', []); }
        fillSelect('inv-f-department', 'Departamento', []);
    },
    async onFilterOrgChange() { await this._fillCompanyFilter(val('inv-f-org')); this.load(); },
    async onFilterCompanyChange() {
        const cid = val('inv-f-company');
        try { const deps = cid ? await api.getInvDepartments(cid) : []; fillSelect('inv-f-department','Departamento', deps.map(d=>[d.id,d.name])); } catch {}
        this.load();
    },

    renderStats(s) {
        setText('inv-k-total', s.total || 0);
        setText('inv-k-asignados', s.asignados || 0);
        setText('inv-k-disponibles', s.disponibles || 0);
        setText('inv-k-reparacion', s.en_reparacion || 0);
    },

    estadoBadge(estado) {
        const c = this.ESTADO_COLORS[estado] || '#94a3b8';
        return `<span class="badge" style="background:${c}22;color:${c};border:1px solid ${c}55;">${escHtml(this.estadoLabel(estado))}</span>`;
    },

    renderTable(items) {
        const tb = document.getElementById('inv-tbody');
        if (!tb) return;
        if (!items.length) {
            tb.innerHTML = `<tr><td colspan="9"><div class="empty" style="padding:32px"><h3>Sin activos</h3><p>Registrá el primero con “+ Nuevo activo”.</p></div></td></tr>`;
            return;
        }
        tb.innerHTML = items.map(a => `
            <tr onclick="Inventory.openDetail('${a.id}')" style="cursor:pointer;">
                <td><span class="row-id">${escHtml(a.codigo_interno||'—')}</span></td>
                <td>${escHtml(this.tipoLabel(a.tipo))}</td>
                <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml([a.marca,a.modelo].filter(Boolean).join(' ')||'—')}</td>
                <td style="font-family:var(--font-mono,monospace);font-size:12px;">${escHtml(a.serial||'—')}</td>
                <td>${escHtml(a.company_name||'—')}</td>
                <td>${escHtml(a.department_name||'—')}</td>
                <td>${this.estadoBadge(a.estado)}</td>
                <td>${escHtml(a.assigned_user_name||'—')}</td>
                <td style="font-size:12px;color:var(--text-2)">${escHtml(a.branch_name||a.ubicacion||'—')}</td>
            </tr>`).join('');
    },

    // ---------------------------------------------------- FORM
    async openForm(id=null) {
        this.state.editingId = id;
        // Token de secuencia de carga: invalida respuestas asíncronas viejas para que
        // no pisen selecciones nuevas (evita la condición de carrera al editar).
        const token = (this.state.formToken = (this.state.formToken || 0) + 1);
        let a = {};
        if (id) {
            try { a = await api.getAsset(id); } catch (e) { toast('No se pudo cargar el activo: ' + e.message, 'error'); return; }
        }
        setText('inv-form-title', id ? 'Editar activo' : 'Nuevo activo');
        const meta = this.state.meta || { tipos: [], estados: [] };
        const sel = (v, cur) => v === cur ? 'selected' : '';
        const optL = (arr, cur, lab) => arr.map(v => `<option value="${escAttr(v)}" ${sel(v,cur)}>${escHtml(lab(v))}</option>`).join('');
        const field = (fid, label, value='', type='text') =>
            `<div class="form-group"><label>${label}</label><input type="${type}" id="invf-${fid}" value="${value!=null?escAttr(value):''}"></div>`;

        const isEdit = !!id;
        // Opciones de organización
        let orgs = this.state.orgOptions;
        if (!orgs || !orgs.length) { try { orgs = await api.getInvOrganizations(); this.state.orgOptions = orgs; } catch { orgs = []; } }
        const curOrg = isEdit ? a.organization_id : (orgs.length === 1 ? orgs[0].id : '');
        const orgDisabled = isEdit || orgs.length <= 1;

        document.getElementById('inv-form-body').innerHTML = `
          <div class="inv-hint" style="font-size:12px;color:var(--text-2);background:var(--bg-2,#1113);border:1px solid var(--border-0,#3333);border-radius:10px;padding:10px 12px;margin-bottom:14px;">
              📝 Datos manuales. El descubrimiento automático (agente / Intune) llegará después; esos campos aún no existen y no se inventan.
          </div>

          <!-- A. Pertenencia -->
          <div class="form-section">
            <div class="sec-title">Pertenencia</div>
            <div class="form-row">
              <div class="form-group"><label>Organización <span class="req">*</span></label>
                <select id="invf-org" ${orgDisabled?'disabled':''} onchange="Inventory.onOrgChange()">
                  <option value="">—</option>${optL(orgs.map(o=>o.id), curOrg, v => (orgs.find(o=>o.id===v)||{}).name || v)}
                </select></div>
              <div class="form-group"><label>Empresa <span class="req">*</span></label>
                <select id="invf-company" ${isEdit?'disabled':''} onchange="Inventory.onCompanyChange()"><option value="">—</option></select></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Departamento (área responsable)</label>
                <select id="invf-department"><option value="">—</option></select></div>
              <div class="form-group"><label>Sucursal</label>
                <select id="invf-branch" onchange="Inventory.onBranchChange()"><option value="">—</option></select></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Ubicación física</label>
                <select id="invf-physical_location"><option value="">—</option></select></div>
              <div class="form-group"><label>Ubicación (texto)</label>
                <input id="invf-ubicacion" value="${escAttr(a.ubicacion||'')}" placeholder="Ej: Oficina 2, piso 3"></div>
            </div>
          </div>

          ${isEdit ? '' : `
          <!-- B. Asignación / Responsable (solo al crear) -->
          <div class="form-section">
            <div class="sec-title">Asignación / Responsable <span style="font-weight:400;text-transform:none;color:var(--text-2);">(opcional)</span></div>
            <div class="form-group"><label>Buscar responsable por nombre, apellido o email</label>
              <input id="invf-resp-search" placeholder="Escribí para buscar…" oninput="Inventory.onResponsibleSearch()" autocomplete="off"></div>
            <div class="form-group"><label>Responsable</label>
              <select id="invf-responsible"><option value="">— Sin responsable —</option></select>
              <div class="form-hint" style="font-size:11px;color:var(--text-2);">No todos los activos tienen responsable (una impresora o un switch pueden pertenecer a un departamento).</div></div>
          </div>`}

          <!-- C. Identificación -->
          <div class="form-section">
            <div class="sec-title">Identificación</div>
            <div class="form-row">
              <div class="form-group"><label>Código interno</label><input id="invf-codigo_interno" value="${escAttr(a.codigo_interno||'')}" placeholder="Único (asset tag)"></div>
              <div class="form-group"><label>Tipo <span class="req">*</span></label><select id="invf-tipo" required>${optL(meta.tipos||[], a.tipo, v=>this.tipoLabel(v))}</select></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Marca</label><input id="invf-marca" value="${escAttr(a.marca||'')}"></div>
              <div class="form-group"><label>Modelo</label><input id="invf-modelo" value="${escAttr(a.modelo||'')}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>N° de serie</label><input id="invf-serial" value="${escAttr(a.serial||'')}"></div>
              <div class="form-group"><label>N° de producto</label><input id="invf-nro_producto" value="${escAttr(a.nro_producto||'')}"></div>
            </div>
            <div class="form-group"><label>Estado</label><select id="invf-estado">${optL(meta.estados||[], a.estado||'disponible', v=>this.estadoLabel(v))}</select></div>
          </div>

          <!-- D. Especificaciones técnicas -->
          <details class="form-section" ${isEdit?'open':''}>
            <summary class="sec-title" style="cursor:pointer;list-style:revert;">Especificaciones técnicas</summary>
            <div style="margin-top:10px;">
              ${[[0,2],[2,4],[4,6],[6,8],[8,10],[10,12],[12,14]].map(([i,j])=>`<div class="form-row">${this.SPECS.slice(i,j).map(([f,l])=>field(f,l,a[f])).join('')}</div>`).join('')}
              <div class="form-group">${this.SPECS.slice(14).map(([f,l])=>`<label>${l}</label><input id="invf-${f}" value="${escAttr(a[f]||'')}">`).join('')}</div>
              <div class="form-group check-row"><input type="checkbox" id="invf-tiene_auricular" ${a.tiene_auricular?'checked':''}><label for="invf-tiene_auricular">Tiene auricular</label></div>
            </div>
          </details>

          <!-- E. Información administrativa -->
          <div class="form-section">
            <div class="sec-title">Información administrativa</div>
            <div class="form-row">${this.DATES.slice(0,2).map(([f,l])=>field(f,l,a[f],'date')).join('')}</div>
            <div class="form-row">${this.DATES.slice(2,4).map(([f,l])=>field(f,l,a[f],'date')).join('')}</div>
            <div class="form-group"><label>Notas y observaciones</label><textarea id="invf-notas" rows="2">${escHtml(a.notas||'')}</textarea></div>
          </div>
        `;

        // Cargar cadenas dependientes y preseleccionar en edición. SECUENCIAL y con
        // preselect correcto; NO se dispara onCompanyChange en paralelo (eso borraba
        // departamento/sucursal/ubicación). El token corta si se abrió otro formulario.
        if (curOrg) await this._loadCompanies(curOrg, isEdit ? a.company_id : '', token);
        if (isEdit && a.company_id) {
            await this._loadDepartments(a.company_id, a.department_id, token);
            await this._loadBranches(curOrg, a.company_id, a.branch_id, token);
            if (a.branch_id) await this._loadLocations(a.branch_id, a.physical_location_id, token);
            // Responsables de la empresa (opcional; no altera la pertenencia).
            await this._reloadResponsibles(a.company_id, '');
        }
        if (token !== this.state.formToken) return;   // una apertura más nueva ganó

        // Reset scroll al inicio
        const body = document.getElementById('inv-form-body');
        if (body) body.scrollTop = 0;
        openModal('modal-inv-form');
    },

    // --- selectores dependientes del formulario ---
    // Cada loader lleva el token de la operación que lo originó: si mientras espera
    // la API llega otra operación (nuevo token), descarta su escritura para no pisar
    // selecciones más nuevas. _stale() centraliza esa comprobación.
    _stale(token) { return token !== undefined && token !== this.state.formToken; },
    async _loadCompanies(orgId, preselect='', token) {
        const comps = orgId ? await api.getInvCompanies(orgId).catch(()=>[]) : [];
        if (this._stale(token)) return;
        fillFormSelect('invf-company', comps, preselect, '—');
        // limpiar dependientes (se recargan explícitamente con su preselect correcto)
        fillFormSelect('invf-department', [], '', '—');
        fillFormSelect('invf-branch', [], '', '—');
        fillFormSelect('invf-physical_location', [], '', '—');
    },
    async _loadDepartments(companyId, preselect='', token) {
        const deps = companyId ? await api.getInvDepartments(companyId).catch(()=>[]) : [];
        if (this._stale(token)) return;
        fillFormSelect('invf-department', deps, preselect, '—');
    },
    async _loadBranches(orgId, companyId, preselect='', token) {
        const br = orgId ? await api.getInvBranches(orgId, companyId).catch(()=>[]) : [];
        if (this._stale(token)) return;
        fillFormSelect('invf-branch', br, preselect, '—');
        fillFormSelect('invf-physical_location', [], '', '—');
    },
    async _loadLocations(branchId, preselect='', token) {
        const locs = branchId ? await api.getInvLocations(branchId).catch(()=>[]) : [];
        if (this._stale(token)) return;
        fillFormSelect('invf-physical_location', locs, preselect, '—');
    },
    async onOrgChange() {
        const token = (this.state.formToken = (this.state.formToken || 0) + 1);
        const org = val('invf-org');
        await this._loadCompanies(org, '', token);
        // responsables se recargan al elegir empresa
        if (!this._stale(token)) fillFormSelect('invf-responsible', [], '', '— Sin responsable —');
    },
    async onCompanyChange() {
        const token = (this.state.formToken = (this.state.formToken || 0) + 1);
        const org = val('invf-org'), comp = val('invf-company');
        await this._loadDepartments(comp, '', token);
        await this._loadBranches(org, comp, '', token);
        // recargar responsables de la empresa
        if (!this.state.editingId && !this._stale(token)) await this._reloadResponsibles(comp, '');
    },
    async onBranchChange() {
        const token = (this.state.formToken = (this.state.formToken || 0) + 1);
        await this._loadLocations(val('invf-branch'), '', token);
    },

    onResponsibleSearch() {
        clearTimeout(this.state.respT);
        this.state.respT = setTimeout(() => this._reloadResponsibles(val('invf-company'), val('invf-resp-search')), 300);
    },
    async _reloadResponsibles(companyId, search) {
        const selEl = document.getElementById('invf-responsible');
        if (!selEl) return;
        if (!companyId) { selEl.innerHTML = '<option value="">— Elegí una empresa primero —</option>'; return; }
        try {
            const users = await api.getAssignableUsers(companyId, search || null);
            const cur = selEl.value;
            selEl.innerHTML = '<option value="">— Sin responsable —</option>' +
                (users||[]).map(u => `<option value="${escAttr(u.id)}" ${u.id===cur?'selected':''}>${escHtml(u.full_name || u.email || u.id)}${u.email?` · ${escHtml(u.email)}`:''}</option>`).join('');
        } catch {}
    },

    collect(isEdit) {
        const ids = ['codigo_interno','tipo','marca','modelo','serial','nro_producto','estado',
            'ubicacion','notas', ...this.SPECS.map(s=>s[0]), ...this.DATES.map(d=>d[0])];
        const p = {};
        ids.forEach(f => { const v = val(`invf-${f}`); p[f] = (v === '' ? null : v); });
        p.tiene_auricular = !!document.getElementById('invf-tiene_auricular')?.checked;
        // pertenencia
        p.department_id = val('invf-department') || null;
        p.branch_id = val('invf-branch') || null;
        p.physical_location_id = val('invf-physical_location') || null;
        if (!p.tipo) { toast('El tipo es obligatorio', 'warning'); return null; }
        if (!isEdit) {
            p.organization_id = val('invf-org') || null;
            p.company_id = val('invf-company') || null;
            p.assigned_to = val('invf-responsible') || null;
            if (!p.organization_id) { toast('Seleccioná una organización', 'warning'); return null; }
            if (!p.company_id) { toast('Seleccioná una empresa', 'warning'); return null; }
        }
        return p;
    },

    async save() {
        const isEdit = !!this.state.editingId;
        const payload = this.collect(isEdit);
        if (!payload) return;
        const btn = document.getElementById('inv-save-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
        try {
            if (isEdit) await api.updateAsset(this.state.editingId, payload);
            else await api.createAsset(payload);
            closeModal('modal-inv-form');
            toast('Activo guardado', 'success');
            await this.load();
        } catch (e) { toast('Error: ' + e.message, 'error'); }
        finally { if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; } }
    },

    // ---------------------------------------------------- DETALLE
    async openDetail(id) {
        try {
            const [a, hist] = await Promise.all([ api.getAsset(id), api.getAssetAssignments(id) ]);
            this.state.assignCompany = a.company_id;
            setText('inv-detail-title', `${a.codigo_interno || this.tipoLabel(a.tipo)} ${a.marca||''} ${a.modelo||''}`.trim());
            const cur = a.current_assignment;
            const row = (l, v) => v ? `<div class="meta-row"><div class="meta-label">${l}</div><div class="meta-val">${escHtml(String(v))}</div></div>` : '';
            const specRows = this.SPECS.map(([f,l]) => row(l, a[f])).join('');
            const dateRows = this.DATES.map(([f,l]) => row(l, a[f] ? fmtDate(a[f]) : '')).join('');
            const histHtml = (hist && hist.length) ? hist.map(h => `
                <div class="meta-row" style="align-items:flex-start;">
                  <div class="meta-label">${fmtDate(h.assigned_at)}</div>
                  <div class="meta-val" style="font-size:13px;"><strong>${escHtml(h.user_name||'Usuario')}</strong>
                    ${h.returned_at ? `<span style="color:var(--text-2)"> · devuelto ${fmtDate(h.returned_at)}${h.returned_reason?` (${escHtml(h.returned_reason)})`:''}</span>` : `<span style="color:#22d3ee"> · activa</span>`}</div>
                </div>`).join('') : `<div style="color:var(--text-2);font-size:13px;">Sin asignaciones registradas.</div>`;

            document.getElementById('inv-detail-body').innerHTML = `
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
                    ${this.estadoBadge(a.estado)}
                    <span class="badge" style="background:#64748b22;color:#94a3b8;border:1px solid #64748b55;">Fuente: ${escHtml(a.data_source||'manual')}</span>
                    ${cur ? `<span class="badge" style="background:#22d3ee22;color:#22d3ee;border:1px solid #22d3ee55;">Asignado a ${escHtml(cur.user_name||'usuario')}</span>` : ''}
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
                    <button class="btn btn-ghost btn-sm" onclick="Inventory.openForm('${a.id}'); closeModal('modal-inv-detail');">Editar</button>
                    ${cur ? `<button class="btn btn-ghost btn-sm" onclick="Inventory.doReturn('${a.id}')">Registrar devolución</button>`
                           : `<button class="btn btn-primary btn-sm" onclick="Inventory.openAssign('${a.id}')">Asignar</button>`}
                </div>
                <h4 style="margin:8px 0;">Pertenencia</h4>
                <div class="ticket-meta">
                    ${row('Organización', a.organization_name)}${row('Empresa', a.company_name)}
                    ${row('Departamento', a.department_name)}${row('Sucursal', a.branch_name)}
                    ${row('Ubicación', a.ubicacion)}
                </div>
                <h4 style="margin:16px 0 8px;">Datos técnicos</h4>
                <div class="ticket-meta">
                    ${row('Tipo', this.tipoLabel(a.tipo))}${row('Marca', a.marca)}${row('Modelo', a.modelo)}
                    ${row('N° serie', a.serial)}${row('N° producto', a.nro_producto)}
                    ${specRows}${dateRows}${row('Notas', a.notas)}
                </div>
                <h4 style="margin:16px 0 8px;">Historial de asignaciones</h4>
                <div class="ticket-meta">${histHtml}</div>`;
            openModal('modal-inv-detail');
        } catch (e) { toast('Error abriendo ficha: ' + e.message, 'error'); }
    },

    // ---------------------------------------------------- ASIGNAR / DEVOLVER
    async openAssign(id) {
        this.state.assignId = id;
        try {
            const users = await api.getAssignableUsers(this.state.assignCompany || null);
            const selEl = document.getElementById('inv-assign-user');
            if (!users || !users.length) toast('No hay usuarios asignables en esta empresa', 'warning');
            selEl.innerHTML = (users||[]).map(u => `<option value="${escAttr(u.id)}">${escHtml(u.full_name || u.id)}${u.email?` · ${escHtml(u.email)}`:''}</option>`).join('');
            document.getElementById('inv-assign-notas').value = '';
            closeModal('modal-inv-detail'); openModal('modal-inv-assign');
        } catch (e) { toast('No se pudo cargar usuarios: ' + e.message, 'error'); }
    },
    async doAssign() {
        const id = this.state.assignId, user_id = val('inv-assign-user');
        if (!user_id) { toast('Elegí un usuario', 'warning'); return; }
        try {
            await api.assignAsset(id, { user_id, notas: val('inv-assign-notas') || null });
            closeModal('modal-inv-assign'); toast('Activo asignado', 'success'); await this.load();
        } catch (e) { toast('Error asignando: ' + e.message, 'error'); }
    },
    async doReturn(id) {
        const reason = prompt('Motivo de la devolución (opcional):', '');
        if (reason === null) return;
        try {
            await api.returnAsset(id, { returned_reason: reason || null });
            closeModal('modal-inv-detail'); toast('Devolución registrada', 'success'); await this.load();
        } catch (e) { toast('Error en devolución: ' + e.message, 'error'); }
    },

    // ---------------------------------------------------- EXPORT
    async exportData() {
        try {
            if (typeof XLSX === 'undefined') { toast('Librería de Excel no cargó', 'error'); return; }
            const items = await api.getInventory({ ...this.filters(), limit: 500 });
            if (!items.length) { toast('No hay activos para exportar', 'warning'); return; }
            const rows = items.map(a => ({
                'Código': a.codigo_interno||'', 'Tipo': a.tipo||'', 'Marca': a.marca||'', 'Modelo': a.modelo||'',
                'N° Serie': a.serial||'', 'Organización': a.organization_name||'', 'Empresa': a.company_name||'',
                'Departamento': a.department_name||'', 'Estado': a.estado||'', 'Responsable': a.assigned_user_name||'',
                'Sucursal': a.branch_name||'', 'Ubicación': a.ubicacion||'',
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [{wch:14},{wch:10},{wch:12},{wch:16},{wch:16},{wch:16},{wch:16},{wch:16},{wch:12},{wch:20},{wch:16},{wch:18}];
            const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
            XLSX.writeFile(wb, `inventario_${new Date().toISOString().slice(0,10)}.xlsx`);
            toast(`${rows.length} activos exportados`, 'success');
        } catch (e) { toast('Error exportando: ' + e.message, 'error'); }
    },
};

// Helpers locales
function val(id) { const el = document.getElementById(id); return el ? (el.value||'').trim() : ''; }
function cap(s) { s = String(s||''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function escAttr(s) { return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function fillSelect(id, placeholder, pairs) {
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = `<option value="">${placeholder}</option>` + pairs.map(([v,l]) => `<option value="${escAttr(v)}">${escHtml(l)}</option>`).join('');
}
function fillFormSelect(id, options, preselect='', placeholder='—') {
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = `<option value="">${placeholder}</option>` +
        (options||[]).map(o => `<option value="${escAttr(o.id)}" ${String(o.id)===String(preselect)?'selected':''}>${escHtml(o.name||o.id)}</option>`).join('');
}
