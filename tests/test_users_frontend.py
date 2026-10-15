"""CORE-USERS-01 (R0) — Frontend de Usuarios (Playwright, archivo real js/app.js).

Verifica:
  - R0-05: el rol REAL se muestra (platform_owner -> "Platform Owner"), sin default
    engañoso a "Usuario".
  - XSS: nombre malicioso se escapa (no se crea nodo <img>, no ejecuta JS).
  - R0-04: modal de edición con selectores dependientes preseleccionados aun con
    respuestas de API DEMORADAS (sin condición de carrera que borre la pertenencia),
    y guardado que envía SOLO los campos cambiados (update parcial).
  - Fila propia: rol y estado no editables; no se puede desactivar a uno mismo.

Requiere Playwright + Chromium (/opt/pw-browsers).
"""
import pathlib
import pytest

pytest.importorskip("playwright")
from playwright.sync_api import sync_playwright  # noqa: E402

FE = pathlib.Path(__file__).resolve().parents[1]
APP_JS = (FE / "js" / "app.js").read_text(encoding="utf-8")

DOM = """
<!doctype html><html><head><meta charset="utf-8"></head><body>
  <table><tbody id="users-tbody"></tbody></table>
  <div class="modal-overlay" id="modal-user"><div class="modal">
    <div class="modal-header"><h2 id="modal-user-title">Editar usuario</h2></div>
    <div class="modal-body" id="modal-user-body"></div>
    <div class="modal-footer"><button id="user-save-btn" onclick="App.saveUser()">Guardar</button></div>
  </div></div>
  <div id="toast-container"></div>
</body></html>
"""

SETUP = r"""
() => {
  window.__XSS__ = undefined;
  // Neutralizar toast si no existe contenedor compatible.
  window.toast = window.toast || function(){};
  App.state = App.state || {};
  App.state.user = { id: 'me-1', role: 'platform_owner' };
  const ORG='org-1', COMP='comp-1', DEP='dep-1';
  const delay=(ms,v)=>new Promise(r=>setTimeout(()=>r(v),ms));
  window.__saved = null;
  window.api = {
    getUsers: async () => ([
      { id:'me-1', full_name:'Yo Admin', email:'me@x.com', role:'platform_owner',
        is_active:true, estado_laboral:'activo', organization_id:ORG, company_id:COMP, department_id:DEP, department:'Infra' },
      { id:'u-2', full_name:'<img src=x onerror="window.__XSS__=1">', email:'u2@x.com', role:'tecnico',
        is_active:true, estado_laboral:'activo', organization_id:ORG, company_id:COMP, department_id:DEP, department:'Soporte' },
      { id:'u-3', full_name:'Admin Global', email:'ag@x.com', role:'org_admin',
        is_active:true, estado_laboral:'activo', organization_id:ORG, company_id:null, department_id:null, department:'Dirección' },
    ]),
    getAssignableRoles: async () => ({ roles:['usuario','tecnico','supervisor','manager','company_admin','org_admin','org_owner','platform_admin','platform_owner'] }),
    getUserOrgOptions: async () => delay(10,[{id:ORG,name:'Grupo'}]),
    getUserCompanyOptions: async () => delay(80,[{id:COMP,name:'Empresa A'}]),   // lenta
    getUserDepartmentOptions: async () => delay(40,[{id:DEP,name:'Infra'}]),
    updateUser: async (uid,payload) => { window.__saved={uid,payload}; return {}; },
    toggleUserActive: async () => ({}),
  };
}
"""


@pytest.fixture(scope="module")
def page():
    import os
    os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_page()
        pg.set_content(DOM)
        pg.add_script_tag(content=APP_JS)
        pg.evaluate(SETUP)
        yield pg
        b.close()


def test_render_rol_real_y_xss(page):
    page.evaluate("async () => { await App.loadUsers(); }")
    html = page.inner_html("#users-tbody")
    # platform_owner se muestra como tal, NO como "Usuario".
    assert "Platform Owner" in html
    # XSS: no se ejecutó y el payload quedó escapado (sin <img> real).
    assert page.evaluate("() => window.__XSS__") in (None, False)
    assert page.eval_on_selector_all("#users-tbody img", "els => els.length") == 0
    assert "&lt;img" in html


def test_modal_edit_preselecciona_con_delays_y_guarda_parcial(page):
    page.evaluate("async () => { await App.loadUsers(); }")
    # Abrir edición de u-2 y esperar a que carguen los selectores demorados.
    page.evaluate("async () => { await App.openUserEdit('u-2'); }")
    page.wait_for_timeout(250)
    vals = page.evaluate("""() => ({
        org: document.getElementById('uf-org').value,
        company: document.getElementById('uf-company').value,
        dep: document.getElementById('uf-department').value,
    })""")
    assert vals == {"org": "org-1", "company": "comp-1", "dep": "dep-1"}

    # Cambiar SOLO el nombre y guardar -> payload parcial con full_name.
    page.evaluate("""() => { document.getElementById('uf-full_name').value = 'Nombre Nuevo'; }""")
    page.evaluate("async () => { await App.saveUser(); }")
    saved = page.evaluate("() => window.__saved")
    assert saved["uid"] == "u-2"
    assert saved["payload"].get("full_name") == "Nombre Nuevo"
    # No se tocaron org/company/department (no cambiaron) -> no en el payload.
    assert "organization_id" not in saved["payload"]
    assert "department_id" not in saved["payload"]


def test_fila_propia_rol_y_estado_no_editables(page):
    page.evaluate("async () => { await App.loadUsers(); }")
    page.evaluate("async () => { await App.openUserEdit('me-1'); }")
    page.wait_for_timeout(50)
    disabled = page.evaluate("""() => ({
        role: document.getElementById('uf-role').disabled,
        estado: document.getElementById('uf-estado').disabled,
    })""")
    assert disabled == {"role": True, "estado": True}


def test_usuario_sin_empresa_edita_departamento_texto(page):
    page.evaluate("async () => { await App.loadUsers(); }")
    page.evaluate("async () => { await App.openUserEdit('u-3'); }")
    page.wait_for_timeout(150)
    vis = page.evaluate("""() => ({
        sel: document.getElementById('uf-department').style.display,
        txt: document.getElementById('uf-department-text').style.display,
        txtval: document.getElementById('uf-department-text').value,
    })""")
    assert vis["sel"] == "none"            # selector estructurado oculto
    assert vis["txt"] != "none"            # input de texto visible
    assert vis["txtval"] == "Dirección"    # prefill con el texto legacy
    # Cambiar el texto y guardar -> payload.department (sin asignar empresa).
    page.evaluate("""() => { document.getElementById('uf-department-text').value = 'Gerencia General'; }""")
    page.evaluate("async () => { await App.saveUser(); }")
    saved = page.evaluate("() => window.__saved")
    assert saved["uid"] == "u-3"
    assert saved["payload"].get("department") == "Gerencia General"
    assert "company_id" not in saved["payload"]       # no se le asigna empresa
    assert "department_id" not in saved["payload"]


def test_carrera_entre_formularios_gana_el_ultimo(page):
    # Fix 1: abrir A (roles lento) y luego B (roles rápido). Al terminar, el formulario
    # mostrado y el destinatario del guardado deben ser B.
    page.evaluate("async () => { await App.loadUsers(); }")
    page.evaluate("""() => {
        let n = 0;
        window.api.getAssignableRoles = async () => {
            n++; const d = (n === 1 ? 250 : 10);
            await new Promise(r => setTimeout(r, d));
            return { roles: ['usuario','tecnico','supervisor','org_admin'] };
        };
        window.__saved = null;
    }""")
    page.evaluate("""async () => {
        const a = App.openUserEdit('u-2');   // lento (roles 250ms)
        const b = App.openUserEdit('u-3');   // rápido (roles 10ms)
        await Promise.all([a, b]);
    }""")
    page.wait_for_timeout(350)   # dar tiempo a que la respuesta vieja (A) llegue tarde
    shown = page.evaluate("() => ({ name: document.getElementById('uf-full_name').value, edit: App.state.userEdit.id })")
    assert shown["name"] == "Admin Global"   # corresponde a B (u-3), no a A (u-2)
    assert shown["edit"] == "u-3"
    page.evaluate("""() => { document.getElementById('uf-full_name').value = 'B Editado'; }""")
    page.evaluate("async () => { await App.saveUser(); }")
    saved = page.evaluate("() => window.__saved")
    assert saved["uid"] == "u-3"


def test_fallo_catalogo_no_envia_pertenencia_implicita(page):
    # Fix 2: si falla getUserOrgOptions, editar solo el nombre NO debe enviar cambios
    # implícitos de organización/empresa/departamento.
    page.evaluate("""() => {
        window.api.getUserOrgOptions = async () => { throw new Error('catalogo caido'); };
        window.api.getAssignableRoles = async () => ({ roles:['usuario','tecnico','org_admin'] });
        window.__saved = null;
    }""")
    page.evaluate("async () => { await App.loadUsers(); }")
    page.evaluate("async () => { await App.openUserEdit('u-2'); }")  # u-2 tiene org/empresa
    page.wait_for_timeout(150)
    state = page.evaluate("""() => ({
        loaded: App.state.userEdit.pertenenciaLoaded,
        orgDisabled: document.getElementById('uf-org').disabled,
    })""")
    assert state["loaded"] is False
    assert state["orgDisabled"] is True
    # Editar SOLO el nombre y guardar.
    page.evaluate("""() => { document.getElementById('uf-full_name').value = 'Solo Nombre'; }""")
    page.evaluate("async () => { await App.saveUser(); }")
    saved = page.evaluate("() => window.__saved")
    assert saved["payload"].get("full_name") == "Solo Nombre"
    for k in ("organization_id", "company_id", "department_id", "department"):
        assert k not in saved["payload"], f"NO debe enviar {k} implícito: {saved['payload']}"


def _reset_catalogs(page):
    # Restaura stubs sanos (el fixture `page` es de módulo y tests previos los alteran).
    page.evaluate("""() => {
        const ORG='org-1', COMP='comp-1', DEP='dep-1';
        window.api.getAssignableRoles = async () => ({ roles:['usuario','tecnico','supervisor','org_admin'] });
        window.api.getUserOrgOptions = async () => ([{id:ORG, name:'Grupo'}]);
        window.api.getUserCompanyOptions = async () => ([{id:COMP, name:'Empresa A'}]);
        window.api.getUserDepartmentOptions = async () => ([{id:DEP, name:'Infra'}]);
        window.__saved = null;
    }""")


def test_fallo_company_options_bloquea_pertenencia(page):
    # Fix 3: si getUserCompanyOptions() falla al cambiar de organización, se bloquea
    # el guardado de pertenencia y NO se desvincula al usuario.
    _reset_catalogs(page)
    page.evaluate("async () => { await App.loadUsers(); }")
    page.evaluate("async () => { await App.openUserEdit('u-2'); }")
    page.wait_for_timeout(120)
    page.evaluate("""() => {
        window.api.getUserCompanyOptions = async () => { throw new Error('caido'); };
        window.__saved = null;
    }""")
    page.evaluate("async () => { await App.onUserOrgChange(); }")
    page.wait_for_timeout(80)
    st = page.evaluate("""() => ({
        loaded: App.state.userEdit.pertenenciaLoaded,
        companyDisabled: document.getElementById('uf-company').disabled,
    })""")
    assert st["loaded"] is False and st["companyDisabled"] is True
    # Editar solo el nombre y guardar -> sin cambios implícitos de pertenencia.
    page.evaluate("""() => { document.getElementById('uf-full_name').value = 'Nuevo Nombre'; }""")
    page.evaluate("async () => { await App.saveUser(); }")
    saved = page.evaluate("() => window.__saved")
    assert saved["payload"].get("full_name") == "Nuevo Nombre"
    for k in ("organization_id", "company_id", "department_id", "department"):
        assert k not in saved["payload"], f"NO debe desvincular: {saved['payload']}"


def test_fallo_department_options_bloquea_pertenencia(page):
    # Fix 3: si getUserDepartmentOptions() falla al cambiar de empresa, idem.
    _reset_catalogs(page)
    page.evaluate("async () => { await App.loadUsers(); }")
    page.evaluate("async () => { await App.openUserEdit('u-2'); }")
    page.wait_for_timeout(120)
    page.evaluate("""() => {
        window.api.getUserDepartmentOptions = async () => { throw new Error('caido'); };
        window.__saved = null;
    }""")
    page.evaluate("async () => { await App.onUserCompanyChange(); }")
    page.wait_for_timeout(80)
    st = page.evaluate("() => ({ loaded: App.state.userEdit.pertenenciaLoaded, depDisabled: document.getElementById('uf-department').disabled })")
    assert st["loaded"] is False and st["depDisabled"] is True
    page.evaluate("""() => { document.getElementById('uf-full_name').value = 'Otro Nombre'; }""")
    page.evaluate("async () => { await App.saveUser(); }")
    saved = page.evaluate("() => window.__saved")
    assert saved["payload"].get("full_name") == "Otro Nombre"
    for k in ("organization_id", "company_id", "department_id", "department"):
        assert k not in saved["payload"]
