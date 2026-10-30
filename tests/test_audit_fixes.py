"""Regression tests for the algorithm audit fixes (interval tree, DP routing,
fairness counter, timetable lock index, deadline heap)."""
import itertools
import math
import random
import sys

import pytest

from algorithm_engine import BatchAlgorithmEngine, Request, Resource, TimetableGuard
from algorithm_engine.allocation import weighted_interval_scheduling_dp
from algorithm_engine.conflict_detection import IntervalTree


def req(rid, res, start, end, user="u", pr=1, role="student", gs=1):
    return Request(rid, user, res, "room", start, end, priority=pr, role=role, group_size=gs)


# ---- finding 1: balanced, iterative interval tree --------------------------

def test_tree_matches_brute_force_with_cancellations():
    rnd = random.Random(7)
    for _ in range(200):
        t, live = IntervalTree(), []
        for i in range(rnd.randint(1, 80)):
            s = rnd.randint(0, 60)
            item = (s, s + rnd.randint(1, 15), f"r{i % 7}")      # ids deliberately reused
            t.insert(*item)
            live.append(item)
            if live and rnd.random() < 0.3:
                gone = rnd.choice(live)
                assert t.tombstone(*gone)
                live.remove(gone)
        for _ in range(15):
            a = rnd.randint(0, 70)
            b = a + rnd.randint(1, 20)
            expected = sorted(x for x in live if x[0] < b and a < x[1])
            assert sorted(t.query_overlaps(a, b)) == expected
            assert t.has_overlap(a, b) == bool(expected)


def test_tree_stays_balanced_on_sorted_input_and_never_recurses_deep():
    n = 20_000                                   # the old tree raised RecursionError near 1000
    t = IntervalTree()
    for i in range(n):
        t.insert(i, i + 1, f"b{i}")
    assert t.root.height <= 1.45 * math.log2(n + 2)
    assert t.query_overlaps(n // 2, n // 2 + 1) == [(n // 2, n // 2 + 1, f"b{n // 2}")]


def test_tree_compacts_after_many_cancellations():
    t = IntervalTree()
    for i in range(500):
        t.insert(i, i + 1, f"b{i}")
    for i in range(450):
        assert t.tombstone(i, i + 1, f"b{i}")
    assert len(t) == 50
    assert t._dead_count < 64                    # a compaction has run
    assert [x[2] for x in t.query_overlaps(0, 1000)] == [f"b{i}" for i in range(450, 500)]


def test_reused_id_after_cancel_is_a_fresh_live_booking():
    t = IntervalTree()
    t.insert(0, 5, "X")
    assert t.tombstone(0, 5, "X")
    assert not t.has_overlap(0, 5)
    t.insert(0, 5, "X")
    assert t.has_overlap(0, 5)


# ---- findings 2/3: exclusive rooms use the exact DP -------------------------

def test_dp_with_weights_is_optimal_against_brute_force():
    rnd = random.Random(3)
    for _ in range(300):
        rs = []
        for i in range(rnd.randint(0, 11)):
            s = rnd.randint(0, 30)
            rs.append(req(f"r{i}", "R", s, s + rnd.randint(1, 8)))
        w = {r.request_id: rnd.random() * 10 + 0.1 for r in rs}
        sel = weighted_interval_scheduling_dp(rs, weight=lambda r: w[r.request_id])
        ok = lambda sub: all(not (a.start < b.end and b.start < a.end) for a, b in itertools.combinations(sub, 2))
        assert ok(sel)
        best = max((sum(w[r.request_id] for r in sub) for k in range(len(rs) + 1)
                    for sub in itertools.combinations(rs, k) if ok(sub)), default=0)
        assert sum(w[r.request_id] for r in sel) == pytest.approx(best)


def test_exclusive_selection_is_exact_beyond_16_requests_and_respects_confirmed():
    room = Resource("E1", "E1", "room", capacity=10, threshold_hours=8.0, exclusive=True)
    eng = BatchAlgorithmEngine({"E1": room})
    eng.submit_immediate(req("fixed", "E1", 40, 44, user="ufix", pr=2, role="faculty"), 0.0)
    rnd = random.Random(11)
    cands = []
    for i in range(60):                           # old code fell back to greedy above 16
        s = rnd.randint(0, 100)
        cands.append(req(f"c{i}", "E1", s, s + rnd.randint(1, 6), user=f"u{i % 5}",
                         pr=rnd.randint(1, 3), gs=rnd.randint(1, 10)))
    sel = eng._select(cands, 10.0)
    assert not any(eng.detector.trees["E1"].has_overlap(r.start, r.end) for r in sel)
    for a, b in itertools.combinations(sel, 2):
        assert not (a.start < b.end and b.start < a.end)
    # exactness: no feasible request can be added without removing another
    ids = {r.request_id for r in sel}
    for r in cands:
        if r.request_id in ids or eng.detector.trees["E1"].has_overlap(r.start, r.end):
            continue
        assert any(r.start < s.end and s.start < r.end for s in sel)


def _brute_force_best(eng, cands, now):
    """Highest total score over every non-overlapping subset of cands."""
    sc = {r.request_id: eng.score(r, now) for r in cands}
    best_total, best_ids = 0.0, set()
    for k in range(len(cands) + 1):
        for sub in itertools.combinations(cands, k):
            if all(not (x.start < y.end and y.start < x.end) for x, y in itertools.combinations(sub, 2)):
                tot = sum(sc[r.request_id] for r in sub)
                if tot > best_total + 1e-12:
                    best_total, best_ids = tot, {r.request_id for r in sub}
    return best_total, best_ids, sc


def test_exclusive_cluster_winner_is_highest_scoring_set():
    room = Resource("E1", "E1", "room", capacity=10, threshold_hours=8.0, exclusive=True)
    eng = BatchAlgorithmEngine({"E1": room})
    cands = [req("stu_a", "E1", 100, 103, user="a"),
             req("stu_b", "E1", 103, 106, user="b"),
             req("hod", "E1", 101, 105, user="h", pr=3, role="hod", gs=10)]
    for r in cands:
        eng.submit(r, 0.0)
    best_total, best_ids, sc = _brute_force_best(eng, cands, 95.0)
    eng.resolve_due(95.0)
    confirmed = {a.request_id for a in eng.accepted}
    assert sum(sc[i] for i in confirmed) == pytest.approx(best_total)
    assert confirmed == best_ids


# ---- finding 5: O(1) fairness counter ------------------------------------------

def test_held_counter_tracks_every_mutation_path():
    room = Resource("R", "R", "room", capacity=50, threshold_hours=0.0, exclusive=False)
    eng = BatchAlgorithmEngine({"R": room})
    for i in range(6):
        eng.submit(req(f"r{i}", "R", i * 2, i * 2 + 1, user=f"u{i % 2}"), 0.0)
    recount = lambda u: sum(1 for a in eng.accepted if a.user_id == u)
    assert eng.accepted.held("u0") == recount("u0") == 3
    eng.cancel("r0", 1.0)                                        # public path
    victim = eng.accepted[0]
    eng.accepted.remove(victim)                                  # direct mutation (timetable guard does this)
    eng.accepted.pop()
    for u in ("u0", "u1", "nobody"):
        assert eng.accepted.held(u) == recount(u)
    eng.accepted = list(eng.accepted)                            # reassignment re-wraps
    for u in ("u0", "u1"):
        assert eng.accepted.held(u) == recount(u)


def test_score_uses_the_counter_not_a_scan(monkeypatch):
    room = Resource("R", "R", "room", capacity=5, threshold_hours=0.0)
    eng = BatchAlgorithmEngine({"R": room})
    for i in range(3):
        eng.submit(req(f"x{i}", "R", i * 2, i * 2 + 1, user="busy"), 0.0)
    r = req("probe", "R", 50, 51, user="busy")
    base = eng.score(r, 0.0)

    class Boom(list):
        def __iter__(self):
            raise AssertionError("score() scanned the accepted list")
    monkeypatch.setattr(type(eng.accepted), "__iter__", Boom.__iter__, raising=True)
    assert eng.score(r, 0.0) == base


# ---- finding 6: indexed timetable locks ------------------------------------------

class _Row:
    def __init__(self, i, room, start, end):
        self.entry_id, self.room_id, self.start, self.end = f"E{i}", room, start, end
        self.faculty_id = f"F{i}"; self.faculty_name = f"Prof {i}"; self.course_code = f"C{i}"
        self.course_name = f"Course {i}"; self.section_id = "A"; self.day = "Mon"
        self.start_time = "09:00"; self.end_time = "10:00"; self.expected_students = 10


def _guarded_engine():
    rooms = {"R1": Resource("R1", "R1", "room", capacity=30, threshold_hours=0.0),
             "R2": Resource("R2", "R2", "room", capacity=30, threshold_hours=0.0)}
    eng = BatchAlgorithmEngine(rooms)
    g = TimetableGuard()
    g.finalize(eng, [_Row(1, "R1", 9, 10), _Row(2, "R1", 11, 12), _Row(3, "R2", 9, 10)], week_start=0.0, weeks=40, now=0.0)
    return eng, g


def test_overlapping_locks_matches_linear_scan_and_respects_override():
    eng, g = _guarded_engine()
    rnd = random.Random(5)

    def linear(res, a, b):
        return sorted(w.occurrence_id for w in g.locked.get(res, []) if not w.overridden and w.start < b and a < w.end)

    for _ in range(200):
        a = rnd.uniform(0, 168 * 40); b = a + rnd.uniform(0.2, 30)
        res = rnd.choice(["R1", "R2"])
        assert sorted(w.occurrence_id for w in g.overlapping_locks(res, a, b)) == linear(res, a, b)

    g.manual_override(eng, req("ov", "R1", 9, 10, user="hod", pr=3, role="hod"), 0.0, "hod", "hod1", "test")
    assert g.overlapping_locks("R1", 9.2, 9.8) == []                    # overridden occurrence no longer locks
    assert not g.is_timetable_request("E1#W00")
    assert g.is_timetable_request("E1#W01")
    assert [w.occurrence_id for w in g.overlapping_locks("R1", 168 + 9.2, 168 + 9.8)] == ["E1#W01"]


def test_clear_timetable_and_reset_drop_the_index():
    eng, g = _guarded_engine()
    assert g.overlapping_locks("R1", 9.2, 9.8)
    g.clear_timetable(eng)
    assert g.overlapping_locks("R1", 9.2, 9.8) == []
    assert not g.is_timetable_request("E1#W00")
    g.finalize(eng, [_Row(1, "R1", 9, 10)], week_start=0.0, weeks=2, now=0.0)
    assert g.overlapping_locks("R1", 9.2, 9.8)
    g.reset()
    assert g.overlapping_locks("R1", 9.2, 9.8) == []


# ---- finding 7: deadline heap -----------------------------------------------------

def _queued_engine(n=300):
    room = Resource("R", "R", "room", capacity=100, threshold_hours=8.0, exclusive=False)
    eng = BatchAlgorithmEngine({"R": room}, aging_rate=0.05)
    for i in range(n):
        s = 1000 + i * 3
        eng.submit(req(f"q{i}", "R", s, s + 2, user=f"u{i % 9}", gs=10), 0.0)
    return eng


def test_idle_tick_does_no_clustering(monkeypatch):
    eng = _queued_engine()
    calls = []
    monkeypatch.setattr(eng, "_cluster_of", lambda *a, **k: calls.append(1))
    assert eng.resolve_due(500.0) == []                                    # first deadline is 992
    assert calls == []
    assert len(eng.pending) == 300


def test_due_tick_decides_only_due_clusters():
    eng = _queued_engine()
    out = eng.resolve_due(992.0 + 0.5)                                     # only q0's lock point has passed
    assert {r.request_id for r in out} <= {"q0", "q1", "q2"}               # q0 plus whatever overlaps it
    assert len(eng.pending) >= 297
    assert all(r.request_id not in eng.pending for r in out)


def test_replaced_pending_id_and_stale_heap_entries_are_harmless():
    room = Resource("R", "R", "room", capacity=10, threshold_hours=8.0, exclusive=True)
    eng = BatchAlgorithmEngine({"R": room})
    eng.submit(req("same", "R", 100, 102), 0.0)
    eng.submit(req("same", "R", 200, 202), 1.0)                            # re-submitted while queued
    assert eng.pending["same"].start == 200
    eng.resolve_due(150.0)                                                 # the stale 100-102 entry is due, the live one is not
    assert "same" in eng.pending
    eng.resolve_due(195.0)
    assert "same" not in eng.pending and [a.start for a in eng.accepted] == [200]


def test_reindex_deadlines_after_threshold_change():
    room = Resource("R", "R", "room", capacity=10, threshold_hours=8.0, exclusive=True)
    eng = BatchAlgorithmEngine({"R": room})
    eng.submit(req("a", "R", 100, 102), 0.0)
    room.threshold_hours = 24.0                                            # lock point moves from 92 to 76
    assert eng.resolve_due(80.0) == []                                     # heap still holds the old point
    eng.reindex_deadlines()
    assert [r.request_id for r in eng.resolve_due(80.0)] == ["a"]


def test_cluster_is_transitive_chain_and_decided_as_one_unit():
    room = Resource("R", "R", "room", capacity=10, threshold_hours=8.0, exclusive=True)
    eng = BatchAlgorithmEngine({"R": room})
    chain = [req("c1", "R", 100, 104, user="a"),
             req("c2", "R", 103, 108, user="b", pr=3, role="hod"),   # overlaps c1 only
             req("c3", "R", 107, 111, user="c")]                     # overlaps c2 only; its own deadline is later
    for r in chain:
        eng.submit(r, 0.0)
    eng.submit(req("far", "R", 500, 502, user="d"), 0.0)
    best_total, best_ids, sc = _brute_force_best(eng, chain, 92.5)
    out = eng.resolve_due(92.5)                                       # only c1's lock point (92) has passed
    assert {r.request_id for r in out} == {"c1", "c2", "c3"}          # the whole chain is decided together
    assert "far" in eng.pending
    confirmed = {a.request_id for a in eng.accepted}
    assert confirmed == best_ids                                      # the optimal SET, not the best individual
    assert all(r.status in ("confirmed", "rejected") for r in out)
