"""Regresión de seguridad (XSS) del módulo Inventario — ITAM-02.

Carga los archivos REALES js/app.js (escHtml/escAttr/setText/openModal/toast/fmtDate)
y js/inventory.js, inyecta datos de activo/historial con payloads maliciosos
(returned_reason, notas, data_source, nombres, serial, etc.) y verifica que:
  1. Ningún script inyectado se ejecuta (no se setea window.__XSS__).
  2. El texto malicioso se renderiza ESCAPADO (como texto literal, sin crear
     nodos <img>/<svg>/<script> reales a partir del payload).

Requiere Playwright + Chromium (preinstalado en /opt/pw-browsers).
Ejecutar:  python3 -m pytest fe/tests/test_xss_inventory.py -q
"""
import os
import pathlib
import pytest

pytest.importorskip("playwright")
from playwright.sync_api import sync_playwright  # noqa: E402

FE_DIR = pathlib.Path(__file__).resolve().parents[1]
APP_JS = (FE_DIR / "js" / "app.js").read_text(encoding="utf-8")
INV_JS = (FE_DIR / "js" / "inventory.js").read_text(encoding="utf-8")

# Payload que, de no escaparse, ejecutaría JS o inyectaría markup.
XSS_IMG = "<img src=x onerror=\"window.__XSS__=1\">"
XSS_SCRIPT = "<script>window.__XSS__=1<\\/script>"
XSS_SVG = "<svg/onload=window.__XSS__=1>"

HARNESS_DOM = """
<!doctype html><html><head><meta charset="utf-8"></head><body>
  <div id="inv-detail-title"></div>
  <div id="modal-inv-detail" class="modal"><div id="inv-detail-body"></div></div>
  <table><tbody id="inv-tbody"></tbody></table>
</body></html>
"""

# Stub de `api` + invocación de openDetail con datos maliciosos, devolviendo
# el innerHTML renderizado y el flag de ejecución.
RUN_JS = """
async () => {
  window.__XSS__ = undefined;
  const EVIL_IMG = %s, EVIL_SCRIPT = %s, EVIL_SVG = %s;
  window.api = {
    getAsset: async () => ({
      id: "11111111-1111-1111-1111-111111111111",
      tipo: "NB", estado: "asignado",
      codigo_interno: EVIL_IMG,
      marca: EVIL_SVG, modelo: "m", serial: EVIL_SCRIPT,
      data_source: EVIL_IMG,
      notas: EVIL_IMG,
      organization_name: EVIL_IMG, company_name: EVIL_SVG,
      department_name: EVIL_IMG, branch_name: EVIL_IMG,
      ubicacion: EVIL_IMG, company_id: "c",
      current_assignment: { user_name: EVIL_IMG },
    }),
    getAssetAssignments: async () => ([
      { assigned_at: null, returned_at: "2026-01-02T00:00:00Z",
        user_name: EVIL_IMG, returned_reason: EVIL_IMG },
    ]),
  };
  await Inventory.openDetail("11111111-1111-1111-1111-111111111111");
  const body = document.getElementById("inv-detail-body");
  // Nodos reales creados a partir del payload (si los hubiera => no se escapó).
  const injectedImgs = body.querySelectorAll('img[src="x"]').length;
  const injectedSvg = body.querySelectorAll('svg').length;
  const injectedScript = body.querySelectorAll('script').length;
  return {
    xss: window.__XSS__ === 1,
    injectedImgs, injectedSvg, injectedScript,
    html: body.innerHTML,
  };
}
""" % ("`" + XSS_IMG + "`", "`" + XSS_SCRIPT + "`", "`" + XSS_SVG + "`")


@pytest.fixture(scope="module")
def page_ctx():
    os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(HARNESS_DOM)
        page.add_script_tag(content=APP_JS)
        page.add_script_tag(content=INV_JS)
        yield page
        browser.close()


def test_detalle_no_ejecuta_ni_inyecta_html_malicioso(page_ctx):
    res = page_ctx.evaluate(RUN_JS)
    assert res["xss"] is False, "El payload XSS se ejecutó (window.__XSS__ seteado)"
    assert res["injectedImgs"] == 0, "Se creó un <img> real a partir del payload (no se escapó)"
    assert res["injectedSvg"] == 0, "Se creó un <svg> real a partir del payload (no se escapó)"
    assert res["injectedScript"] == 0, "Se creó un <script> real a partir del payload"
    # El texto malicioso debe aparecer ESCAPADO en el HTML renderizado.
    assert "&lt;img" in res["html"], "El payload no aparece escapado como texto"
