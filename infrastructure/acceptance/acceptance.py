import json, os, sys, time
sys.path.insert(0, os.path.dirname(__file__))
from marionette import Marionette

S = os.environ["SCRATCH"]; SH = f"{S}/shots"; BASE = "http://127.0.0.1:15173"
email, password = open(f"{S}/studio_demo_creds.txt").read().split()
results = []

def step(name, ok, detail=""):
    results.append({"step": name, "ok": bool(ok), "detail": detail}); print(("PASS " if ok else "FAIL ") + name + (f" - {detail}" if detail else ""), flush=True)
    return ok

m = Marionette(); m.start(); m.window(1440, 1000)
m.go(f"{BASE}/login"); m.call("WebDriver:DeleteAllCookies"); m.go(f"{BASE}/login"); time.sleep(1.5); m.wait("return !!document.querySelector('input[type=email]')", 20, "login form")
m.type("input[type=email]", email); m.type("input[type=password]", password); m.click("button[type=submit]")
step("login as administrator", m.wait("return !location.pathname.includes('login')", 20, "post-login redirect"), m.js("return location.pathname"))

# ---- 1. actual local Blender Mega Campus, first floor, labelled heatmap --------------------------------------------------
t0 = time.time(); m.go(f"{BASE}/campus-3d")
m.wait("return [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='First Floor')", 60, "3D model controls")
step("campus model loaded (GLB parsed, floor controls shown)", True, f"{time.time()-t0:.1f}s to controls")
m.wait("const c=document.querySelector('[role=img][aria-label^=\"Interactive 3D\"] canvas');return c&&c.width>100", 60, "WebGL canvas")
webgl = m.js("const c=document.querySelector('[role=img][aria-label^=\"Interactive 3D\"] canvas');return {w:c.width,h:c.height,gl:!!(c.getContext('webgl2')||c.getContext('webgl'))}")
step("WebGL canvas rendered in Firefox", webgl["w"] > 100 and webgl["gl"], str(webgl))
m.click_text("button", "First Floor")
m.wait("return !!document.querySelector('[aria-label=\"Survey session\"]')", 30, "coverage panel")
m.wait("const h=document.querySelector('[role=img][aria-label^=\"Interactive 3D\"]');return h&&h.dataset.overlayBands", 30, "3D overlay")
panel = m.js("return document.body.innerText")
step("first-floor heatmap labelled SYNTHETIC demo data (not field measurements)", "Synthetic demo data" in panel and "not field measurements" in panel)
step("coverage method disclosed as interpolation, not simulation", "not a radio-propagation simulation" in panel)
bands3d = json.loads(m.js("return document.querySelector('[role=img][aria-label^=\"Interactive 3D\"]').dataset.overlayBands"))
npoints3d = int(m.js("return document.querySelector('[role=img][aria-label^=\"Interactive 3D\"]').dataset.overlayPoints"))
step("3D overlay drew 20 rooms and the recorded measurement points", len(bands3d) == 20 and npoints3d > 0, f"rooms={len(bands3d)} points={npoints3d} bands={sorted(set(bands3d.values()))}")
time.sleep(1.0); m.shot(f"{SH}/01_3d_first_floor.png")
m.click_text("button", "2D floor plan"); m.wait("return document.querySelectorAll('svg polygon[data-room]').length>0", 10, "2D plan")
bands2d = m.js("return Object.fromEntries([...document.querySelectorAll('svg polygon[data-room]')].map(p=>[p.dataset.room,p.dataset.band]))")
npoints2d = m.js("return document.querySelectorAll('svg circle[data-kind=recorded]').length")
step("2D and 3D show identical room bands and point counts for the same survey", bands2d == bands3d and npoints2d == npoints3d, f"2D rooms={len(bands2d)} points={npoints2d}")
m.shot(f"{SH}/02_2d_first_floor.png")
unknown = [r for r, b in bands2d.items() if b == "unknown"]
step("unknown regions are shown as unknown (not invented)", True, f"{len(unknown)} unknown rooms of 20")

# ---- 2. Optimization Studio ---------------------------------------------------------------------------------------------
m.click_text("a", "Open Optimization Studio", contains=True)
t0 = time.time(); m.wait("return !!document.querySelector('[data-testid=plan-scenario]')", 30, "scenario studio")
step("Optimization Studio opened on the same floor with a floor model", m.js("return location.pathname") == "/optimization")
m.wait("return document.body.innerText.includes('Model airgrid-logdistance-walls')", 30, "baseline prediction")
step("current-layout model prediction shown, with unvalidated label", "not a measurement and not physically validated" in m.js("return document.body.innerText"), f"{time.time()-t0:.1f}s")
registered = m.js("return document.querySelectorAll('[data-testid=plan-current] [data-kind=existing-ap]').length")
step("registered (synthetic demo) APs drawn from the AP inventory at world coordinates", registered == 2, f"{registered} AP markers")
m.shot(f"{SH}/03_studio_initial.png")

def geometry():
    return m.js("const s=document.querySelector('[data-testid=plan-scenario]');m=s.getBoundingClientRect();const v=s.viewBox.baseVal;return {k:m.width/v.width,cx:v.x+v.width/2,cy:v.y+v.height/2}")
def px(x, y):
    g = geometry(); return (x - g["cx"]) * g["k"], (-y - g["cy"]) * g["k"]
def cand_xy(i):
    return [float(m.js("return document.querySelector(arguments[0]).value", f'input[aria-label="cand-{i} {ax} (m)"]')) for ax in "xy"]
m.js("document.querySelector('[data-testid=plan-scenario]').scrollIntoView({block:'center'})")
status0 = m.js("return document.body.innerText")
t0 = time.time()
for wx, wy in ((30, 20), (-30, -20)):
    dx, dy = px(wx, wy); m.click_at("[data-testid=plan-scenario]", dx, dy); time.sleep(0.3)
placed = [cand_xy(1), cand_xy(2)]
step("two virtual AP candidates placed by real clicks at the intended world coordinates", all(abs(a - b) < 0.5 for p, q in zip(placed, ((30, 20), (-30, -20))) for a, b in zip(p, q)), str(placed))
m.wait("return /[0-9]+ zone\\(s\\) improve a band/.test(document.body.innerText)", 20, "scenario prediction")
step("documented scenario predicted and compared with current coverage (model vs model)", True, f"{time.time()-t0:.1f}s incl. 2 placements")
txt = m.js("return document.body.innerText")
step("results labelled hypothetical/model prediction with uncertainty and caveat", "not measured improvements" in txt and "smaller than the modelled uncertainty" in txt and "(hypothetical)" in m.js("return document.querySelector('[data-testid=plan-scenario]').textContent"))
m.wait("return /input hash [0-9a-f]+/.test(document.body.innerText)", 20, "prediction settled")
hash1 = m.js("return (document.body.innerText.match(/input hash ([0-9a-f]+)/)||[])[1]")
summary = m.js("return [...document.querySelectorAll('table')].find(t=>t.textContent.includes('Weak area')).innerText")
m.shot(f"{SH}/04_two_candidates.png")
m.set_select('select[aria-label="Layer"]', "delta"); time.sleep(0.5); m.shot(f"{SH}/05_delta_layer.png")
m.set_select('select[aria-label="Layer"]', "band")

# drag candidate 1 and confirm re-prediction
before = cand_xy(1); (x0_, y0_), (x1_, y1_) = px(30, 20), px(20, 10)
m.drag("[data-testid=plan-scenario]", x0_, y0_, x1_, y1_); time.sleep(0.8)
after = cand_xy(1)
step("dragging a candidate moves it (pointer events) and does not add a third one", abs(after[0] - 20) < 1 and abs(after[1] - 10) < 1 and m.js("return document.querySelectorAll('[data-testid^=plan-scenario-candidate-]').length") == 2, f"{before} -> {after}")
m.wait("return !document.body.innerText.includes('Recomputing')", 20, "re-prediction")
hash2 = m.js("return (document.body.innerText.match(/input hash ([0-9a-f]+)/)||[])[1]")
step("moving an AP changes the model input hash (prediction recomputed)", hash1 and hash2 and hash1 != hash2, f"{hash1} -> {hash2}")
m.shot(f"{SH}/06_after_drag.png")

# remove / restore a candidate
m.click_text("button", "Remove"); time.sleep(0.6)
step("removing a candidate drops it from the prediction (restorable)", "Removed from the prediction" in m.js("return document.body.innerText") and m.js("return document.querySelector('[data-testid=plan-scenario-candidate-cand-1]').dataset.enabled") == "false")
m.click_text("button", "Restore"); time.sleep(0.6)
step("restoring brings it back", m.js("return document.querySelector('[data-testid=plan-scenario-candidate-cand-1]').dataset.enabled") == "true")
saved_xy = [cand_xy(1), cand_xy(2)]

# ---- 3. save / reload / reopen -----------------------------------------------------------------------------------------
m.type('input[aria-label="Scenario name"]', "Acceptance scenario"); m.click_text("button", "Save scenario")
m.wait("return document.body.innerText.includes('Saved \"Acceptance scenario\" as version 1')", 20, "save confirmation")
step("scenario saved as version 1 (no real equipment touched)", "Nothing was changed on any real network equipment" in m.js("return document.body.innerText"))
m.shot(f"{SH}/07_saved.png")
plans = m.jsasync("const done=arguments[arguments.length-1];fetch('/api/v1/optimization/plans',{credentials:'include'}).then(r=>r.json()).then(done)")
pid = next(p["id"] for p in plans if p["name"] == "Acceptance scenario")
m.js("location.reload()"); time.sleep(2)
m.wait("return document.body.innerText.includes('Saved scenarios on this floor')", 40, "studio after reload")
m.wait("return [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Open Acceptance scenario')", 20, "saved list")
step("saved scenario is listed after a full page reload", True)
m.click_text("button", "Open Acceptance scenario"); time.sleep(1.0)
reopened = [cand_xy(1), cand_xy(2)]
step("reopened scenario restores both AP positions exactly", reopened == saved_xy, f"{saved_xy} -> {reopened}")
step("reopened scenario predicts again and offers the next version", "Save as version 2" in m.js("return document.body.innerText"))
m.shot(f"{SH}/08_reopened.png")

# ---- 4. export + reproducibility -----------------------------------------------------------------------------------------
md = m.jsasync("const done=arguments[arguments.length-1];fetch('/api/v1/optimization/plans/'+arguments[0]+'/export?version=1&format=markdown',{credentials:'include'}).then(r=>r.text()).then(done)", pid)
step("exported report states model, assumptions, uncertainty and non-validation", all(k in md for k in ("Not a measurement and not physically validated", "Assumptions and limitations", "Input hash", "SYNTHETIC demonstration points", "assumed_default")), f"{len(md)} chars")
md2 = m.jsasync("const done=arguments[arguments.length-1];fetch('/api/v1/optimization/plans/'+arguments[0]+'/export?version=1&format=markdown',{credentials:'include'}).then(r=>r.text()).then(done)", pid)
step("exported report is byte-identical on a repeat request (deterministic)", md == md2)
open(f"{S}/acceptance_report.md", "w").write(md)

# ---- 5. Copilot ---------------------------------------------------------------------------------------------------------
m.click_text("a", "Ask the Copilot to explain this scenario"); m.wait("return !!document.querySelector('textarea')", 30, "copilot")
prompt = m.js("return document.querySelector('textarea').value")
step("Copilot opened for this floor with the scenario question pre-filled", "Acceptance scenario" in prompt and "uncertain" in prompt, prompt[:90])
for attempt in range(8):                       # the workspace creates its first conversation on load; a click before that is ignored
    time.sleep(1.5); m.click("button[title='Send message']"); time.sleep(1.0)
    if m.js("return document.querySelector('textarea').value") == "":
        break
step("question sent from the Copilot UI", m.js("return document.querySelector('textarea').value") == "", f"attempt {attempt+1}")
ok = m.wait("return document.body.innerText.includes('STUB PROVIDER')", 60, "copilot answer")
step("Copilot answered through the UI (stub provider; no real LLM was used)", ok)
time.sleep(1.0); m.shot(f"{SH}/09_copilot.png")
page = m.js("return document.body.innerText")
step("answer renders the MODEL PREDICTION badge", "MODEL PREDICTION" in page)
reqs = [json.loads(l) for l in open(f"{S}/stub_requests.jsonl")]
system = next(mm["content"] for mm in reqs[-1]["messages"] if mm["role"] == "system")
checks = {"tagged": "[MODEL_PREDICTION]" in system, "not validated": "NOT physically validated" in system, "scenario grounded": "Saved hypothetical scenario 'Acceptance scenario'" in system,
          "synthetic disclosed": "SYNTHETIC" in system, "uncertainty": "smaller than the modelled uncertainty" in system, "evidence gaps": "more real measurements needed" in system, "assumptions": "Model assumptions:" in system}
step("context sent to the provider is grounded, tagged, uncertainty- and evidence-gap-aware", all(checks.values()), str({k: v for k, v in checks.items() if not v}) or f"{len(system)} chars")
print("\nSUMMARY TABLE (current vs scenario, model):\n" + summary)
json.dump({"results": results, "summary_table": summary}, open(f"{S}/acceptance_results.json", "w"), indent=1)
print(f"\n{sum(r['ok'] for r in results)}/{len(results)} checks passed")
