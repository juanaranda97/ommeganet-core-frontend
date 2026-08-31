// ============================================================
// OMMEGANET CORE — Editor de Categorías (Configuración)
// ============================================================

const CatEditor = {
    cats: [],
    editingId: null,

    // Íconos Tabler sugeridos (nombre visible + valor)
    ICON_OPTIONS: [
        'tool','key','camera','mail','device-desktop','wifi','network','server',
        'package','phone','printer','lock','cloud','database','device-mobile',
        'help','settings','user','bug','world','plug','shield'
    ],

    async load() {
        const wrap = document.getElementById('cat-editor-list');
        if (wrap) wrap.innerHTML = '<div class="loading-inline">Cargando categorías...</div>';
        try {
            this.cats = await api.getCategories() || [];
        } catch (e) {
            if (wrap) wrap.innerHTML = `<div class="empty" style="padding:20px;"><p>Error: ${escHtml(e.message)}</p></div>`;
            return;
        }
        this.render();
    },

    render() {
        const wrap = document.getElementById('cat-editor-list');
        if (!wrap) return;
        // Filtrar activas (soft-delete: is_active !== false)
        const visible = this.cats.filter(c => c.is_active !== false);
        if (!visible.length) {
            wrap.innerHTML = `<div class="empty" style="padding:20px;"><p>No hay categorías. Creá la primera.</p></div>`;
            return;
        }
        wrap.innerHTML = visible.map(c => `
            <div class="cat-editor-row">
                <div class="cat-editor-icon" style="background:${c.color||'#8b5cf6'}">${iconHTML(c.icon)}</div>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:13px; font-weight:600;">${escHtml(c.name)}</div>
                    <div style="font-size:11px; color:var(--text-2); font-family:var(--font-mono);">${escHtml(c.color||'')} · ${escHtml(c.icon||'tool')}</div>
                </div>
                <button class="icon-btn" title="Editar" onclick="CatEditor.openEdit(${c.id})">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="icon-btn cat-del" title="Desactivar" onclick="CatEditor.deactivate(${c.id}, '${escHtml(c.name)}')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>`).join('');
    },

    openCreate() {
        this.editingId = null;
        document.getElementById('cat-form-title').textContent = 'Nueva categoría';
        document.getElementById('cat-f-name').value = '';
        document.getElementById('cat-f-color').value = '#8b5cf6';
        document.getElementById('cat-f-icon').value = 'tool';
        this._renderIconPicker('tool');
        this._syncPreview();
        openModal('modal-cat');
    },

    openEdit(id) {
        const c = this.cats.find(x => x.id === id);
        if (!c) return;
        this.editingId = id;
        document.getElementById('cat-form-title').textContent = 'Editar categoría';
        document.getElementById('cat-f-name').value = c.name || '';
        document.getElementById('cat-f-color').value = this._toHex(c.color) || '#8b5cf6';
        document.getElementById('cat-f-icon').value = c.icon || 'tool';
        this._renderIconPicker(c.icon || 'tool');
        this._syncPreview();
        openModal('modal-cat');
    },

    _toHex(color) {
        if (!color) return '#8b5cf6';
        if (color.startsWith('#')) return color.slice(0,7);
        return '#8b5cf6'; // si es rgba u otro, default
    },

    _renderIconPicker(selected) {
        const el = document.getElementById('cat-icon-picker');
        if (!el) return;
        el.innerHTML = this.ICON_OPTIONS.map(ic => `
            <button type="button" class="icon-pick ${ic===selected?'active':''}" data-icon="${ic}" onclick="CatEditor.pickIcon('${ic}')" title="${ic}">
                <i class="ti ti-${ic}"></i>
            </button>`).join('');
    },

    pickIcon(ic) {
        document.getElementById('cat-f-icon').value = ic;
        document.querySelectorAll('.icon-pick').forEach(b => b.classList.toggle('active', b.dataset.icon === ic));
        this._syncPreview();
    },

    _syncPreview() {
        const name = document.getElementById('cat-f-name').value || 'Categoría';
        const color = document.getElementById('cat-f-color').value;
        const icon = document.getElementById('cat-f-icon').value;
        const prev = document.getElementById('cat-preview');
        if (prev) prev.innerHTML = `
            <div class="cat-icon" style="background:${color};">${iconHTML(icon)}</div>
            <div class="cat-name">${escHtml(name)}</div>`;
    },

    async save() {
        const name = document.getElementById('cat-f-name').value.trim();
        if (name.length < 2) { toast('El nombre es muy corto', 'warning'); return; }
        const data = {
            name,
            color: document.getElementById('cat-f-color').value,
            icon:  document.getElementById('cat-f-icon').value || 'tool',
        };
        const btn = document.getElementById('cat-save-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
        try {
            if (this.editingId) {
                await api.updateCategory(this.editingId, data);
                toast('Categoría actualizada', 'success');
            } else {
                await api.createCategory(data);
                toast('Categoría creada', 'success');
            }
            closeModal('modal-cat');
            await this.load();
            // Refrescar el wizard para que tome los cambios
            if (typeof Wizard !== 'undefined') { Wizard.categories = this.cats; Wizard.renderCats(); }
        } catch (e) {
            toast('Error: ' + e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
        }
    },

    async deactivate(id, name) {
        if (!confirm(`¿Desactivar la categoría "${name}"?\n\nSe ocultará del formulario de tickets, pero los tickets existentes la conservan.`)) return;
        try {
            // Soft-delete vía PATCH is_active=false
            await api.updateCategory(id, { is_active: false });
            toast(`"${name}" desactivada`, 'success');
            await this.load();
            if (typeof Wizard !== 'undefined') { Wizard.categories = this.cats.filter(c=>c.is_active!==false); Wizard.renderCats(); }
        } catch (e) {
            toast('Error: ' + e.message, 'error');
        }
    },
};
