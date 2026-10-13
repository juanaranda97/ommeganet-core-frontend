// ============================================================
// OMMEGANET CORE — Módulo Inventario (ITAM)
// ============================================================
const Inventory = {
    state: { items: [], meta: null, editingId: null, assignId: null, searchT: null },

    // Códigos REALES de la DB (CHECK) → color y etiqueta amigable
    ESTADO_COLORS: {
        disponible: '#4ade80', asignado: '#22d3ee', reparacion: '#fbbf24',
        baja: '#f87171', extraviado: '#a78bfa',
    },
    ESTADO_LABELS: {
        disponible:'Disponible', asignado:'Asignado', reparacion:'En reparación',
        baja:'De baja', extraviado:'Extraviado',
    },
    TIPO_LABELS: {
        NB:'Notebook', PC:'PC', Monitor:'Monitor', Mouse:'Mouse', Teclado:'Teclado',
        Auricular:'Auricular', Impresora:'Impresora', Router:'Router', Switch:'Switch',
        Servidor:'Servidor', Otro:'Otro',
    },
    tipoLabel(t){ return this.TIPO_LABELS[t] || t || '—'; },
    estadoLabel(e){ return this.ESTADO_LABELS[e] || e || '—'; },

    // Campos técnicos del formulario (coinciden con columnas reales de `equipment`)
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
        } catch (e) {
            toast('Error cargando inventario: ' + e.message, 'error');
        }
    },

    filters() {
        return {
            search:   val('inv-search'),
            tipo:     val('inv-f-tipo'),
            estado:   val('inv-f-estado'),
            branch_id:val('inv-f-branch'),
            serial:   val('inv-f-serial'),
            limit: 500,
        };
    },

    debouncedSearch() {
        clearTimeout(this.state.searchT);
        this.state.searchT = setTimeout(() => this.load(), 350);
    },

    async loadMeta() {
        const meta = await api.getInventoryMeta();
        this.state.meta = meta;
        // códigos reales con etiqueta amigable
        fillSelect('inv-f-tipo', 'Tipo', (meta.tipos||[]).map(t => [t, this.tipoLabel(t)]));
        fillSelect('inv-f-estado', 'Estado', (meta.estados||[]).map(e => [e, this.estadoLabel(e)]));
        fillSelect('inv-f-branch', 'Sucursal', (meta.branches||[]).map(b => [b.id, b.name]));
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
            tb.innerHTML = `<tr><td colspan="7"><div class="empty" style="padding:32px"><h3>Sin activos</h3><p>Registrá el primero con “+ Nuevo activo”.</p></div></td></tr>`;
            return;
        }
        tb.innerHTML = items.map(a => `
            <tr onclick="Inventory.openDetail('${a.id}')" style="cursor:pointer;">
                <td><span class="row-id">${escHtml(a.codigo_interno||'—')}</span></td>
                <td>${escHtml(this.tipoLabel(a.tipo))}</td>
                <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml([a.marca,a.modelo].filter(Boolean).join(' ')||'—')}</td>
                <td style="font-family:var(--font-mono,monospace);font-size:12px;">${escHtml(a.serial||'—')}</td>
                <td>${this.estadoBadge(a.estado)}</td>
                <td>${escHtml(a.assigned_user_name || '—')}</td>
                <td style="font-size:12px;color:var(--text-2)">${escHtml(a.ubicacion||'—')}</td>
            </tr>`).join('');
    },

    // -------------------------------------------------- FORM
    async openForm(id=null) {
        this.state.editingId = id;
        // Al editar, traemos la FICHA COMPLETA (no el resumen del listado) para no
        // perder specs al guardar.
        let a = {};
        if (id) {
            try { a = await api.getAsset(id); }
            catch (e) { toast('No se pudo cargar el activo: ' + e.message, 'error'); return; }
        }
        setText('inv-form-title', id ? 'Editar activo' : 'Nuevo activo');
        const meta = this.state.meta || { tipos: [], estados: [] };
        const optL = (arr, sel, labeler) => arr.map(v => `<option value="${escAttr(v)}" ${v===sel?'selected':''}>${escHtml(labeler(v))}</option>`).join('');
        const optTipo = (sel) => optL(meta.tipos||[], sel, t => this.tipoLabel(t));
        const optEstado = (sel) => optL(meta.estados||[], sel, e => this.estadoLabel(e));
        const branchOpts = (meta.branches||[]).map(b => `<option value="${b.id}" ${b.id===a.branch_id?'selected':''}>${escHtml(b.name)}</option>`).join('');

        const field = (fid, label, value='', type='text') =>
            `<div class="form-group"><label>${label}</label><input type="${type}" id="invf-${fid}" value="${value!=null?escAttr(value):''}"></div>`;

        document.getElementById('inv-form-body').innerHTML = `
            <div class="inv-hint" style="font-size:12px;color:var(--text-2);background:var(--bg-2,#1113);border:1px solid var(--border-0,#3333);border-radius:10px;padding:10px 12px;margin-bottom:14px;">
                📝 Datos ingresados manualmente. El descubrimiento automático (agente / Intune) se incorporará en una fase posterior; esos campos aún no existen y no se inventan.
            </div>
            <div class="form-row">
              <div class="form-group"><label>Código interno</label><input id="invf-codigo_interno" value="${escAttr(a.codigo_interno||'')}" placeholder="Único (asset tag)"></div>
              <div class="form-group"><label>Tipo <span class="req">*</span></label><select id="invf-tipo" required>${optTipo(a.tipo)}</select></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Marca</label><input id="invf-marca" value="${escAttr(a.marca||'')}"></div>
              <div class="form-group"><label>Modelo</label><input id="invf-modelo" value="${escAttr(a.modelo||'')}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>N° de serie</label><input id="invf-serial" value="${escAttr(a.serial||'')}"></div>
              <div class="form-group"><label>N° de producto</label><input id="invf-nro_producto" value="${escAttr(a.nro_producto||'')}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Estado</label><select id="invf-estado">${optEstado(a.estado||'disponible')}</select></div>
              <div class="form-group"><label>Sucursal</label><select id="invf-branch_id"><option value="">—</option>${branchOpts}</select></div>
            </div>
            <div class="form-group"><label>Ubicación (texto)</label><input id="invf-ubicacion" value="${escAttr(a.ubicacion||'')}" placeholder="Ej: Oficina 2, piso 3"></div>

            <details style="margin:10px 0;"><summary style="cursor:pointer;font-weight:600;font-size:13px;">Especificaciones técnicas</summary>
              <div style="margin-top:10px;">
                <div class="form-row">${this.SPECS.slice(0,2).map(([f,l])=>field(f,l,a[f])).join('')}</div>
                <div class="form-row">${this.SPECS.slice(2,4).map(([f,l])=>field(f,l,a[f])).join('')}</div>
                <div class="form-row">${this.SPECS.slice(4,6).map(([f,l])=>field(f,l,a[f])).join('')}</div>
                <div class="form-row">${this.SPECS.slice(6,8).map(([f,l])=>field(f,l,a[f])).join('')}</div>
                <div class="form-row">${this.SPECS.slice(8,10).map(([f,l])=>field(f,l,a[f])).join('')}</div>
                <div class="form-row">${this.SPECS.slice(10,12).map(([f,l])=>field(f,l,a[f])).join('')}</div>
                <div class="form-row">${this.SPECS.slice(12,14).map(([f,l])=>field(f,l,a[f])).join('')}</div>
                <div class="form-group">${this.SPECS.slice(14).map(([f,l])=>`<label>${l}</label><input id="invf-${f}" value="${escAttr(a[f]||'')}">`).join('')}</div>
                <div class="form-group"><label><input type="checkbox" id="invf-tiene_auricular" ${a.tiene_auricular?'checked':''}> Tiene auricular</label></div>
                <div class="form-row">${this.DATES.slice(0,2).map(([f,l])=>field(f,l,a[f],'date')).join('')}</div>
                <div class="form-row">${this.DATES.slice(2,4).map(([f,l])=>field(f,l,a[f],'date')).join('')}</div>
              </div>
            </details>
            <div class="form-group"><label>Notas</label><textarea id="invf-notas" rows="2">${escHtml(a.notas||'')}</textarea></div>
        `;
        openModal('modal-inv-form');
    },

    collect() {
        const ids = ['codigo_interno','tipo','marca','modelo','serial','nro_producto','estado',
            'branch_id','ubicacion','notas', ...this.SPECS.map(s=>s[0]), ...this.DATES.map(d=>d[0])];
        const payload = {};
        ids.forEach(f => {
            const v = val(`invf-${f}`);
            payload[f] = (v === '' ? null : v);
        });
        payload.tiene_auricular = !!document.getElementById('invf-tiene_auricular')?.checked;
        if (!payload.tipo) { toast('El tipo es obligatorio', 'warning'); return null; }
        return payload;
    },

    async save() {
        const payload = this.collect();
        if (!payload) return;
        const btn = document.getElementById('inv-save-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
        try {
            if (this.state.editingId) await api.updateAsset(this.state.editingId, payload);
            else await api.createAsset(payload);
            closeModal('modal-inv-form');
            toast('Activo guardado', 'success');
            await this.load();
        } catch (e) {
            toast('Error: ' + e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
        }
    },

    // -------------------------------------------------- DETALLE
    async openDetail(id) {
        try {
            const [a, hist] = await Promise.all([ api.getAsset(id), api.getAssetAssignments(id) ]);
            setText('inv-detail-title', `${a.codigo_interno || cap(a.tipo)} ${a.marca||''} ${a.modelo||''}`.trim());
            const cur = a.current_assignment;
            const row = (l, v) => v ? `<div class="meta-row"><div class="meta-label">${l}</div><div class="meta-val">${escHtml(String(v))}</div></div>` : '';
            const specRows = this.SPECS.map(([f,l]) => row(l, a[f])).join('');
            const dateRows = this.DATES.map(([f,l]) => row(l, a[f] ? fmtDate(a[f]) : '')).join('');

            const histHtml = (hist && hist.length) ? hist.map(h => `
                <div class="meta-row" style="align-items:flex-start;">
                  <div class="meta-label">${fmtDate(h.assigned_at)}</div>
                  <div class="meta-val" style="font-size:13px;">
                    <strong>${escHtml(h.user_name||'Usuario')}</strong>
                    ${h.returned_at ? `<span style="color:var(--text-2)"> · devuelto ${fmtDate(h.returned_at)}${h.returned_reason?` (${escHtml(h.returned_reason)})`:''}</span>` : `<span style="color:#22d3ee"> · activa</span>`}
                  </div>
                </div>`).join('') : `<div style="color:var(--text-2);font-size:13px;">Sin asignaciones registradas.</div>`;

            document.getElementById('inv-detail-body').innerHTML = `
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
                    ${this.estadoBadge(a.estado)}
                    <span class="badge" style="background:#64748b22;color:#94a3b8;border:1px solid #64748b55;">Fuente: ${a.data_source||'manual'}</span>
                    ${cur ? `<span class="badge" style="background:#22d3ee22;color:#22d3ee;border:1px solid #22d3ee55;">Asignado a ${escHtml(cur.user_name||'usuario')}</span>` : ''}
                </div>

                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
                    <button class="btn btn-ghost btn-sm" onclick="Inventory.openForm('${a.id}'); closeModal('modal-inv-detail');">Editar</button>
                    ${cur
                        ? `<button class="btn btn-ghost btn-sm" onclick="Inventory.doReturn('${a.id}')">Registrar devolución</button>`
                        : `<button class="btn btn-primary btn-sm" onclick="Inventory.openAssign('${a.id}')">Asignar</button>`}
                </div>

                <h4 style="margin:8px 0;">Datos técnicos</h4>
                <div class="ticket-meta">
                    ${row('Tipo', this.tipoLabel(a.tipo))}
                    ${row('Marca', a.marca)}${row('Modelo', a.modelo)}
                    ${row('N° serie', a.serial)}${row('N° producto', a.nro_producto)}
                    ${row('Ubicación', a.ubicacion)}
                    ${specRows}
                    ${dateRows}
                    ${row('Notas', a.notas)}
                </div>

                <h4 style="margin:16px 0 8px;">Historial de asignaciones</h4>
                <div class="ticket-meta">${histHtml}</div>
            `;
            openModal('modal-inv-detail');
        } catch (e) {
            toast('Error abriendo ficha: ' + e.message, 'error');
        }
    },

    // -------------------------------------------------- ASIGNAR / DEVOLVER
    async openAssign(id) {
        this.state.assignId = id;
        try {
            // Endpoint aislado por tenant: solo usuarios de la org/empresa activa.
            const users = await api.getAssignableUsers();
            const sel = document.getElementById('inv-assign-user');
            if (!users || !users.length) {
                toast('No hay usuarios asignables en esta organización', 'warning');
            }
            sel.innerHTML = (users||[]).map(u => `<option value="${u.id}">${escHtml(u.full_name || u.id)}</option>`).join('');
            document.getElementById('inv-assign-notas').value = '';
            closeModal('modal-inv-detail');
            openModal('modal-inv-assign');
        } catch (e) {
            toast('No se pudo cargar usuarios: ' + e.message, 'error');
        }
    },

    async doAssign() {
        const id = this.state.assignId;
        const user_id = val('inv-assign-user');
        if (!user_id) { toast('Elegí un usuario', 'warning'); return; }
        try {
            await api.assignAsset(id, { user_id, notas: val('inv-assign-notas') || null });
            closeModal('modal-inv-assign');
            toast('Activo asignado', 'success');
            await this.load();
        } catch (e) {
            toast('Error asignando: ' + e.message, 'error');
        }
    },

    async doReturn(id) {
        const reason = prompt('Motivo de la devolución (opcional):', '');
        if (reason === null) return; // cancelado
        try {
            await api.returnAsset(id, { returned_reason: reason || null });
            closeModal('modal-inv-detail');
            toast('Devolución registrada', 'success');
            await this.load();
        } catch (e) {
            toast('Error en devolución: ' + e.message, 'error');
        }
    },

    // -------------------------------------------------- EXPORT
    async exportData() {
        try {
            if (typeof XLSX === 'undefined') { toast('Librería de Excel no cargó', 'error'); return; }
            const items = await api.getInventory({ ...this.filters(), limit: 500 });
            if (!items.length) { toast('No hay activos para exportar', 'warning'); return; }
            const rows = items.map(a => ({
                'Código': a.codigo_interno || '',
                'Tipo': a.tipo || '',
                'Marca': a.marca || '',
                'Modelo': a.modelo || '',
                'N° Serie': a.serial || '',
                'Estado': a.estado || '',
                'Asignado a': a.assigned_user_name || '',
                'Ubicación': a.ubicacion || '',
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [{wch:14},{wch:12},{wch:14},{wch:18},{wch:18},{wch:14},{wch:22},{wch:20}];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
            const d = new Date().toISOString().slice(0,10);
            XLSX.writeFile(wb, `inventario_${d}.xlsx`);
            toast(`${rows.length} activos exportados`, 'success');
        } catch (e) {
            toast('Error exportando: ' + e.message, 'error');
        }
    },
};

// Helpers locales (tolerantes si ya existen globalmente)
function val(id) { const el = document.getElementById(id); return el ? (el.value||'').trim() : ''; }
function cap(s) { s = String(s||''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function escAttr(s) { return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function fillSelect(id, placeholder, pairs) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<option value="">${placeholder}</option>` + pairs.map(([v,l]) => `<option value="${escAttr(v)}">${escHtml(l)}</option>`).join('');
}

