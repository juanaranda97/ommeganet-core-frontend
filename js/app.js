// ============================================================
// OMMEGANET CORE — App Principal
// ============================================================

const App = {
    state: {
        user:    null,
        context: null,   // multi-tenant context
        config:  {},
        tickets: [],
        allTickets: [],
        notifications: [],
        charts: {},
    },

    // ============================================================
    // INIT
    // ============================================================
    async init() {
        const token   = localStorage.getItem('access_token');
        const userStr = localStorage.getItem('user');
        if (token && userStr) {
            // Mostramos la app de una con los datos guardados (optimista)
            try {
                this.state.user = JSON.parse(userStr);
                api.setToken(token);
                await this.startApp();
            } catch (e) {
                console.error('startApp error:', e);
            }

            // Validamos el token en segundo plano SIN desloguear por errores de red
            api.getMe()
                .then(fresh => {
                    this.state.user = fresh;
                    localStorage.setItem('user', JSON.stringify(fresh));
                    this.updateUserUI();
                })
                .catch(err => {
                    // Solo deslogueamos si el token es inválido (401), no por timeout/red
                    if (err && err.message && err.message.includes('Sesión expirada')) {
                        this.logout();
                    }
                    // Si es error de red/timeout (Render dormido), mantenemos la sesión
                });
        } else {
            this.showAuth();
        }
        const ls = document.getElementById('loading-screen');
        if (ls) ls.style.display = 'none';
    },

    logout() {
        api.setToken(null);
        localStorage.removeItem('user');
        localStorage.removeItem('access_token');
        this.showAuth();
    },

    showAuth() {
        document.getElementById('auth-view').style.display = 'flex';
        document.getElementById('app-shell').style.display = 'none';
    },

    async startApp() {
        document.getElementById('auth-view').style.display  = 'none';
        document.getElementById('app-shell').style.display  = 'block';
        document.getElementById('app-shell').className      = 'app-shell';

        // Cargar contexto multi-tenant
        try { this.state.context = await api.getMyContext(); }
        catch { this.state.context = null; }

        this.updateUserUI();
        this.showRoleItems();
        this.restoreImpersonation();
        await this.loadConfig();
        await Wizard.init();
        await this.loadDashboard();

        this.loadNotifications();
        setInterval(() => this.loadNotifications(), CONFIG.NOTIFICATION_REFRESH_MS);
    },

    updateUserUI() {
        const u    = this.state.user;
        const name = u?.full_name || u?.email || 'Usuario';
        const init = name.charAt(0).toUpperCase();
        const role = this.state.context?.role || u?.role || 'usuario';
        const org  = this.state.context?.organization_name || 'Ommeganet CORE';

        setText('sb-user-name', name);
        setText('sb-user-role', role);
        setText('sb-avatar', init);
        setText('tb-org-name', org);
        setText('welcome-name', name.split(' ')[0]);
    },

    showRoleItems() {
        const role = this.state.context?.role || this.state.user?.role || 'usuario';
        document.querySelectorAll('[data-roles]').forEach(el => {
            const allowed = el.dataset.roles.split(',');
            el.style.display = allowed.includes(role) || allowed.includes('*') ? '' : 'none';
        });
        // SLA section for tecnico+
        const isTech = ['tecnico','supervisor','admin','org_admin','platform_admin','platform_owner','superadmin'].includes(role);
        document.querySelectorAll('.sla-row').forEach(el => el.style.display = isTech ? '' : 'none');
    },

    isPlatform() {
        return this.state.context?.is_platform_user === true;
    },

    // ============================================================
    // ORGANIZACIONES (multi-tenant)
    // ============================================================
    loadOrganizations() {
        if (typeof Orgs !== 'undefined') Orgs.load();
    },

    // Banner cuando Ommeganet está viendo datos de otra org
    showImpersonationBanner(orgName) {
        let banner = document.getElementById('impersonation-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'impersonation-banner';
            banner.className = 'impersonation-banner';
            document.body.appendChild(banner);
        }
        banner.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>Estás viendo: <strong>${escHtml(orgName)}</strong></span>
            <button onclick="App.exitImpersonation()">Salir</button>`;
        banner.classList.add('show');
        document.body.classList.add('has-impersonation');
    },

    exitImpersonation() {
        api.clearActiveOrg();
        localStorage.removeItem('impersonating');
        const banner = document.getElementById('impersonation-banner');
        if (banner) banner.classList.remove('show');
        document.body.classList.remove('has-impersonation');
        toast('Volviste a tu vista de Ommeganet', 'success');
        switchView('dashboard');
        this.loadDashboard();
    },

    // Restaurar impersonation si venía de una sesión anterior
    restoreImpersonation() {
        try {
            const saved = JSON.parse(localStorage.getItem('impersonating') || 'null');
            if (saved && saved.id) {
                api.setActiveOrg(saved.id, null);
                this.showImpersonationBanner(saved.name);
            }
        } catch {}
    },

    isTech() {
        const r = this.state.context?.role || this.state.user?.role || '';
        return ['tecnico','supervisor','admin','org_admin','company_admin','manager','platform_admin','platform_owner','superadmin'].includes(r);
    },

    // ============================================================
    // CONFIG
    // ============================================================
    async loadConfig() {
        try {
            const list = await api.getConfig();
            this.state.config = Object.fromEntries(list.map(c => [c.key, c.value]));
        } catch {}
    },

    // ============================================================
    // DASHBOARD
    // ============================================================
    async loadDashboard() {
        try {
            const stats = this.isTech() ? await api.getAllStats() : await api.getMyStats();
            setText('stat-pending',  stats.pendientes  || 0);
            setText('stat-progress', stats.en_curso     || 0);
            setText('stat-done',     stats.completadas  || 0);
            setText('stat-urgent',   stats.urgentes     || 0);

            if (this.isTech()) {
                setText('kpi-sla',     stats.sla_compliance_pct != null ? `${stats.sla_compliance_pct}%` : '--');
                setText('kpi-overdue', stats.sla_overdue || 0);
                setText('kpi-avg',     stats.avg_response_min != null ? `${Math.round(stats.avg_response_min)}m` : '--');
                setText('kpi-nps',     stats.avg_satisfaction != null ? stats.avg_satisfaction.toFixed(1) : '--');
            }

            const recent = this.isTech() ? await api.getAllTickets({}) : await api.getMyTickets({});
            this.renderRecentTickets((recent||[]).slice(0,5));
            this.renderCharts(stats);
        } catch(e) {
            toast('Error cargando dashboard: ' + e.message, 'error');
        }
    },

    renderRecentTickets(tickets) {
        const el = document.getElementById('recent-list');
        if (!el) return;
        if (!tickets.length) {
            el.innerHTML = `<div class="empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg><h3>Sin tickets aún</h3><p>Creá tu primera solicitud</p></div>`;
            return;
        }
        el.innerHTML = tickets.map(t => this.ticketRowHTML(t)).join('');
    },

    ticketRowHTML(t) {
        const cat = Wizard.categories.find(c => c.id == t.category_id);
        return `<div class="ticket-row" onclick="App.openTicket('${t.id}')">
            <span class="row-id">#${t.ticket_number}</span>
            <div class="flex-1">
                <div style="font-size:13px;font-weight:600;margin-bottom:3px;">${escHtml(t.title)}</div>
                <div style="font-size:11px;color:var(--text-2)">${cat?.name||'General'} · ${timeAgo(t.created_at)}</div>
            </div>
            <span class="badge badge-${t.priority}">${t.priority}</span>
            <span class="badge badge-${t.status}">${t.status.replace('_',' ')}</span>
        </div>`;
    },

    renderCharts(stats) {
        const ctxS = document.getElementById('chart-status');
        if (ctxS) {
            this.state.charts.status?.destroy();
            this.state.charts.status = new Chart(ctxS, {
                type:'doughnut',
                data:{
                    labels:['Pendiente','En curso','Completada','Cancelada'],
                    datasets:[{
                        data:[stats.pendientes||0, stats.en_curso||0, stats.completadas||0, stats.canceladas||0],
                        backgroundColor:['#fbbf24','#22d3ee','#4ade80','#f87171'],
                        borderWidth:0,
                    }]
                },
                options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:'#a8acd1', boxWidth:10 } } }, cutout:'68%' }
            });
        }
        const ctxA = document.getElementById('chart-activity');
        if (ctxA) {
            this.state.charts.activity?.destroy();
            const labels=[], data=[];
            for(let i=6;i>=0;i--) {
                const d=new Date(); d.setDate(d.getDate()-i);
                labels.push(d.toLocaleDateString('es-PY',{weekday:'short'}));
                data.push(Math.floor(Math.random()*6)); // TODO: backend real
            }
            this.state.charts.activity = new Chart(ctxA, {
                type:'line',
                data:{ labels, datasets:[{ label:'Tickets', data, borderColor:'#8b5cf6', backgroundColor:'rgba(139,92,246,.1)', tension:.4, fill:true, pointBackgroundColor:'#8b5cf6' }] },
                options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#6b6e94',font:{size:11}}}, y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#6b6e94',font:{size:11}}} } }
            });
        }
    },

    // ============================================================
    // TICKETS
    // ============================================================
    async loadTickets() {
        try {
            const f = {
                search:   document.getElementById('search-my')?.value||'',
                status:   document.getElementById('filter-my-status')?.value||'',
                priority: document.getElementById('filter-my-priority')?.value||'',
            };
            this.state.tickets = await api.getMyTickets(f) || [];
            this.renderTicketTable(this.state.tickets, 'my-tickets-tbody');
        } catch(e) { toast('Error cargando tickets: ' + e.message, 'error'); }
    },

    async loadAllTickets() {
        try {
            const f = {
                search:     document.getElementById('search-all')?.value||'',
                status:     document.getElementById('filter-all-status')?.value||'',
                priority:   document.getElementById('filter-all-priority')?.value||'',
                sla_status: document.getElementById('filter-all-sla')?.value||'',
            };
            this.state.allTickets = await api.getAllTickets(f) || [];
            this.renderTicketTable(this.state.allTickets, 'all-tickets-tbody', true);
        } catch(e) { toast('Error cargando tickets: ' + e.message, 'error'); }
    },

    renderTicketTable(tickets, tbodyId, showRequester=false) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        if (!tickets.length) {
            tbody.innerHTML = `<tr><td colspan="8"><div class="empty" style="padding:32px"><h3>Sin tickets</h3></div></td></tr>`;
            return;
        }
        tbody.innerHTML = tickets.map(t => {
            const cat = Wizard.categories.find(c => c.id == t.category_id);
            const req = showRequester ? `<td>${escHtml(t.requester_name||'')}</td>` : '';
            return `<tr onclick="App.openTicket('${t.id}')">
                <td><span class="row-id">#${t.ticket_number}</span></td>
                ${req}
                <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(t.title)}</td>
                <td>${cat?.name||'-'}</td>
                <td><span class="badge badge-${t.status}">${t.status.replace('_',' ')}</span></td>
                <td><div class="priority prio-${t.priority}"><div class="prio-dot"></div>${t.priority}</div></td>
                <td>${t.sla_status ? `<span class="badge badge-${t.sla_status}">${t.sla_status}</span>` : '-'}</td>
                <td style="font-size:11px;color:var(--text-2)">${fmtDate(t.created_at)}</td>
            </tr>`;
        }).join('');
    },

    async openTicket(id) {
        try {
            const [ticket, attachments, comments] = await Promise.all([
                api.getTicket(id), api.getAttachments(id), api.getComments(id)
            ]);
            const cat     = Wizard.categories.find(c => c.id == ticket.category_id);
            const isOwner = ticket.requester_id === this.state.user?.id;
            const isTech  = this.isTech();
            const canClose = isTech && !['completada','cancelada'].includes(ticket.status);
            const canSurvey= isOwner && ticket.status==='completada' && !ticket.satisfaction_rating;

            document.getElementById('modal-ticket-num').textContent   = `#${ticket.ticket_number}`;
            document.getElementById('modal-ticket-title').textContent = ticket.title;

            document.getElementById('modal-ticket-body').innerHTML = `
                <div class="ticket-detail">
                    <div>
                        <h4 style="margin-bottom:10px;">Descripción</h4>
                        <div style="background:var(--bg-2);border:1px solid var(--border-0);border-radius:var(--r-md);padding:14px;font-size:13px;color:var(--text-1);line-height:1.6;white-space:pre-wrap;">${escHtml(ticket.description)}</div>

                        ${attachments.length ? `
                        <h4 style="margin:18px 0 10px;">Evidencias (${attachments.length})</h4>
                        <div style="display:flex;gap:10px;flex-wrap:wrap;">
                            ${attachments.map(a => this.attachHTML(a)).join('')}
                        </div>` : ''}

                        ${ticket.resolution_notes ? `
                        <h4 style="margin:18px 0 10px;">Resolución</h4>
                        <div style="background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.2);border-radius:var(--r-md);padding:14px;font-size:13px;color:var(--text-1);">${escHtml(ticket.resolution_notes)}</div>` : ''}

                        <div style="margin-top:20px;">
                            <h4 style="margin-bottom:12px;">Comentarios (${comments.length})</h4>
                            <div class="comments">
                                ${comments.map(c => `
                                    <div class="comment">
                                        <div class="avatar sm">${(c.user_name||'U').charAt(0).toUpperCase()}</div>
                                        <div class="comment-body">
                                            <div class="comment-header">
                                                <span class="comment-author">${escHtml(c.user_name||'')}</span>
                                                <span class="comment-time">${timeAgo(c.created_at)}</span>
                                            </div>
                                            <div class="comment-text">${escHtml(c.comment)}</div>
                                        </div>
                                    </div>`).join('')}
                            </div>
                            <div class="comment-input" style="margin-top:14px;">
                                <textarea id="new-comment" placeholder="Agregar comentario..." style="min-height:60px;"></textarea>
                                <button class="btn btn-primary btn-sm" onclick="App.addComment('${ticket.id}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="ticket-meta">
                        <div class="meta-row"><div class="meta-label">Estado</div><div class="meta-val"><span class="badge badge-${ticket.status}">${ticket.status.replace('_',' ')}</span></div></div>
                        <div class="meta-row"><div class="meta-label">Prioridad</div><div class="meta-val"><span class="badge badge-${ticket.priority}">${ticket.priority}</span></div></div>
                        <div class="meta-row"><div class="meta-label">Solicitante</div><div class="meta-val">${escHtml(ticket.requester_name||'')}</div></div>
                        ${ticket.requester_phone ? `<div class="meta-row"><div class="meta-label">Teléfono</div><div class="meta-val">${ticket.requester_phone}</div></div>` : ''}
                        ${cat ? `<div class="meta-row"><div class="meta-label">Categoría</div><div class="meta-val">${cat.name}</div></div>` : ''}
                        ${ticket.location ? `<div class="meta-row"><div class="meta-label">Ubicación</div><div class="meta-val">${escHtml(ticket.location)}</div></div>` : ''}
                        <div class="meta-row"><div class="meta-label">Asistencia</div><div class="meta-val">${ticket.assistance_type||'remoto'}</div></div>
                        <div class="meta-row"><div class="meta-label">Creado</div><div class="meta-val" style="font-size:12px;">${fmtDate(ticket.created_at)}</div></div>
                        ${ticket.sla_deadline ? `<div class="meta-row"><div class="meta-label">SLA</div><div class="meta-val" style="font-size:12px;">${fmtDate(ticket.sla_deadline)}</div></div>` : ''}
                        ${ticket.device_type ? `<div class="meta-row"><div class="meta-label">Dispositivo</div><div class="meta-val" style="font-size:12px;">${ticket.device_type} · ${ticket.device_os}</div></div>` : ''}
                        ${ticket.gps_latitude ? `<div class="meta-row"><div class="meta-label">GPS</div><a href="https://maps.google.com/?q=${ticket.gps_latitude},${ticket.gps_longitude}" target="_blank" style="font-size:12px;">Ver en mapa →</a></div>` : ''}

                        ${isTech && ticket.status==='pendiente' ? `<button class="btn btn-primary btn-full" style="margin-top:12px;" onclick="App.changeStatus('${ticket.id}','en_curso')">▶ Tomar ticket</button>` : ''}
                        ${canClose ? `<button class="btn btn-ghost btn-full" style="margin-top:8px;" onclick="App.openClose('${ticket.id}')">✓ Cerrar ticket</button>` : ''}
                        ${canSurvey ? `<button class="btn btn-ghost btn-full" style="margin-top:8px;" onclick="App.openSurvey('${ticket.id}')">★ Calificar servicio</button>` : ''}
                    </div>
                </div>`;
            openModal('modal-ticket');
        } catch(e) { toast('Error: ' + e.message, 'error'); }
    },

    attachHTML(a) {
        if (a.attachment_type==='image') return `<div class="file-thumb" onclick="window.open('${a.file_url}','_blank')"><img src="${a.file_url}" alt="${escHtml(a.file_name)}"><div class="file-name">${escHtml(a.file_name)}</div></div>`;
        if (a.attachment_type==='video') return `<div class="file-thumb"><video src="${a.file_url}" controls></video><div class="file-name">${escHtml(a.file_name)}</div></div>`;
        if (a.attachment_type==='audio') return `<div class="file-thumb"><audio src="${a.file_url}" controls></audio><div class="file-name">${escHtml(a.file_name)}</div></div>`;
        return `<div class="file-thumb" onclick="window.open('${a.file_url}','_blank')"><div style="padding:20px;font-size:28px;">📄</div><div class="file-name">${escHtml(a.file_name)}</div></div>`;
    },

    async addComment(ticketId) {
        const ta = document.getElementById('new-comment');
        const text = ta?.value.trim();
        if (!text) return;
        try { await api.addComment(ticketId, text); ta.value=''; await this.openTicket(ticketId); toast('Comentario agregado','success'); }
        catch(e) { toast('Error: ' + e.message,'error'); }
    },

    async changeStatus(ticketId, status) {
        try { await api.updateTicket(ticketId, {status}); await this.openTicket(ticketId); toast('Estado actualizado','success'); }
        catch(e) { toast('Error: ' + e.message,'error'); }
    },

    openClose(ticketId) {
        window._closingTicket = ticketId;
        closeModal('modal-ticket');
        SigPad.init();
        openModal('modal-signature');
    },

    async closeWithSig(ticketId, sig) {
        const notes = prompt('Notas de resolución (opcional):') || 'Resuelto.';
        try {
            await api.closeTicket(ticketId, { technician_signature:sig, resolution_notes:notes });
            closeModal('modal-signature');
            toast('Ticket cerrado','success');
            await this.loadDashboard();
            await this.loadAllTickets();
        } catch(e) { toast('Error: '+e.message,'error'); }
    },

    openSurvey(ticketId) {
        document.getElementById('survey-ticket-id').value = ticketId;
        document.querySelectorAll('.star').forEach(s => s.classList.remove('active'));
        closeModal('modal-ticket');
        openModal('modal-survey');
    },

    // ============================================================
    // USERS
    // ============================================================
    async loadUsers() {
        try {
            const users = await api.getUsers();
            const tbody = document.getElementById('users-tbody');
            if (!tbody) return;
            tbody.innerHTML = users.map(u => `
                <tr>
                    <td><div class="row-avatar-cell"><div class="avatar sm">${(u.full_name||'U').charAt(0).toUpperCase()}</div>${escHtml(u.full_name||'')}</div></td>
                    <td style="font-size:12px;color:var(--text-2)">${escHtml(u.email||'')}</td>
                    <td style="font-size:12px">${escHtml(u.department||'-')}</td>
                    <td>
                        <select onchange="App.changeRole('${u.id}',this.value)" ${u.id===this.state.user?.id?'disabled':''} style="width:auto;padding:5px 28px 5px 10px;font-size:12px;">
                            ${['usuario','tecnico','supervisor','admin','rrhh'].map(r=>`<option ${u.role===r?'selected':''}>${r}</option>`).join('')}
                        </select>
                    </td>
                    <td><span class="user-status ${u.estado_laboral||'activo'}"><span class="us-dot"></span>${u.estado_laboral||'activo'}</span></td>
                    <td>
                        <button class="btn btn-ghost btn-sm" onclick="App.toggleUser('${u.id}')" ${u.id===this.state.user?.id?'disabled':''}>
                            ${u.is_active!==false?'Desactivar':'Activar'}
                        </button>
                    </td>
                </tr>`).join('');
        } catch(e) { toast('Error cargando usuarios: '+e.message,'error'); }
    },

    async changeRole(uid, role)  {
        try { await api.changeUserRole(uid, role); toast('Rol actualizado','success'); }
        catch(e) { toast('Error: '+e.message,'error'); }
    },
    async toggleUser(uid) {
        try { await api.toggleUserActive(uid); await this.loadUsers(); }
        catch(e) { toast('Error: '+e.message,'error'); }
    },

    // ============================================================
    // NOTIFICATIONS
    // ============================================================
    async loadNotifications() {
        try {
            this.state.notifications = await api.getNotifications() || [];
            const unread = this.state.notifications.filter(n=>!n.is_read).length;
            const dot = document.getElementById('notif-dot');
            if (dot) dot.className = `notif-dot ${unread>0?'show':''}`;
            const badge = document.getElementById('badge-notif');
            if (badge) { badge.textContent=unread; badge.style.display=unread>0?'':'none'; }

            const list = document.getElementById('notif-list');
            if (!list) return;
            if (!this.state.notifications.length) {
                list.innerHTML = '<div class="notif-empty">Sin notificaciones</div>';
                return;
            }
            list.innerHTML = this.state.notifications.map(n => `
                <div class="notif-item ${!n.is_read?'unread':''}" onclick="App.handleNotif('${n.id}','${n.ticket_id||''}')">
                    <div class="notif-title">${escHtml(n.title||'')}</div>
                    <div class="notif-msg">${escHtml(n.message||'')}</div>
                    <div class="notif-time">${timeAgo(n.created_at)}</div>
                </div>`).join('');
        } catch {}
    },

    async handleNotif(id, ticketId) {
        try { await api.markRead(id); await this.loadNotifications(); }
        catch {}
        if (ticketId) { document.getElementById('notif-panel')?.classList.remove('open'); await this.openTicket(ticketId); }
    },

    // ============================================================
    // SETTINGS
    // ============================================================
    async loadSettings() {
        await this.loadConfig();
        const c = this.state.config;
        const fields = {
            'cfg-wp-number': 'whatsapp_support_number',
            'cfg-company':   'company_name',
            'cfg-sla-u':     'sla_urgente_hours',
            'cfg-sla-a':     'sla_alta_hours',
            'cfg-sla-m':     'sla_media_hours',
            'cfg-sla-b':     'sla_baja_hours',
        };
        for (const [id, key] of Object.entries(fields)) {
            const el = document.getElementById(id);
            if (el) el.value = c[key] || '';
        }
        const ck1 = document.getElementById('cfg-wp-enabled');
        const ck2 = document.getElementById('cfg-wp-auto');
        if (ck1) ck1.checked = c.whatsapp_enabled === 'true';
        if (ck2) ck2.checked = c.whatsapp_auto_open === 'true';
    },

    async saveSettings() {
        try {
            const updates = {
                whatsapp_support_number: document.getElementById('cfg-wp-number')?.value || '',
                company_name:            document.getElementById('cfg-company')?.value   || '',
                whatsapp_enabled:        String(document.getElementById('cfg-wp-enabled')?.checked || false),
                whatsapp_auto_open:      String(document.getElementById('cfg-wp-auto')?.checked   || false),
                sla_urgente_hours:       document.getElementById('cfg-sla-u')?.value || '2',
                sla_alta_hours:          document.getElementById('cfg-sla-a')?.value || '8',
                sla_media_hours:         document.getElementById('cfg-sla-m')?.value || '24',
                sla_baja_hours:          document.getElementById('cfg-sla-b')?.value || '72',
            };
            await api.bulkUpdateConfig(updates);
            await this.loadConfig();
            toast('Configuración guardada','success');
        } catch(e) { toast('Error: '+e.message,'error'); }
    },
};

// ============================================================
// SIGNATURE PAD
// ============================================================
const SigPad = {
    canvas:null, ctx:null, drawing:false,
    init() {
        this.canvas = document.getElementById('sig-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.ctx.lineWidth=2; this.ctx.lineCap='round'; this.ctx.strokeStyle='#1e293b';
        this.clear();
        const pos = e => {
            const r=this.canvas.getBoundingClientRect();
            const ev=e.touches?e.touches[0]:e;
            return { x:(ev.clientX-r.left)*(this.canvas.width/r.width), y:(ev.clientY-r.top)*(this.canvas.height/r.height) };
        };
        this.canvas.onmousedown=e=>{ this.drawing=true; const p=pos(e); this.ctx.beginPath(); this.ctx.moveTo(p.x,p.y); };
        this.canvas.onmousemove=e=>{ if(!this.drawing) return; const p=pos(e); this.ctx.lineTo(p.x,p.y); this.ctx.stroke(); };
        this.canvas.onmouseup=this.canvas.onmouseleave=()=>{ this.drawing=false; };
        this.canvas.ontouchstart=e=>{ e.preventDefault(); this.drawing=true; const p=pos(e); this.ctx.beginPath(); this.ctx.moveTo(p.x,p.y); };
        this.canvas.ontouchmove=e=>{ e.preventDefault(); if(!this.drawing) return; const p=pos(e); this.ctx.lineTo(p.x,p.y); this.ctx.stroke(); };
        this.canvas.ontouchend=()=>{ this.drawing=false; };
    },
    clear() { if(!this.ctx) return; this.ctx.fillStyle='#fff'; this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height); },
    isEmpty() {
        const d=this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height).data;
        for(let i=0;i<d.length;i+=4) if(d[i]!==255||d[i+1]!==255||d[i+2]!==255) return false;
        return true;
    },
    save() {
        if(this.isEmpty()) { toast('Firmá antes de confirmar','warning'); return; }
        App.closeWithSig(window._closingTicket, this.canvas.toDataURL('image/png'));
    },
};

// ============================================================
// NAVIGATION
// ============================================================
function switchView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('[data-view]').forEach(n => n.classList.remove('active'));

    const vEl = document.getElementById(`view-${view}`);
    if (vEl) vEl.classList.add('active');
    document.querySelectorAll(`[data-view="${view}"]`).forEach(n => n.classList.add('active'));

    const titles = {
        dashboard:'Inicio', 'new-ticket':'Nueva solicitud', tickets:'Mis tickets',
        'all-tickets':'Cola de tickets', users:'Usuarios', reports:'Reportes',
        settings:'Configuración', organizations:'Organizaciones',
    };
    setText('page-title', titles[view]||view);

    if (view==='dashboard')    App.loadDashboard();
    if (view==='tickets')      App.loadTickets();
    if (view==='all-tickets')  App.loadAllTickets();
    if (view==='users')        App.loadUsers();
    if (view==='settings')     App.loadSettings();
    if (view==='organizations') App.loadOrganizations?.();

    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('notif-panel')?.classList.remove('open');
}

function openModal(id)  { const el=document.getElementById(id); if(el) el.classList.add('open'); }
function closeModal(id) { const el=document.getElementById(id); if(el) el.classList.remove('open'); }

function toggleNotif() {
    document.getElementById('notif-panel')?.classList.toggle('open');
}

async function markAllRead() {
    try { await api.markAllRead(); await App.loadNotifications(); } catch {}
}

function toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('open');
}

// ============================================================
// UTILITIES
// ============================================================
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function escHtml(s) {
    return String(s||'')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fmtDate(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('es-PY',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
}

function timeAgo(iso) {
    if (!iso) return '';
    const s = Math.floor((Date.now() - new Date(iso))/1000);
    if (s<60) return 'recién';
    const m=Math.floor(s/60); if(m<60) return `hace ${m}m`;
    const h=Math.floor(m/60); if(h<24) return `hace ${h}h`;
    const d=Math.floor(h/24); return d<7 ? `hace ${d}d` : fmtDate(iso);
}

function exportCSV(tickets, name='tickets') {
    if (!tickets.length) { toast('Sin datos para exportar','warning'); return; }
    const h=['#','Título','Solicitante','Estado','Prioridad','SLA','Fecha'];
    const rows = tickets.map(t=>[t.ticket_number,t.title,t.requester_name,t.status,t.priority,t.sla_status||'',fmtDate(t.created_at)]);
    const csv = [h,...rows].map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
    a.download=`${name}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

function toast(message, type='info') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const icons = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span style="font-size:15px">${icons[type]||'ℹ'}</span><span>${escHtml(message)}</span>`;
    c.appendChild(el);
    setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(20px)'; setTimeout(()=>el.remove(), 300); }, CONFIG.TOAST_DURATION_MS);
}

// ============================================================
// EVENT LISTENERS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    App.init();

    // Auth tabs
    document.querySelectorAll('.auth-tab').forEach(t => {
        t.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab, .auth-form').forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            document.getElementById(`${t.dataset.tab}-form`)?.classList.add('active');
        });
    });

    // Login
    document.getElementById('login-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            await api.login(document.getElementById('login-email').value, document.getElementById('login-pw').value);
            App.state.user = JSON.parse(localStorage.getItem('user'));
            await App.startApp();
        } catch(e) { toast(e.message,'error'); }
        finally { btn.disabled = false; }
    });

    // Register
    document.getElementById('register-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            await api.register({
                email:      document.getElementById('reg-email').value,
                password:   document.getElementById('reg-pw').value,
                full_name:  document.getElementById('reg-name').value,
                phone:      document.getElementById('reg-phone').value||null,
                whatsapp:   document.getElementById('reg-wa').value||null,
                department: document.getElementById('reg-dept').value||null,
            });
            App.state.user = JSON.parse(localStorage.getItem('user'));
            await App.startApp();
        } catch(e) { toast(e.message,'error'); }
        finally { btn.disabled = false; }
    });

    // Nav
    document.querySelectorAll('[data-view]').forEach(el => {
        el.addEventListener('click', () => switchView(el.dataset.view));
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        if (!confirm('¿Cerrar sesión?')) return;
        await api.logout();
        localStorage.clear();
        window.location.reload();
    });

    // New ticket form
    document.getElementById('new-ticket-form')?.addEventListener('submit', e => {
        e.preventDefault(); Wizard.submit();
    });

    // Filters — debounce
    const debounce = (fn, ms=350) => { let t; return (...a) => { clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
    ['search-my','filter-my-status','filter-my-priority'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', debounce(() => App.loadTickets()));
    });
    ['search-all','filter-all-status','filter-all-priority','filter-all-sla'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', debounce(() => App.loadAllTickets()));
    });

    // Settings tabs
    document.querySelectorAll('.stab').forEach(t => {
        t.addEventListener('click', () => {
            document.querySelectorAll('.stab,.spanel').forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            document.querySelector(`.spanel[data-tab="${t.dataset.tab}"]`)?.classList.add('active');
        });
    });

    // Star ratings
    document.querySelectorAll('.star-rating').forEach(r => {
        r.querySelectorAll('.star').forEach(s => {
            s.addEventListener('click', () => {
                const v = +s.dataset.v;
                r.querySelectorAll('.star').forEach((x,i) => x.classList.toggle('active', i<v));
                r.dataset.v = v;
            });
        });
    });

    // Survey submit
    document.getElementById('survey-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const tid  = document.getElementById('survey-ticket-id').value;
        const data = {
            rating:             +(document.querySelector('.star-rating[data-name="overall"]')?.dataset.v||0),
            speed_rating:       +(document.querySelector('.star-rating[data-name="speed"]')?.dataset.v||0)||null,
            quality_rating:     +(document.querySelector('.star-rating[data-name="quality"]')?.dataset.v||0)||null,
            technician_rating:  +(document.querySelector('.star-rating[data-name="tech"]')?.dataset.v||0)||null,
            comment:            document.getElementById('survey-comment')?.value||null,
            would_recommend:    document.getElementById('survey-recommend')?.checked||false,
        };
        if (!data.rating) { toast('Por favor calificá','warning'); return; }
        try {
            await api.submitSurvey(tid, data);
            closeModal('modal-survey');
            toast('¡Gracias por tu opinión!','success');
            await App.loadDashboard();
        } catch(e) { toast('Error: '+e.message,'error'); }
    });

    // File inputs
    ['file-photo','file-video','file-any'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', e => {
            if (e.target.files.length) { Media.addFiles(e.target.files); e.target.value=''; }
        });
    });

    // Modal overlay click
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.addEventListener('click', e => {
            if (e.target === m && m.id !== 'modal-success' && m.id !== 'modal-signature') {
                m.classList.remove('open');
            }
        });
    });

    // Sidebar overlay on mobile
    document.addEventListener('click', e => {
        const sb = document.getElementById('sidebar');
        const mb = document.getElementById('mobile-menu-btn');
        if (sb?.classList.contains('open') && !sb.contains(e.target) && !mb?.contains(e.target)) {
            sb.classList.remove('open');
        }
    });
});
