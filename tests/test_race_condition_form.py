"""Regresión de condición de carrera del formulario de activos — ITAM-02.

Carga los archivos REALES js/app.js + js/inventory.js y, con respuestas de API
DEMORADAS y desordenadas, verifica que al abrir un activo existente y editar un
campo no relacionado se PRESERVA la pertenencia (organización, empresa,
departamento, sucursal y ubicación física) — es decir, que la carga asíncrona de
los selectores dependientes no borra las selecciones originales.

Requiere Playwright + Chromium (preinstalado en /opt/pw-browsers).
Ejecutar:  python3 -m pytest fe/tests/test_race_condition_form.py -q
"""
import pathlib
import pytest

pytest.importorskip("playwright")
from playwright.sync_api import sync_playwright  # noqa: E402

FE_DIR = pathlib.Path(__file__).resolve().parents[1]
APP_JS = (FE_DIR / "js" / "app.js").read_text(encoding="utf-8")
INV_JS = (FE_DIR / "js" / "inventory.js").read_text(encoding="utf-8")

HARNESS_DOM = """
<!doctype html><html><head><meta charset="utf-8"></head><body>
  <div id="inv-form-title"></div>
  <div id="modal-inv-form" class="modal"><div id="inv-form-body"></div>
    <button id="inv-save-btn">Guardar</button></div>
  <table><tbody id="inv-tbody"></tbody></table>
  <div id="inv-stats"></div>
</body></html>
"""

RUN_JS = r"""
async () => {
  const delay = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
  const ORG='org-1', COMP='comp-1', DEP='dep-1', BR='br-1', LOC='loc-1';

  // Respuestas DEMORADAS y desordenadas: companies es la más lenta; departments y
  // locations llegan después que branches. Si hubiera carrera, una carga con
  // preselect '' pisaría la correcta.
  window.api = {
    getAsset: async () => delay(10, {
      id:'eq-1', organization_id:ORG, company_id:COMP,
      department_id:DEP, branch_id:BR, physical_location_id:LOC,
      tipo:'NB', marca:'Dell', modelo:'Latitude', estado:'disponible',
    }),
    getInvOrganizations: async () => delay(10, [{id:ORG, name:'Grupo'}]),
    getInvCompanies:    async () => delay(90, [{id:COMP, name:'Empresa A'}]),
    getInvDepartments:  async () => delay(50, [{id:DEP, name:'Administración'}]),
    getInvBranches:     async () => delay(20, [{id:BR,  name:'Sucursal Centro'}]),
    getInvLocations:    async () => delay(70, [{id:LOC, name:'Oficina 3'}]),
    getAssignableUsers: async () => delay(30, []),
  };

  Inventory.state.meta = { tipos:['NB','PC'], estados:['disponible','asignado','reparacion','baja','extraviado'] };
  Inventory.state.orgOptions = null;

  await Inventory.openForm('eq-1');
  // Dar tiempo a cualquier respuesta tardía a que (erróneamente) pise las selecciones.
  await delay(200);

  const v = id => { const el = document.getElementById(id); return el ? el.value : null; };
  const before = {
    org:v('invf-org'), company:v('invf-company'), dep:v('invf-department'),
    br:v('invf-branch'), loc:v('invf-physical_location'),
  };

  // Editar un campo NO relacionado con la pertenencia.
  const marca = document.getElementById('invf-marca');
  if (marca) marca.value = 'Lenovo';

  // Capturar el payload que se guardaría.
  let saved = null;
  window.api.updateAsset = async (id, payload) => { saved = payload; return {}; };
  window.api.createAsset = async (payload) => { saved = payload; return {}; };
  await Inventory.save();

  return { before, saved };
}
"""


@pytest.fixture(scope="module")
def page_ctx():
    import os
    os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(HARNESS_DOM)
        page.add_script_tag(content=APP_JS)
        page.add_script_tag(content=INV_JS)
        yield page
        browser.close()


def test_editar_no_borra_pertenencia_con_respuestas_demoradas(page_ctx):
    res = page_ctx.evaluate(RUN_JS)
    before, saved = res["before"], res["saved"]

    # 1) Tras abrir, los selectores muestran la pertenencia real del activo.
    assert before["org"] == "org-1", f"org perdida: {before}"
    assert before["company"] == "comp-1", f"empresa perdida: {before}"
    assert before["dep"] == "dep-1", f"departamento perdido: {before}"
    assert before["br"] == "br-1", f"sucursal perdida: {before}"
    assert before["loc"] == "loc-1", f"ubicación perdida: {before}"

    # 2) Al guardar (tras editar un campo ajeno), la pertenencia se conserva.
    assert saved is not None, "save() no envió payload"
    assert saved.get("department_id") == "dep-1"
    assert saved.get("branch_id") == "br-1"
    assert saved.get("physical_location_id") == "loc-1"
    assert saved.get("marca") == "Lenovo"   # el cambio no relacionado sí se aplicó
