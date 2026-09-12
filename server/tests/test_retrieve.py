import unittest

from citekit_server.retrieve.logic import _bm25, _rrf_merge


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
