"""Independent finite-deck blackjack combinatorial analyzer for the basic-strategy audit.

American hole-card game. Dealer peeks with a ten or ace up; all EVs against a ten or
ace are computed "unnormalized" (expectation of result * 1{dealer has no BJ}) and
divided by P(no BJ) at the top, which is exact, including the reweighting of the
player's own draws by the no-BJ information.

Ranks: index 0 = ace, 1..8 = 2..9, 9 = ten.
"""
import numpy as np
import itertools, json, sys, time

OUT_IDX = {17: 0, 18: 1, 19: 2, 20: 3, 21: 4}  # 5 = bust
MAXK = 12


def dealer_groups(up, h17, exclude_first):
    """Group every dealer drawing sequence by (multiset of drawn cards, outcome).

    up: rank index of upcard; exclude_first: rank index the hole card cannot be (peek), or None.
    Returns arrays K (G x 10), outcome (G), mult (G), ksum (G).
    """
    groups = {}

    def rec(hard, ace, K, first):
        soft_total = hard + 10 if ace and hard + 10 <= 21 else hard
        is_soft = ace and hard + 10 <= 21
        if not first:
            if soft_total > 21:
                key = (tuple(K), 5)
                groups[key] = groups.get(key, 0) + 1
                return
            if soft_total >= 18 or (soft_total == 17 and not (is_soft and h17)):
                key = (tuple(K), OUT_IDX[soft_total])
                groups[key] = groups.get(key, 0) + 1
                return
        for r in range(10):
            if first and exclude_first is not None and r == exclude_first:
                continue
            K[r] += 1
            rec(hard + r + 1, ace or r == 0, K, False)
            K[r] -= 1

    rec(up + 1, up == 0, [0] * 10, True)
    keys = list(groups.keys())
    K = np.array([k[0] for k in keys], dtype=np.int64)
    out = np.array([k[1] for k in keys], dtype=np.int64)
    mult = np.array([groups[k] for k in keys], dtype=np.float64)
    assert K.max() <= MAXK
    return K, out, mult, K.sum(axis=1)


class Dealer:
    def __init__(self, up, h17):
        self.up = up
        self.peek = 0 if up == 9 else (9 if up == 0 else None)  # card the hole card can't be
        self.K, self.out, self.mult, self.ksum = dealer_groups(up, h17, self.peek)
        self.rows = np.arange(10)[None, :]
        self.maxs = int(self.ksum.max())

    def vec(self, n):
        """Unnormalized outcome probabilities (17..21, bust) for remaining counts n (len 10)."""
        n = np.asarray(n, dtype=np.float64)
        N = n.sum()
        T = np.ones((10, MAXK + 1))
        for k in range(1, MAXK + 1):
            T[:, k] = T[:, k - 1] * np.maximum(n - (k - 1), 0)
        ffN = np.ones(self.maxs + 1)
        for i in range(1, self.maxs + 1):
            ffN[i] = ffN[i - 1] * (N - (i - 1))
        p = self.mult * np.prod(T[self.rows, self.K], axis=1) / ffN[self.ksum]
        return np.bincount(self.out, weights=p, minlength=6)

    def pnb(self, n):
        if self.peek is None:
            return 1.0
        return 1.0 - n[self.peek] / sum(n)


def hand_total(h):
    """h: counts tuple. Returns (total, soft)."""
    hard = sum((r + 1) * c for r, c in enumerate(h))
    if h[0] and hard + 10 <= 21:
        return hard + 10, True
    return hard, False


def stand_ev(total, dv, pnb):
    if total > 21:
        return -pnb
    d17, d18, d19, d20, d21, bust = dv
    dt = [d17, d18, d19, d20, d21]
    win = bust
    lose = 0.0
    for i, t in enumerate(range(17, 22)):
        if t < total:
            win += dt[i]
        elif t > total:
            lose += dt[i]
    return win - lose


class Solver:
    """All EVs for one (decks, h17, upcard)."""

    def __init__(self, decks, h17, up):
        self.decks, self.h17, self.up = decks, h17, up
        shoe = [4 * decks] * 10
        shoe[9] = 16 * decks
        shoe[up] -= 1
        self.base = tuple(shoe)
        self.dealer = Dealer(up, h17)
        self.dmemo = {}
        self.vmemo = {}

    def remaining(self, removed):
        return [b - r for b, r in zip(self.base, removed)]

    def dinfo(self, removed):
        v = self.dmemo.get(removed)
        if v is None:
            n = self.remaining(removed)
            v = (self.dealer.vec(n), self.dealer.pnb(n), n, sum(n))
            self.dmemo[removed] = v
        return v

    def stand(self, hand, extra):
        removed = tuple(a + b for a, b in zip(hand, extra))
        dv, pnb, n, N = self.dinfo(removed)
        t, _ = hand_total(hand)
        return stand_ev(t, dv, pnb)

    def bust_value(self, hand, extra):
        removed = tuple(a + b for a, b in zip(hand, extra))
        return -self.dealer.pnb(self.remaining(removed))

    def draw_probs(self, hand, extra):
        removed = tuple(a + b for a, b in zip(hand, extra))
        n = self.remaining(removed)
        N = sum(n)
        return [(r, n[r] / N) for r in range(10) if n[r] > 0]

    def best_hs(self, hand, extra):
        """Optimal hit/stand value (unnormalized), composition dependent."""
        key = (hand, extra)
        v = self.vmemo.get(key)
        if v is not None:
            return v
        t, _ = hand_total(hand)
        if t > 21:
            v = self.bust_value(hand, extra)
        elif t == 21:
            v = self.stand(hand, extra)
        else:
            v = max(self.stand(hand, extra), self.hit(hand, extra))
        self.vmemo[key] = v
        return v

    def hit(self, hand, extra):
        s = 0.0
        for r, p in self.draw_probs(hand, extra):
            h2 = list(hand); h2[r] += 1
            s += p * self.best_hs(tuple(h2), extra)
        return s

    def double(self, hand, extra):
        s = 0.0
        for r, p in self.draw_probs(hand, extra):
            h2 = list(hand); h2[r] += 1
            h2 = tuple(h2)
            t, _ = hand_total(h2)
            s += p * (self.bust_value(h2, extra) if t > 21 else self.stand(h2, extra))
        return 2 * s

    def split(self, p, das, dbl_rule, resplit):
        """Split EV (unnormalized) for pair rank p.

        Each hand starts from one pair card with the shoe less both pair cards and the upcard;
        hands are treated as independent (standard approximation). Split aces: one card each,
        no resplit. Other pairs: resplit to 4 hands via a branching approximation with the
        pair-card probability held at its post-split value.
        """
        hand0 = [0] * 10; hand0[p] = 1
        hand0 = tuple(hand0)
        extra = hand0
        probs = self.draw_probs(hand0, extra)
        vals = {}
        for r, pr in probs:
            h2 = list(hand0); h2[r] += 1
            h2 = tuple(h2)
            if p == 0:
                vals[r] = self.stand(h2, extra)
            else:
                v = self.best_hs(h2, extra)
                if das and double_allowed(h2, dbl_rule):
                    v = max(v, self.double(h2, extra))
                vals[r] = v
        e_hand = sum(pr * vals[r] for r, pr in probs)
        if p == 0 or not resplit:
            return 2 * e_hand
        q = dict(probs).get(p, 0.0)
        if q == 0:
            return 2 * e_hand
        e_np = sum(pr * vals[r] for r, pr in probs if r != p) / (1 - q)
        e_pp = vals[p]
        memo = {}

        def f(total, pending):
            if pending == 0:
                return 0.0
            k = (total, pending)
            if k in memo:
                return memo[k]
            if total < 4:
                v = q * f(total + 1, pending + 1)
            else:
                v = q * (e_pp + f(total, pending - 1))
            v += (1 - q) * (e_np + f(total, pending - 1))
            memo[k] = v
            return v

        return f(2, 2)


def double_allowed(hand, rule):
    if rule == "any":
        return True
    t, soft = hand_total(hand)
    if soft:
        return False
    return t in ((9, 10, 11) if rule == "9-11" else (10, 11))


RANK_OF = {"A": 0, "T": 9, "10": 9}
for i in range(2, 10):
    RANK_OF[str(i)] = i - 1


def cell_comps(section, row):
    """Two-card compositions for a grid row (rank-index pairs)."""
    if section == "pairs":
        r = RANK_OF[row.split(",")[0]]
        return [(r, r)]
    if section == "soft":
        x = int(row.split(",")[1])
        return [(0, x - 1)]
    t = int(row)
    comps = []
    for a in range(1, 10):
        for b in range(a + 1, 10):
            if (a + 1) + (b + 1) == t:
                comps.append((a, b))
    return comps


ROWS = {
    "pairs": ["A,A", "T,T", "9,9", "8,8", "7,7", "6,6", "5,5", "4,4", "3,3", "2,2"],
    "soft": ["A,9", "A,8", "A,7", "A,6", "A,5", "A,4", "A,3", "A,2"],
    "hard": ["17", "16", "15", "14", "13", "12", "11", "10", "9", "8"],
}
DEALERS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"]
SPLIT_VARIANTS = [(das, dbl) for das in (True, False) for dbl in ("any", "9-11", "10-11")]


def run_config(decks, h17):
    """Per cell: weights and unnormalized EVs per composition for each action."""
    res = {}
    for dname in DEALERS:
        up = RANK_OF[dname]
        S = Solver(decks, h17, up)
        base = S.base
        N = sum(base)
        for section, rows in ROWS.items():
            for row in rows:
                comps = cell_comps(section, row)
                entries = []
                for a, b in comps:
                    w = (base[a] * (base[a] - 1) if a == b else 2 * base[a] * base[b]) / (N * (N - 1))
                    hand = [0] * 10; hand[a] += 1; hand[b] += 1
                    hand = tuple(hand)
                    zero = (0,) * 10
                    pnb = S.dealer.pnb(S.remaining(hand))
                    ev = {
                        "S": S.stand(hand, zero),
                        "H": S.hit(hand, zero),
                        "D": S.double(hand, zero),
                    }
                    if a == b:
                        for das, dbl in SPLIT_VARIANTS:
                            ev[f"P|{das}|{dbl}|rs"] = S.split(a, das, dbl, True)
                            ev[f"P|{das}|{dbl}|nors"] = S.split(a, das, dbl, False)
                    entries.append({"comp": [a, b], "w": w, "pnb": pnb, "ev": ev})
                res[f"{section}:{row}v{dname}"] = entries
    return res


if __name__ == "__main__":
    decks = int(sys.argv[1]); h17 = sys.argv[2] == "h17"
    t0 = time.time()
    res = run_config(decks, h17)
    with open(sys.argv[3], "w") as f:
        json.dump(res, f)
    print(decks, sys.argv[2], "done in", round(time.time() - t0, 1), "s")
