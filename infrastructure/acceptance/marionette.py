"""Minimal stdlib Marionette client: drives the installed stock Firefox (no geckodriver, no downloads)."""
import base64, json, socket, time

EL = "element-6066-11e4-a52e-4f735466cecf"


class Marionette:
    def __init__(self, host="127.0.0.1", port=2828):
        self.sock = socket.create_connection((host, port), timeout=60)
        self.n = 0
        self._read()                                   # server handshake

    def _read(self):
        prefix = b""
        while not prefix.endswith(b":"):
            prefix += self.sock.recv(1)
        size, data = int(prefix[:-1]), b""
        while len(data) < size:
            data += self.sock.recv(size - len(data))
        return json.loads(data.decode())

    def call(self, command, params=None):
        self.n += 1
        raw = json.dumps([0, self.n, command, params or {}]).encode()
        self.sock.sendall(str(len(raw)).encode() + b":" + raw)
        while True:
            r = self._read()
            if r[0] == 1 and r[1] == self.n:
                if r[2]:
                    raise RuntimeError(f"{command}: {r[2]}")
                return r[3]

    def start(self):
        return self.call("WebDriver:NewSession", {"capabilities": {"alwaysMatch": {}}})

    def window(self, w, h):
        self.call("WebDriver:SetWindowRect", {"width": w, "height": h, "x": 0, "y": 0})

    def go(self, url):
        self.call("WebDriver:Navigate", {"url": url})

    def js(self, script, *args):
        return self.call("WebDriver:ExecuteScript", {"script": script, "args": list(args)})["value"]

    def find(self, css):
        return self.call("WebDriver:FindElement", {"using": "css selector", "value": css})["value"][EL]

    def find_all(self, css):
        return [e[EL] for e in self.call("WebDriver:FindElements", {"using": "css selector", "value": css})]

    def exists(self, css):
        return bool(self.js("return !!document.querySelector(arguments[0])", css))

    def click(self, css_or_id):
        el = css_or_id if len(css_or_id) == 36 and "-" in css_or_id else self.find(css_or_id)
        self.call("WebDriver:ElementClick", {"id": el})

    def type(self, css, text):
        el = self.find(css)
        self.call("WebDriver:ElementClear", {"id": el})
        self.call("WebDriver:ElementSendKeys", {"id": el, "text": text})

    def click_at(self, css, dx, dy):
        """Real pointer click at an offset (px) from the element's centre."""
        el = self.find(css)
        self.call("WebDriver:PerformActions", {"actions": [{"type": "pointer", "id": "mouse", "parameters": {"pointerType": "mouse"}, "actions": [
            {"type": "pointerMove", "x": int(dx), "y": int(dy), "origin": {EL: el}}, {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}]}]})

    def drag(self, css, dx0, dy0, dx1, dy1):
        el = self.find(css)
        self.call("WebDriver:PerformActions", {"actions": [{"type": "pointer", "id": "mouse", "parameters": {"pointerType": "mouse"}, "actions": [
            {"type": "pointerMove", "x": int(dx0), "y": int(dy0), "origin": {EL: el}}, {"type": "pointerDown", "button": 0},
            {"type": "pointerMove", "x": int((dx0 + dx1) / 2), "y": int((dy0 + dy1) / 2), "origin": {EL: el}, "duration": 100},
            {"type": "pointerMove", "x": int(dx1), "y": int(dy1), "origin": {EL: el}, "duration": 100}, {"type": "pointerUp", "button": 0}]}]})

    def shot(self, path):
        data = self.call("WebDriver:TakeScreenshot", {"full": False, "scroll": True})["value"]
        open(path, "wb").write(base64.b64decode(data))

    def wait(self, script, timeout=30, what="condition"):
        end = time.time() + timeout
        while time.time() < end:
            try:
                v = self.js(script)
                if v:
                    return v
            except RuntimeError:
                pass
            time.sleep(0.3)
        raise TimeoutError(f"timed out waiting for {what}")

    def by_text(self, tag, text, contains=False):
        r = self.js("const t=arguments[1],c=arguments[2];return [...document.querySelectorAll(arguments[0])].find(e=>c?e.textContent.includes(t):e.textContent.trim()===t)||null", tag, text, contains)
        return r[EL] if r else None

    def click_text(self, tag, text, contains=False):
        el = self.by_text(tag, text, contains)
        if not el:
            raise RuntimeError(f"no <{tag}> with text {text!r}")
        self.js("arguments[0].scrollIntoView({block:'center'})", {EL: el})
        self.call("WebDriver:ElementClick", {"id": el})

    def jsasync(self, script, *args):
        return self.call("WebDriver:ExecuteAsyncScript", {"script": script, "args": list(args)})["value"]

    def set_select(self, css, value):
        self.js("const s=document.querySelector(arguments[0]);s.value=arguments[1];s.dispatchEvent(new Event('change',{bubbles:true}))", css, value)
