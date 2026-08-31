// ============================================================
// OMMEGANET CORE — Export de tickets (Excel + PDF)
// ============================================================

const TicketExport = {
    // Abre el modal de export
    open(scope) {
        // scope: 'my' | 'all' — de qué lista exportar
        this.scope = scope || 'my';
        // Rango por defecto: mes actual
        const now = new Date();
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        document.getElementById('exp-from').value = this._fmtInput(first);
        document.getElementById('exp-to').value   = this._fmtInput(now);
        openModal('modal-export');
    },

    _fmtInput(d) {
        return d.toISOString().split('T')[0]; // yyyy-mm-dd
    },

    // Trae los tickets del scope y filtra por rango
    async _getData() {
        const from = document.getElementById('exp-from').value;
        const to   = document.getElementById('exp-to').value;
        if (!from || !to) { toast('Elegí el rango de fechas', 'warning'); return null; }

        const fromD = new Date(from + 'T00:00:00');
        const toD   = new Date(to   + 'T23:59:59');

        let tickets = [];
        try {
            tickets = this.scope === 'all'
                ? (App.state.allTickets.length ? App.state.allTickets : await api.getAllTickets({}))
                : (App.state.tickets.length    ? App.state.tickets    : await api.getMyTickets({}));
        } catch (e) {
            toast('Error trayendo tickets: ' + e.message, 'error');
            return null;
        }

        const filtered = (tickets || []).filter(t => {
            const c = new Date(t.created_at);
            return c >= fromD && c <= toD;
        });

        return { tickets: filtered, from, to };
    },

    // Arma las filas normalizadas (mismas columnas para Excel y PDF)
    _rows(tickets) {
        const cat = id => (Wizard.categories.find(c => c.id == id)?.name) || '-';
        return tickets.map(t => ({
            'N°': t.ticket_number,
            'Fecha apertura': fmtDate(t.created_at),
            'Solicitante': t.requester_name || '',
            'CI': t.requester_ci || '',
            'Título': t.title || '',
            'Descripción': t.description || '',
            'Categoría': cat(t.category_id),
            'Prioridad': t.priority || '',
            'Estado': (t.status || '').replace('_', ' '),
            'Sucursal': t.location || '',
            'Cierre': t.closed_at ? fmtDate(t.closed_at) : '',
            'Resolución': t.resolution_notes || '',
        }));
    },

    // ============================================================
    // EXCEL (.xlsx) con SheetJS
    // ============================================================
    async toExcel() {
        const data = await this._getData();
        if (!data) return;
        if (!data.tickets.length) { toast('No hay tickets en ese rango', 'warning'); return; }

        if (typeof XLSX === 'undefined') { toast('Librería de Excel no cargó, reintentá', 'error'); return; }

        const rows = this._rows(data.tickets);
        const ws = XLSX.utils.json_to_sheet(rows);
        // Anchos de columna
        ws['!cols'] = [
            {wch:8},{wch:18},{wch:22},{wch:12},{wch:30},{wch:40},
            {wch:16},{wch:10},{wch:12},{wch:16},{wch:18},{wch:40}
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Tickets');
        const fname = `tickets_${data.from}_a_${data.to}.xlsx`;
        XLSX.writeFile(wb, fname);
        closeModal('modal-export');
        toast(`${rows.length} tickets exportados a Excel`, 'success');
    },

    // ============================================================
    // PDF con jsPDF + autotable
    // ============================================================
    async toPDF() {
        const data = await this._getData();
        if (!data) return;
        if (!data.tickets.length) { toast('No hay tickets en ese rango', 'warning'); return; }

        if (typeof window.jspdf === 'undefined') { toast('Librería de PDF no cargó, reintentá', 'error'); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        // Encabezado
        doc.setFontSize(16);
        doc.setTextColor(139, 92, 246);
        doc.text('Ommeganet CORE — Reporte de Tickets', 14, 16);
        doc.setFontSize(10);
        doc.setTextColor(100);
        const orgName = App.state.context?.organization_name || 'Ommeganet';
        doc.text(`Organización: ${orgName}`, 14, 23);
        doc.text(`Período: ${data.from} a ${data.to}`, 14, 28);
        doc.text(`Total: ${data.tickets.length} tickets · Generado: ${new Date().toLocaleString('es-PY')}`, 14, 33);

        // Tabla (columnas reducidas para que entre en A4 landscape)
        const rows = data.tickets.map(t => {
            const cat = (Wizard.categories.find(c => c.id == t.category_id)?.name) || '-';
            return [
                t.ticket_number,
                fmtDate(t.created_at),
                t.requester_name || '',
                t.requester_ci || '',
                t.title || '',
                cat,
                t.priority || '',
                (t.status || '').replace('_', ' '),
            ];
        });

        doc.autoTable({
            startY: 38,
            head: [['N°','Apertura','Solicitante','CI','Título','Categoría','Prioridad','Estado']],
            body: rows,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [139, 92, 246], textColor: 255 },
            alternateRowStyles: { fillColor: [245, 243, 255] },
            columnStyles: { 4: { cellWidth: 60 } },
        });

        const fname = `tickets_${data.from}_a_${data.to}.pdf`;
        doc.save(fname);
        closeModal('modal-export');
        toast(`${rows.length} tickets exportados a PDF`, 'success');
    },
};
