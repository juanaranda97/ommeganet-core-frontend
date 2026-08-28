# Ommeganet CORE — Frontend

Plataforma de gestión IT (MSP/ITSM/ITAM) multi-tenant.

## Stack
- Vanilla HTML/CSS/JS (sin framework)
- Supabase JS SDK (auth + storage)
- Chart.js (gráficos)
- Deploy: Netlify

## Estructura
```
├── index.html          # App completa (SPA)
├── manifest.json       # PWA manifest
├── netlify.toml        # Config de Netlify (redirects + headers)
├── css/
│   └── styles.css      # Design system dark neon
└── js/
    ├── config.js       # Configuración (URLs, keys)
    ├── api.js          # Cliente API (multi-tenant)
    ├── media.js        # GPS, audio, archivos
    ├── wizard.js       # Wizard de tickets
    └── app.js          # Lógica principal
```

## Backend
- API: https://helpdesk-it.onrender.com
- DB: Supabase (São Paulo)

## Deploy
Conectado a Netlify vía GitHub. Cada push a `main` redeploya automáticamente.
