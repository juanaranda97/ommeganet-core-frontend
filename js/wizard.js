// ============================================================
// OMMEGANET CORE — Wizard de creación de tickets
// ============================================================

const Wizard = {
    step: 1,
    categories: [],
    locations: [],

    async init() {
        try {
            this.categories = await api.getCategories();
            this.locations  = await api.getLocations();
            this.renderCats();
            this.renderLocs();
            this.prefillRequester();
        } catch(e) { console.error('Wizard init:', e); }
    },

    // Precarga datos del solicitante (nombre, CI). Si ya tiene CI, el campo queda bloqueado.
    prefillRequester() {
        const u = App.state.user || {};
        const ciField = document.getElementById('ticket-ci');
        if (ciField) {
            if (u.ci && String(u.ci).trim().length >= 4) {
                ciField.value = u.ci;
                ciField.disabled = true;
                ciField.title = 'Tomado de tu perfil';
                const hint = document.getElementById('ci-hint');
                if (hint) hint.textContent = 'Tomado de tu perfil';
            } else {
                ciField.disabled = false;
                const hint = document.getElementById('ci-hint');
                if (hint) hint.textContent = 'Necesario para registrar el ticket';
            }
        }
    },

    renderCats() {
        const el = document.getElementById('cat-grid');
        if (!el) return;
        el.innerHTML = this.categories.map(c => `
            <div class="cat-card" data-id="${c.id}" onclick="Wizard.selectCat(${c.id})">
                <div class="cat-icon" style="background:${c.color || 'rgba(139,92,246,.12)'}">
                    ${iconHTML(c.icon)}
                </div>
                <div class="cat-name">${escHtml(c.name)}</div>
            </div>`).join('');
    },

    renderLocs() {
        const el = document.getElementById('ticket-location-id');
        if (!el) return;
        el.innerHTML = '<option value="">Sin especificar</option>' +
            this.locations.map(l => `<option value="${l.id}">${escHtml(l.name)}</option>`).join('');
    },

    selectCat(id) {
        document.querySelectorAll('.cat-card').forEach(c => c.classList.remove('selected'));
        document.querySelector(`.cat-card[data-id="${id}"]`)?.classList.add('selected');
        document.getElementById('hidden-cat').value = id;
    },

    next(step) {
        if (step === 1) {
            if (!document.getElementById('hidden-cat').value) { toast('Seleccioná una categoría', 'warning'); return; }
        }
        if (step === 2) {
            const t = document.getElementById('ticket-title')?.value.trim() || '';
            if (t.length < 3)  { toast('El título es muy corto', 'warning'); return; }
            // Descripción ahora es OPCIONAL — no se valida longitud
            // CI: si el usuario no lo tiene en el perfil, es obligatorio acá
            const ciField = document.getElementById('ticket-ci');
            if (ciField && !ciField.disabled) {
                const ci = ciField.value.trim();
                if (ci.length < 4) { toast('Ingresá tu CI para continuar', 'warning'); ciField.focus(); return; }
            }
        }
        if (step === 3) this.fillSummary();
        this.goto(step + 1);
    },

    back(step) { this.goto(step - 1); },

    goto(n) {
        this.step = n;
        document.querySelectorAll('.wizard-step').forEach((s, i) => {
            s.classList.toggle('active', i+1 === n);
            s.classList.toggle('done',   i+1 < n);
        });
        document.querySelectorAll('.wizard-panel').forEach(p =>
            p.classList.toggle('active', +p.dataset.step === n));
        if (n === 2 && !Media.gps) setTimeout(() => Media.detectGPS(), 300);
    },

    fillSummary() {
        const cat = this.categories.find(c => c.id == document.getElementById('hidden-cat').value);
        const loc = this.locations.find(l => l.id == document.getElementById('ticket-location-id')?.value);
        const pr  = document.querySelector('input[name="priority"]:checked')?.value || 'media';
        const pe  = {urgente:'🔴',alta:'🟠',media:'🟡',baja:'🟢'};
        const at  = {remoto:'💻 Remoto',presencial:'🚶 Presencial',telefonico:'📞 Teléfono',whatsapp:'💬 WhatsApp'};

        const sb = document.getElementById('summary-box');
        if (sb) sb.innerHTML = `
            <div class="summary-row"><span class="sl">Categoría</span><span class="sv">${cat?.name||'-'}</span></div>
            <div class="summary-row"><span class="sl">Título</span><span class="sv">${escHtml(document.getElementById('ticket-title')?.value||'')}</span></div>
            <div class="summary-row"><span class="sl">Prioridad</span><span class="sv">${pe[pr]} ${pr}</span></div>
            <div class="summary-row"><span class="sl">Asistencia</span><span class="sv">${at[document.getElementById('ticket-assistance-type')?.value]||'-'}</span></div>
            <div class="summary-row"><span class="sl">Sucursal</span><span class="sv">${loc?.name||'-'}</span></div>
            <div class="summary-row"><span class="sl">Evidencias</span><span class="sv">${Media.files.length} archivo(s)</span></div>`;

        // Auto-data
        const u = App.state.user;
        const ci = document.getElementById('ticket-ci')?.value.trim() || u?.ci || '-';
        document.getElementById('auto-datetime').textContent = new Date().toLocaleString('es-PY');
        document.getElementById('auto-user').textContent     = `${u?.full_name || u?.email || '-'}${ci && ci!=='-' ? ` · CI ${ci}` : ''}`;
        document.getElementById('auto-device').textContent   = `${Media.getDevice().device_type} · ${Media.getDevice().device_os}`;
        document.getElementById('auto-gps').textContent      = Media.gps
            ? `${Media.gps.gps_latitude.toFixed(4)}, ${Media.gps.gps_longitude.toFixed(4)}`
            : 'No detectado';
    },

    async submit() {
        const btn = document.getElementById('wizard-submit');
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
        try {
            const ciVal = document.getElementById('ticket-ci')?.value.trim() || null;
            const data = {
                title:           document.getElementById('ticket-title')?.value.trim(),
                description:     document.getElementById('ticket-desc')?.value.trim() || null,
                category_id:     parseInt(document.getElementById('hidden-cat').value),
                priority:        document.querySelector('input[name="priority"]:checked')?.value || 'media',
                location_id:     parseInt(document.getElementById('ticket-location-id')?.value) || null,
                location:        document.getElementById('ticket-location-detail')?.value.trim() || null,
                assistance_type: document.getElementById('ticket-assistance-type')?.value,
                requester_phone: document.getElementById('ticket-phone')?.value.trim() || null,
                requester_ci:    ciVal,
                ...Media.getDevice(),
                ...(Media.gps || {}),
            };

            // Si el usuario ingresó un CI nuevo (no lo tenía en el perfil), lo guardamos
            const ciField = document.getElementById('ticket-ci');
            if (ciField && !ciField.disabled && ciVal && (!App.state.user?.ci)) {
                try {
                    await api.updateMe({ ci: ciVal });
                    App.state.user.ci = ciVal;
                    localStorage.setItem('user', JSON.stringify(App.state.user));
                } catch (e) { /* no bloquear el ticket si falla guardar el CI */ }
            }

            const ticket = await api.createTicket(data);

            // Upload files
            if (Media.files.length) {
                for (const {file, duration} of Media.files) {
                    try { await api.uploadAttachment(ticket.id, file, duration); }
                    catch(e) { toast(`Error subiendo ${file.name}`, 'warning'); }
                }
            }
            this.showSuccess(ticket);
            this.reset();
        } catch(e) {
            toast('Error al crear ticket: ' + e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Enviar solicitud'; }
        }
    },

    showSuccess(ticket) {
        document.getElementById('success-num').textContent = `#${ticket.ticket_number}`;
        const cat = this.categories.find(c => c.id == ticket.category_id);
        document.getElementById('success-cat').textContent  = cat?.name || 'Soporte IT';
        document.getElementById('success-prio').textContent = ticket.priority;
        document.getElementById('success-sla').textContent  = ticket.sla_deadline
            ? `Antes de ${new Date(ticket.sla_deadline).toLocaleString('es-PY')}`
            : '-';

        // WhatsApp
        const cfg = App.state.config;
        const wpEnabled = cfg.whatsapp_enabled === 'true';
        const wpSection = document.getElementById('wp-section');
        if (wpEnabled && (cat?.whatsapp_number || cfg.whatsapp_support_number)) {
            const msg = this._wpMsg(ticket, cat, cfg);
            document.getElementById('wp-preview').textContent = msg;
            window._wpData = { number: cat?.whatsapp_number || cfg.whatsapp_support_number, message: msg };
            if (wpSection) wpSection.style.display = 'block';
            if (cfg.whatsapp_auto_open === 'true') setTimeout(() => Wizard.sendWp(), 500);
        } else {
            if (wpSection) wpSection.style.display = 'none';
        }

        openModal('modal-success');
    },

    _wpMsg(ticket, cat, cfg) {
        const u = App.state.user;
        const pe = {urgente:'🔴',alta:'🟠',media:'🟡',baja:'🟢'};
        return `🎫 *NUEVO TICKET — OMMEGANET CORE*
*#${ticket.ticket_number}*

🏢 ${cfg.company_name||'Empresa'}
👤 ${ticket.requester_name}${u?.department?`\n🏬 ${u.department}`:''}${ticket.requester_phone?`\n📞 ${ticket.requester_phone}`:''}${ticket.location?`\n📍 ${ticket.location}`:''}

🏷️ ${cat?.name||'General'}
${pe[ticket.priority]} Prioridad: *${ticket.priority.toUpperCase()}*

📝 *${ticket.title}*

${ticket.description}

━━━━━━━━━━━
🕐 ${new Date(ticket.created_at).toLocaleString('es-PY')}
📊 Ommeganet CORE`;
    },

    sendWp() {
        if (!window._wpData) return;
        const { number, message } = window._wpData;
        window.open(`https://wa.me/${number.replace(/\D/g,'')}?text=${encodeURIComponent(message)}`, '_blank');
        closeModal('modal-success');
        switchView('tickets');
        App.loadTickets();
    },

    reset() {
        document.getElementById('new-ticket-form')?.reset();
        document.getElementById('hidden-cat').value = '';
        document.querySelectorAll('.cat-card').forEach(c => c.classList.remove('selected'));
        document.querySelector('input[name="priority"][value="media"]').checked = true;
        Media.clear(); Media.gps = null;
        this.goto(1);
    },
};
