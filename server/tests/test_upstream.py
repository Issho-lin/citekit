import unittest

from citekit_server.db import AiModelRow
from citekit_server.infra.protocol import protocol_of
from citekit_server.infra.upstream import (
    _as_chat_payload,
    _choice_message,
    _choice_text,
    _endpoint,
    _payload,
    parse_chat_sse_line,
    protocol_for_model,
)

ARK = "https://ark.cn-beijing.volces.com/api/v3"


def _model(**kwargs: object) -> AiModelRow:
    values = {
        "id": "doubao-seed-2-1-pro-260628",
        "name": "豆包",
        "type": "llm",
        "provider": "Doubao",
        "request_url": ARK,
        "mapped_model": "doubao-seed-2-1-pro-260628",
    }
    values.update(kwargs)
    return AiModelRow(**values)


class DoubaoChatProtocolTest(unittest.TestCase):
    def test_chat_hits_completions_not_responses(self):
        proto = protocol_of("Doubao")
        self.assertEqual(_endpoint(ARK, proto, "chat"), f"{ARK}/chat/completions")
        self.assertEqual(proto.chat_fallback_path, "responses")

    def test_ping_matches_ark_chat_shape(self):
        model = _model()
        proto = protocol_for_model(model)
        url = _endpoint(ARK, proto, "chat")
        body = _payload(model, proto, "chat", url=url)
        self.assertEqual(body["model"], "doubao-seed-2-1-pro-260628")
        self.assertEqual(body["thinking"], {"type": "disabled"})
        self.assertNotIn("chat_template_kwargs", body)
        self.assertNotIn("max_tokens", body)
        self.assertEqual(
            body["messages"],
            [{"role": "user", "content": [{"type": "text", "text": "citekit ping"}]}],
        )

    def test_volces_url_even_if_provider_is_other(self):
        model = _model(provider="Other")
        proto = protocol_for_model(model)
        url = _endpoint(ARK, proto, "chat")
        body = _as_chat_payload(
            style="completions",
            model_id="m",
            messages=[{"role": "user", "content": "你好"}],
            thinking=False,
            temperature=0.1,
            url=url,
        )
        self.assertEqual(body["messages"][0]["content"], [{"type": "text", "text": "你好"}])
        self.assertEqual(body["thinking"], {"type": "disabled"})


class ChatParseTest(unittest.TestCase):
    def test_completions_content_parts(self):
        text = _choice_text(
            {"choices": [{"message": {"content": [{"type": "text", "text": "你好"}]}}]}
        )
        self.assertEqual(text, "你好")

    def test_responses_output_text(self):
        text = _choice_text({"output_text": "你好"})
        self.assertEqual(text, "你好")

    def test_responses_function_call(self):
        out = _choice_message(
            {
                "output": [
                    {"type": "function_call", "call_id": "c1", "name": "search", "arguments": "{}"}
                ]
            }
        )
        self.assertEqual(out["tool_calls"][0]["function"]["name"], "search")


class ChatSseParseTest(unittest.TestCase):
    def test_completions_delta(self):
        _, events = parse_chat_sse_line(
            'data: {"choices":[{"delta":{"content":"目"}}]}',
            style="completions",
        )
        self.assertEqual(events, [{"type": "token", "text": "目"}])

    def test_completions_done(self):
        _, events = parse_chat_sse_line("data: [DONE]", style="completions")
        self.assertEqual(events, [])

    def test_responses_output_text_delta(self):
        event, events = parse_chat_sse_line("event: response.output_text.delta", style="responses")
        self.assertEqual(event, "response.output_text.delta")
        _, events = parse_chat_sse_line('data: {"delta":"前"}', style="responses", event=event)
        self.assertEqual(events, [{"type": "token", "text": "前"}])

    def test_raw_json_line(self):
        _, events = parse_chat_sse_line(
            '{"choices":[{"delta":{"content":"好"}}]}',
            style="completions",
        )
        self.assertEqual(events, [{"type": "token", "text": "好"}])
        _, events = parse_chat_sse_line(
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"search","arguments":"{"}}]}}]}',
            style="completions",
        )
        self.assertEqual(events[0]["type"], "tool_delta")
        self.assertEqual(events[0]["tool_calls"][0]["function"]["name"], "search")
