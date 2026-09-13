import unittest

from citekit_server.retrieve.logic import _bm25, _rrf_merge, _search_debug


class Bm25Test(unittest.TestCase):
    def test_query_term_ranks_matching_doc_higher(self):
        docs = {"hit": "the cat sat on the mat", "miss": "the dog ran"}
        scores = _bm25("cat", docs)
        self.assertGreater(scores["hit"], scores.get("miss", 0))

    def test_cjk_bigrams_match(self):
        docs = {"hit": "合同解除条款说明", "miss": "天气很好"}
        scores = _bm25("解除", docs)
        self.assertIn("hit", scores)
        self.assertNotIn("miss", scores)


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

        debug = _search_debug(
            {"weak": Row()},
            {},
            {"weak": (0.41, "title")},
            0.6,
            [],
            set(),
            False,
        )
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
