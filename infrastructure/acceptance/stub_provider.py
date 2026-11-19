"""Loopback OpenAI-compatible STUB (no language model). Logs every request and answers with a labelled extract of the context it was given."""
import json, re, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOG = sys.argv[1]
KEYS = ("[MODEL_PREDICTION]", "Saved hypothetical scenario", "Weak area", "more real measurements", "smaller than the modelled uncertainty", "NOT physically validated", "SYNTHETIC", "serving AP")


def answer(payload):
    system = next((m["content"] for m in payload["messages"] if m["role"] == "system"), "")
    ctx = system.split("<AIRGRID_EVALUATED_CONTEXT>")[-1].split("</AIRGRID_EVALUATED_CONTEXT>")[0]
    lines = [l.strip() for l in ctx.splitlines() if any(k in l for k in KEYS)][:14]
    question = payload["messages"][-1]["content"]
    return ("**STUB PROVIDER - no language model answered.** This is an extract of the grounded context the Copilot sent, to verify grounding.\n\n"
            f"Question: {question}\n\n" + "\n".join(f"- {l}" for l in lines) + "\n\n[MODEL_PREDICTION] values are simulations, not measurements.")


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _json(self, obj, code=200):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        self._json({"object": "list", "data": [{"id": "stub-model", "object": "model"}]})

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        with open(LOG, "a") as fh: fh.write(json.dumps(payload) + "\n")
        text = answer(payload)
        if payload.get("stream"):
            self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
            for i in range(0, len(text), 80):
                self.wfile.write(("data: " + json.dumps({"id": "stub", "model": "stub-model", "choices": [{"index": 0, "delta": {"content": text[i:i + 80]}}]}) + "\n\n").encode()); self.wfile.flush()
            self.wfile.write(b"data: [DONE]\n\n")
        else:
            self._json({"id": "stub", "model": "stub-model", "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}})


ThreadingHTTPServer(("127.0.0.1", 18080), H).serve_forever()
