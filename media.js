// ============================================================
// OMMEGANET CORE — Media Module (GPS, audio, archivos)
// ============================================================

const Media = {
    files: [],
    recorder: null,
    chunks: [],
    stream: null,
    startTime: null,
    timerInterval: null,
    gps: null,

    getDevice() {
        const ua = navigator.userAgent;
        let type = 'desktop';
        if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) type = 'tablet';
        else if (/Mobi|Android|iPhone|iPod/i.test(ua)) type = 'mobile';
        let os = 'Unknown';
        if (/Windows NT 10/i.test(ua)) os = 'Windows 10/11';
        else if (/Android/i.test(ua)) os = `Android ${ua.match(/Android (\d+)/)?.[1]||''}`;
        else if (/iPhone|iPad/i.test(ua)) os = `iOS ${ua.match(/OS (\d+_\d+)/)?.[1]?.replace('_','.')||''}`;
        else if (/Mac/i.test(ua)) os = 'macOS';
        else if (/Linux/i.test(ua)) os = 'Linux';
        let browser = 'Unknown';
        if (/Edg/i.test(ua)) browser = 'Edge';
        else if (/Chrome/i.test(ua)) browser = 'Chrome';
        else if (/Safari/i.test(ua)) browser = 'Safari';
        else if (/Firefox/i.test(ua)) browser = 'Firefox';
        return { device_type:type, device_os:os, device_browser:browser, user_agent:ua };
    },

    async detectGPS() {
        if (!navigator.geolocation) return null;
        const el = document.getElementById('gps-val');
        if (el) el.textContent = 'Detectando...';
        return new Promise(res => {
            navigator.geolocation.getCurrentPosition(
                pos => {
                    this.gps = { gps_latitude:pos.coords.latitude, gps_longitude:pos.coords.longitude, gps_accuracy:pos.coords.accuracy };
                    if (el) el.textContent = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
                    res(this.gps);
                },
                () => { if (el) el.textContent = 'No detectado'; res(null); },
                { enableHighAccuracy:true, timeout:10000, maximumAge:60000 }
            );
        });
    },

    addFiles(list) {
        const max = CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024;
        for (const f of list) {
            if (f.size > max) { toast(`${f.name} supera el límite de ${CONFIG.MAX_FILE_SIZE_MB}MB`, 'error'); continue; }
            this.files.push({ file:f, id:Date.now()+Math.random(), duration:null });
        }
        this.renderPreview();
    },

    addAudio(blob, secs) {
        const f = new File([blob], `audio_${Date.now()}.webm`, { type:'audio/webm' });
        this.files.push({ file:f, id:Date.now()+Math.random(), duration:secs });
        this.renderPreview();
    },

    remove(id) { this.files = this.files.filter(f => f.id !== id); this.renderPreview(); },
    clear()    { this.files = []; this.renderPreview(); },

    renderPreview() {
        const el = document.getElementById('files-preview');
        if (!el) return;
        if (!this.files.length) { el.innerHTML = ''; return; }
        el.innerHTML = this.files.map(({file, id, duration}) => {
            const url  = URL.createObjectURL(file);
            const size = file.size > 1048576 ? `${(file.size/1048576).toFixed(1)}MB` : `${Math.round(file.size/1024)}KB`;
            let preview = '';
            if (file.type.startsWith('image/')) preview = `<img src="${url}" alt="">`;
            else if (file.type.startsWith('video/')) preview = `<video src="${url}" controls></video>`;
            else if (file.type.startsWith('audio/')) preview = `<audio src="${url}" controls></audio>`;
            else preview = `<div style="padding:16px;color:var(--text-2);font-size:24px;">📄</div>`;
            return `
                <div class="file-thumb">
                    ${preview}
                    <div class="file-name">${file.name}${duration?` · ${duration}s`:''} · ${size}</div>
                    <button class="rm-file" onclick="Media.remove(${id})">✕</button>
                </div>`;
        }).join('');
    },

    async startAudio() {
        try {
            this.stream  = await navigator.mediaDevices.getUserMedia({audio:true});
            this.chunks  = [];
            this.recorder = new MediaRecorder(this.stream, { mimeType:'audio/webm' });
            this.recorder.ondataavailable = e => { if (e.data.size > 0) this.chunks.push(e.data); };
            this.recorder.onstop = () => {
                const blob = new Blob(this.chunks, { type:'audio/webm' });
                const secs = Math.floor((Date.now() - this.startTime) / 1000);
                this.addAudio(blob, secs);
                this.stream?.getTracks().forEach(t => t.stop());
            };
            this.recorder.start();
            this.startTime = Date.now();
            document.getElementById('audio-rec-ui')?.classList.add('show');
            document.getElementById('btn-audio')?.classList.add('recording');
            this.timerInterval = setInterval(() => {
                const s = Math.floor((Date.now() - this.startTime) / 1000);
                const el = document.getElementById('audio-timer');
                if (el) el.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
            }, 500);
        } catch(e) { toast('No se pudo acceder al micrófono: ' + e.message, 'error'); }
    },

    stopAudio() {
        this.recorder?.state === 'recording' && this.recorder.stop();
        clearInterval(this.timerInterval);
        document.getElementById('audio-rec-ui')?.classList.remove('show');
        document.getElementById('btn-audio')?.classList.remove('recording');
    },
};
