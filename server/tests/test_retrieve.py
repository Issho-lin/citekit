import unittest
from unittest.mock import Mock, patch

from citekit_server.infra.search_index import _document, search
from citekit_server.retrieve.logic import _rrf_merge, _search_debug


class OpenSearchQueryTest(unittest.TestCase):
    def test_search_scopes_to_kb_and_sources(self):
        fake = Mock()
        fake.indices.exists.return_value = True
        fake.search.return_value = {"hits": {"hits": [{"_id": "hit", "_score": 2.5}]}}
        with patch("citekit_server.infra.search_index.client", return_value=fake):
            scores = search(kb_id="kb_a", query="合同解除", limit=50, source_ids=["src_a"])
        self.assertEqual(scores, {"hit": 2.5})
        body = fake.search.call_args.kwargs["body"]
        filters = body["query"]["bool"]["filter"]
        self.assertIn({"term": {"kb_id": "kb_a"}}, filters)
        self.assertIn({"terms": {"source_id": ["src_a"]}}, filters)
        self.assertEqual(body["query"]["bool"]["must"][0]["multi_match"]["fields"], [
            "title^2", "text", "answer^1.2", "indexes^1.5"
        ])
        self.assertEqual(body["sort"], [{"_score": {"order": "desc"}}, {"chunk_id": {"order": "asc"}}])

    def test_warehouse_is_a_server_side_query_filter(self):
        fake = Mock()
        fake.indices.exists.return_value = True
        fake.search.return_value = {"hits": {"hits": []}}
        with patch("citekit_server.infra.search_index.client", return_value=fake):
            search(kb_id="kb_a", query="库存", limit=20, warehouse="上海仓")
        must = fake.search.call_args.kwargs["body"]["query"]["bool"]["must"]
        self.assertIn({"match_phrase": {"text": "上海仓"}}, must)

    def test_document_strips_urls_and_keeps_search_fields(self):
        class Row:
            id = "chunk_a"
            kb_id = "kb_a"
            source_id = "src_a"
            title = "[链接标题](https://example.com)"
            text = "正文 <https://example.com/path>"
            answer = None
            indexes = [{"text": "补充关键词"}]
            locator = "file #1"

        doc = _document(Row())
        self.assertEqual(doc["title"], "链接标题")
        self.assertNotIn("https://", doc["text"])
        self.assertEqual(doc["indexes"], "补充关键词")


class RrfMergeTest(unittest.TestCase):
    def test_doc_in_both_lists_outranks_single_list_leader(self):
        keyword = {"both": 0.4, "lex_only": 0.9}
        semantic = {"both": (0.72, ""), "sem_only": (0.99, "")}
        merged = _rrf_merge(keyword, semantic, 0.6)
        self.assertGreater(merged["both"][0], merged["lex_only"][0])
        self.assertGreater(merged["both"][0], merged["sem_only"][0])
        self.assertAlmostEqual(merged["both"][0], 2 / 62)
        self.assertEqual(merged["both"][1], "混合检索")

    def test_similarity_only_drops_weak_vectors(self):
        merged = _rrf_merge({"keep": 0.4}, {"weak": (0.3, "")}, 0.6)
        self.assertIn("keep", merged)
        self.assertNotIn("weak", merged)
        self.assertAlmostEqual(merged["keep"][0], 1 / 61)


class SearchDebugTest(unittest.TestCase):
    def test_vector_below_threshold_listed(self):
        class Row:
            title = "弱向量块"
            locator = "file #9"

        debug = _search_debug({"weak": Row()}, {}, {"weak": (0.41, "title")}, 0.6, [], set(), False)
        self.assertEqual(debug.vectorDroppedCount, 1)
        self.assertEqual(debug.dropped[0].locator, "file #9")
        self.assertIn("低于阈值", debug.dropped[0].reason)

    def test_fused_cut_by_topk_listed(self):
        class Row:
            title = "融合第2"
            locator = "file #2"

        fused = [("a", 0.03, "混合检索"), ("b", 0.02, "混合检索")]
        debug = _search_debug({"b": Row()}, {}, {}, 0.2, fused, {"a"}, False)
        self.assertEqual(debug.dropped[0].locator, "file #2")
        self.assertIn("融合第 2", debug.dropped[0].reason)

    def test_vector_error_kept_on_debug(self):
        debug = _search_debug({}, {}, {}, 0.2, [], set(), False, "qdrant down")
        self.assertEqual(debug.vectorCount, 0)
        self.assertEqual(debug.vectorError, "qdrant down")
