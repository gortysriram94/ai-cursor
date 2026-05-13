"""
providers/bedrock.py — AWS Bedrock provider.

Requires: pip install boto3
Supports Anthropic Claude models on Bedrock (most common enterprise choice).
Other model families (Amazon Titan, Meta Llama) return is_available()=False
until their message format is added.

If boto3 is not installed, BedrockProvider loads without error but
is_available() returns False and stream()/complete() call on_error()/return ''.
"""
import json
from log import log
from .base import AIProvider

_BOTO3 = False
try:
    import boto3          # noqa: F401
    _BOTO3 = True
except ImportError:
    pass

# Models that use Anthropic's Messages API format via Bedrock
_ANTHROPIC_PREFIX = "anthropic."


class BedrockProvider(AIProvider):
    """
    AWS Bedrock inference provider.
    Currently supports Anthropic Claude models (anthropic.*).
    """

    def __init__(
        self,
        region:        str,
        model_id:      str,
        access_key:    str,
        secret_key:    str,
        session_token: str = "",
        name:          str = "Bedrock",
    ):
        self.region        = region
        self.model_id      = model_id
        self.access_key    = access_key
        self.secret_key    = secret_key
        self.session_token = session_token
        self.name          = name

    def is_available(self) -> bool:
        if not _BOTO3:
            return False
        return bool(self.access_key and self.secret_key and self.model_id and self.region)

    def _client(self):
        import boto3
        kwargs = dict(
            region_name          = self.region,
            aws_access_key_id    = self.access_key,
            aws_secret_access_key= self.secret_key,
        )
        if self.session_token:
            kwargs["aws_session_token"] = self.session_token
        return boto3.client("bedrock-runtime", **kwargs)

    def _build_body(self, messages: list[dict], max_tokens: int) -> dict:
        """Build Bedrock request body. Currently only handles Anthropic format."""
        if self.model_id.startswith(_ANTHROPIC_PREFIX):
            # Anthropic Claude via Bedrock uses the Messages API
            system_msgs = [m["content"] for m in messages if m["role"] == "system"]
            user_msgs   = [m for m in messages if m["role"] != "system"]
            body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens":        max_tokens,
                "messages":          user_msgs,
            }
            if system_msgs:
                body["system"] = " ".join(system_msgs)
            return body
        # Fallback: attempt generic OpenAI-style body (may not work for all models)
        return {"messages": messages, "max_tokens": max_tokens}

    def stream(self, messages, max_tokens, on_token, on_done, on_error):
        if not self.is_available():
            log(f"[Bedrock] not available — boto3={'installed' if _BOTO3 else 'missing'}")
            on_error()
            return
        try:
            client = self._client()
            body   = json.dumps(self._build_body(messages, max_tokens))
            resp   = client.invoke_model_with_response_stream(
                modelId     = self.model_id,
                body        = body,
                contentType = "application/json",
                accept      = "application/json",
            )
            for event in resp["body"]:
                chunk = json.loads(event["chunk"]["bytes"])
                # Anthropic streaming format
                if chunk.get("type") == "content_block_delta":
                    token = chunk.get("delta", {}).get("text", "")
                    if token:
                        on_token(token)
                elif chunk.get("type") == "message_stop":
                    break
            on_done()
        except Exception as e:
            log(f"[Bedrock STREAM] {e}")
            on_error()

    def complete(self, messages, max_tokens=400, timeout=30) -> str:
        if not self.is_available():
            return ""
        try:
            client = self._client()
            body   = json.dumps(self._build_body(messages, max_tokens))
            resp   = client.invoke_model(
                modelId     = self.model_id,
                body        = body,
                contentType = "application/json",
                accept      = "application/json",
            )
            result = json.loads(resp["body"].read())
            # Anthropic format
            if self.model_id.startswith(_ANTHROPIC_PREFIX):
                return result.get("content", [{}])[0].get("text", "").strip()
            return str(result)
        except Exception as e:
            log(f"[Bedrock COMPLETE] {e}")
            return ""
