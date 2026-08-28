// ============================================================
// OMMEGANET CORE — Configuración del Frontend
// ============================================================

const CONFIG = {
    APP_NAME: 'Ommeganet CORE',
    APP_VERSION: '2.0.0',

    // URL del backend Python (FastAPI)
    API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:8000'
        : 'https://helpdesk-it.onrender.com',

    // Credenciales de Supabase (auth + storage)
    SUPABASE_URL: 'https://ctazrasxhkgckcbenhvb.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0YXpyYXN4aGtnY2tjYmVuaHZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTI2MjEsImV4cCI6MjA5NTI4ODYyMX0.0De5GxE4fvioHoZJrTKjQ9UBgp4mVbUeJ5kKE7ZeCw4',

    // Configuración
    MAX_FILE_SIZE_MB: 25,
    NOTIFICATION_REFRESH_MS: 60000,
    TOAST_DURATION_MS: 4000,
    WAKE_TIMEOUT_MS: 4000,         // tiempo antes de mostrar "despertando"
    REQUEST_TIMEOUT_MS: 65000,     // timeout total del request
};

// Cliente Supabase (para auth + storage directo)
const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
