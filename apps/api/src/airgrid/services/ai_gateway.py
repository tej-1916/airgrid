import time
import uuid
from typing import Optional
import httpx

from airgrid.core.config import settings
from airgrid.core.logging import logger
from airgrid.schemas.ai import (
    AIGenerateRequest,
    AIGenerateResponse,
    PromptCategory,
    TokenUsage,
)


class AIGatewayService:
    """
    Provider-independent AI Gateway.
    Orchestrates LLM inference while enforcing server-side key isolation,
    requested vs. verified model tracking, and fallback auditing.
    """

    def __init__(self):
        self.base_url = settings.AIRGRID_AI_API_BASE_URL.rstrip("/")
        self.api_key = settings.AIRGRID_AI_API_KEY
        self.default_model = settings.AIRGRID_AI_DEFAULT_MODEL
        self.timeout = settings.AIRGRID_AI_TIMEOUT_SECONDS

    def is_configured(self) -> bool:
        """Returns True if an API key is present."""
        return bool(self.api_key and self.api_key.strip())

    async def generate(self, req: AIGenerateRequest) -> AIGenerateResponse:
        """
        Executes a prompt against the configured provider.
        If credentials are not configured (standard in Phase 00), returns a
        truthful, safe unconfigured status without making network calls or faking data.
        """
        request_id = f"req_ai_{uuid.uuid4().hex[:12]}"
        requested_model = req.requested_model or self.default_model
        start_time = time.perf_counter()

        # Phase 00 guardrail: if unconfigured, return safe degraded response
        if not self.is_configured():
            logger.info("AI Gateway invoked in unconfigured state (Request: %s)", request_id)
            return AIGenerateResponse(
                request_id=request_id,
                status="unconfigured",
                prompt_category=req.category,
                requested_model=requested_model,
                verified_model=None,
                is_verified_execution=False,
                fallback_detected=False,
                duration_ms=0,
                output_text="AI Gateway is initialized in Phase 00 contract-mode. No external API key is configured.",
                tokens=TokenUsage(prompt=0, completion=0, total=0),
                error_message="Provider credentials not configured (AIRGRID_AI_API_KEY is empty).",
            )

        # Provider execution
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": requested_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are AirGrid Network AI, an expert wireless engineer assisting with "
                        "campus network troubleshooting and optimization."
                    ),
                },
                {"role": "user", "content": req.prompt},
            ],
            "temperature": req.temperature or settings.AIRGRID_AI_TEMPERATURE,
            "max_tokens": req.max_tokens or 512,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )

            duration_ms = int((time.perf_counter() - start_time) * 1000)

            if response.status_code != 200:
                logger.error("AI Provider returned HTTP %s: %s", response.status_code, response.text)
                return AIGenerateResponse(
                    request_id=request_id,
                    status="failed",
                    prompt_category=req.category,
                    requested_model=requested_model,
                    verified_model=None,
                    is_verified_execution=False,
                    fallback_detected=False,
                    duration_ms=duration_ms,
                    output_text="",
                    tokens=TokenUsage(),
                    error_message=f"Provider HTTP error {response.status_code}",
                )

            data = response.json()
            output_text = ""
            if "choices" in data and len(data["choices"]) > 0:
                output_text = data["choices"][0].get("message", {}).get("content", "")

            # Truthful Model Verification
            provider_reported_model = data.get("model")
            is_verified = bool(provider_reported_model)

            fallback_detected = False
            if is_verified and provider_reported_model:
                fallback_detected = (
                    provider_reported_model.strip().lower() != requested_model.strip().lower()
                )

            usage = data.get("usage", {})
            tokens = TokenUsage(
                prompt=usage.get("prompt_tokens", 0),
                completion=usage.get("completion_tokens", 0),
                total=usage.get("total_tokens", 0),
            )

            return AIGenerateResponse(
                request_id=request_id,
                status="success",
                prompt_category=req.category,
                requested_model=requested_model,
                verified_model=provider_reported_model,
                is_verified_execution=is_verified,
                fallback_detected=fallback_detected,
                duration_ms=duration_ms,
                output_text=output_text,
                tokens=tokens,
            )

        except httpx.TimeoutException:
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            return AIGenerateResponse(
                request_id=request_id,
                status="timeout",
                prompt_category=req.category,
                requested_model=requested_model,
                verified_model=None,
                is_verified_execution=False,
                fallback_detected=False,
                duration_ms=duration_ms,
                output_text="",
                tokens=TokenUsage(),
                error_message=f"Inference request timed out after {self.timeout}s",
            )
        except Exception as exc:
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            logger.exception("AI Gateway unexpected error: %s", exc)
            return AIGenerateResponse(
                request_id=request_id,
                status="failed",
                prompt_category=req.category,
                requested_model=requested_model,
                verified_model=None,
                is_verified_execution=False,
                fallback_detected=False,
                duration_ms=duration_ms,
                output_text="",
                tokens=TokenUsage(),
                error_message=str(exc),
            )


ai_gateway = AIGatewayService()
