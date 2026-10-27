"""Load MakeHuman CC0 assets (base mesh, macro targets, default skeleton + weights) and pose them with numpy.
Assets: github.com/makehumancommunity/makehuman, makehuman/data (LICENSE.ASSETS.md: CC0 1.0)."""
import json, os, numpy as np

def load_obj(path):
    V, faces, group = [], {}, None
    for line in open(path):
        if line.startswith("v "): V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("g "): group = line.split()[1]
        elif line.startswith("f "): faces.setdefault(group, []).append([int(t.split("/")[0]) - 1 for t in line.split()[1:]])
    return np.array(V), faces

def load_target(path):
    d = np.loadtxt(path, comments="#", ndmin=2)
    if not d.size: return np.zeros(0, int), np.zeros((0, 3))
    return d[:, 0].astype(int), d[:, 1:4]

def apply_targets(V, data, mix):
    V = V.copy()
    for name, w in mix.items():
        if w:
            idx, dv = load_target(os.path.join(data, "targets", "macrodetails", name + ".target")); V[idx] += w * dv
    return V

class Skeleton:
    def __init__(self, data, V):
        s = json.load(open(os.path.join(data, "rigs", "default.mhskel")))
        jpos = {k: V[v].mean(0) for k, v in s["joints"].items()}
        self.bones = s["bones"]; self.head = {}; self.tail = {}
        for b, d in self.bones.items(): self.head[b] = jpos[d["head"]]; self.tail[b] = jpos[d["tail"]]
        self.parent = {b: d["parent"] for b, d in self.bones.items()}
        order, seen = [], set()
        def visit(b):
            if b in seen: return
            if self.parent[b]: visit(self.parent[b])
            seen.add(b); order.append(b)
        for b in self.bones: visit(b)
        self.order = order
        w = json.load(open(os.path.join(data, "rigs", "default_weights.mhw")))["weights"]
        self.weights = w

    def skin_matrix(self, n):
        """Dense (n_verts x n_bones) normalised weight matrix; unweighted vertices follow 'root'."""
        names = self.order; ix = {b: i for i, b in enumerate(names)}; W = np.zeros((n, len(names)))
        for b, lst in self.weights.items():
            if b in ix:
                for v, w in lst:
                    if v < n: W[v, ix[b]] += w
        s = W.sum(1); W[s == 0, ix["root"]] = 1; s[s == 0] = 1
        return W / s[:, None]

    def pose(self, rots):
        """rots: bone -> 3x3 rotation in the REST world frame about the bone head. Returns bone -> 4x4 world transform."""
        G = {}
        for b in self.order:
            R = rots.get(b, np.eye(3)); h = self.head[b]
            L = np.eye(4); L[:3, :3] = R; L[:3, 3] = h - R @ h
            G[b] = (G[self.parent[b]] @ L) if self.parent[b] else L
        return G

    def deform(self, V, W, G):
        out = np.zeros_like(V); Vh = np.c_[V, np.ones(len(V))]
        for i, b in enumerate(self.order):
            m = W[:, i] > 0
            if m.any(): out[m] += W[m, i:i + 1] * (Vh[m] @ G[b].T)[:, :3]
        return out

def rot(axis, deg):
    a = np.asarray(axis, float); a /= np.linalg.norm(a); t = np.radians(deg); K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + np.sin(t) * K + (1 - np.cos(t)) * K @ K
