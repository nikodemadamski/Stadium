"""Build the crowd people baked into Seat View (js/data/humans.js) from MakeHuman's CC0 assets.

    python -m venv bl && bl/bin/pip install bpy numpy scikit-image      # Blender as a Python module
    git clone --depth 1 https://github.com/makehumancommunity/makehuman  # assets: CC0 (LICENSE.ASSETS.md)
    bl/bin/python tools/humans/build_humans.py makehuman/makehuman/data [preview_dir]

Pipeline: base mesh + macro targets (sex, build) -> rest pose (standing, arms down) with the default skeleton and its
skin weights (linear-blend skinning in numpy) -> clothes as coloured, slightly inflated regions -> hair grown as a voxel
shell around the head -> reduced to 3 levels of detail with Blender's Decimate, carrying weights for an 11-bone skeleton
the app animates (sit/stand, clap, dance, phones, waves) -> quantised, gzipped, base64.
Every person is 1 unit tall (stature), feet at y = 0, hips at x = z = 0, facing +z (the app scales by real height)."""
import base64, gzip, json, math, os, struct, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mh

SKIN, TOP, LEGS, HAIR, SHOES, PHONE = 0, 1, 2, 3, 4, 5
HEAD_BONES = ("head", "jaw", "eye", "neck", "oris", "levator", "temporalis", "oculi", "orbicularis", "risorius", "special", "tongue")

# Looks: sex, build targets, clothes, hair. Two per sex; colours are chosen per person in the app.
LOOKS = [
    dict(id="m0", sex="male", mix={"caucasian-male-young": 0.8, "african-male-young": 0.1, "asian-male-young": 0.1}, sleeves="short", top=0.10, hair="short"),
    dict(id="m1", sex="male", mix={"caucasian-male-young": 0.7, "asian-male-young": 0.3, "universal-male-young-averagemuscle-maxweight": 0.45}, sleeves="long", top=0.22, hair="crop"),
    dict(id="f0", sex="female", mix={"caucasian-female-young": 0.8, "african-female-young": 0.2}, sleeves="short", top=0.08, hair="long"),
    dict(id="f1", sex="female", mix={"caucasian-female-young": 0.7, "asian-female-young": 0.3, "universal-female-young-averagemuscle-minweight": 0.3}, sleeves="long", top=0.14, hair="bob"),
]
# One rest pose (standing, arms down); sitting, phones, clapping, dancing and waves are animated in the app's shader
# with an 11-bone skeleton whose weights and joint positions are exported here.
BONES = ["root", "spine", "head", "uarm.L", "farm.L", "uarm.R", "farm.R", "thigh.L", "shin.L", "thigh.R", "shin.R"]
JOINTS = {"hip.L": ("upperleg01.L", "h"), "knee.L": ("lowerleg01.L", "h"), "ankle.L": ("foot.L", "h"), "sh.L": ("upperarm01.L", "h"), "el.L": ("lowerarm01.L", "h"), "wr.L": ("wrist.L", "h"),
          "hip.R": ("upperleg01.R", "h"), "knee.R": ("lowerleg01.R", "h"), "ankle.R": ("foot.R", "h"), "sh.R": ("upperarm01.R", "h"), "el.R": ("lowerarm01.R", "h"), "wr.R": ("wrist.R", "h"),
          "waist": ("spine03", "h"), "neck": ("neck01", "h")}
LOD_TRIS = [(2600, 700), (800, 220), (260, 70)]  # (body, hair) triangle budgets per level of detail


def unit(v): v = np.asarray(v, float); return v / np.linalg.norm(v)


def from_to(a, b):
    a, b = unit(a), unit(b); v = np.cross(a, b); c = float(np.dot(a, b)); s = np.linalg.norm(v)
    if s < 1e-9: return np.eye(3)
    return mh.rot(v, math.degrees(math.atan2(s, c)))


def aim_pose(sk, aims):
    """aims: bone -> desired world direction (head->tail), or ("curl", degrees) to bend a finger joint across the palm.
    Bones are processed parent-first; children inherit."""
    G = {}
    for b in sk.order:
        P = G[sk.parent[b]] if sk.parent[b] else np.eye(4)
        if b in aims:
            h = P[:3, :3] @ sk.head[b] + P[:3, 3]
            if isinstance(aims[b], tuple) and aims[b][0] == "curl":
                Wr = G["wrist" + b[-2:]]; k = lambda n: Wr[:3, :3] @ sk.head[n + b[-2:]] + Wr[:3, 3]
                R = mh.rot(k("finger5-1") - k("finger2-1"), aims[b][1] * (1 if b.endswith(".L") else -1))
            else:
                R = from_to(P[:3, :3] @ (sk.tail[b] - sk.head[b]), aims[b])
            W = np.eye(4); W[:3, :3] = R; W[:3, 3] = h - R @ h; P = W @ P
        G[b] = P
    return G


def pose_aims(name, side=1):
    """World directions (x = character's left, y = up, z = forward)."""
    a = {}
    for s, L in ((1, ".L"), (-1, ".R")):
        a["upperarm01" + L] = (0.13 * s, -1, 0.03); a["lowerarm01" + L] = (0.05 * s, -1, 0.3)
        a["upperleg01" + L] = (0.03 * s, -1, 0.02); a["lowerleg01" + L] = (0.0, -1, -0.03)
        if name.startswith("sit"):
            a["upperleg01" + L] = (0.1 * s, -0.08, 1); a["lowerleg01" + L] = (0.02 * s, -1, 0.1)
            a["upperarm01" + L] = (0.12 * s, -1, 0.35); a["lowerarm01" + L] = (-0.25 * s, -0.6, 1)
        for f in range(2, 6):  # relaxed hands: fingers gently curled
            for j in range(1, 4): a["finger%d-%d%s" % (f, j, L)] = ("curl", 22)
    if name.endswith("phone"):  # right hand holds a phone ~35 cm in front of the eyes, filming the stage
        a["upperarm01.R"] = (0.2, -0.1, 1); a["lowerarm01.R"] = (0.63, 1.87, 1.03)
        for f in range(2, 6):
            for j in range(1, 4): a["finger%d-%d.R" % (f, j)] = ("curl", 45)
    return a


def vertex_normals(V, T):
    n = np.zeros_like(V); fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    for k in range(3): np.add.at(n, T[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def tris(F):
    out = []
    for f in F:
        for k in range(1, len(f) - 1): out.append([f[0], f[k], f[k + 1]])
    return np.array(out)


def smooth(V, T, mask, it=6, lam=0.5, mu=-0.53):
    """Taubin smoothing of the masked vertices (removes anatomy under clothes without shrinking them)."""
    E = np.r_[T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]; E = np.r_[E, E[:, ::-1]]
    deg = np.bincount(E[:, 0], minlength=len(V)).astype(float)[:, None]
    for k in range(it * 2):
        acc = np.zeros_like(V); np.add.at(acc, E[:, 0], V[E[:, 1]])
        V = np.where(mask[:, None], V + (lam if k % 2 == 0 else mu) * (acc / np.maximum(deg, 1) - V), V)
    return V


def smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0) / k; return np.minimum(a, b) - h * h * k / 4


def smax(a, b, k): return -smin(-a, -b, k)


def label_parts(sk, W, V, look):
    """Clothes from the REST pose with clean cut lines: crew neckline, sleeve rings measured along the arm bones,
    waistband plane, shoe line above the ankle."""
    dom = np.array(sk.order)[W.argmax(1)]; H = sk.head; long = look["sleeves"] == "long"
    hipY, ankY, neckY = H["upperleg01.L"][1], H["foot.L"][1], H["neck01"][1]
    part = np.full(len(V), TOP)
    for i, (b, v) in enumerate(zip(dom, V)):
        sd = b[-2:]
        if b.startswith(("wrist", "finger", "metacarpal")): part[i] = SKIN
        elif b.startswith("upperarm"):
            a, e = H["upperarm01" + sd], H["lowerarm01" + sd]; t = np.dot(v - a, e - a) / np.dot(e - a, e - a)
            part[i] = TOP if long or t < 0.42 else SKIN
        elif b.startswith("lowerarm"):
            e, w = H["lowerarm01" + sd], H["wrist" + sd]; t = np.dot(v - e, w - e) / np.dot(w - e, w - e)
            part[i] = TOP if long and t < 0.93 else SKIN
        elif b.startswith(("upperleg", "lowerleg", "foot", "toe")): part[i] = SHOES if v[1] < ankY + 0.3 else LEGS
        elif b.startswith(HEAD_BONES) or b.startswith(("spine", "clavicle", "shoulder", "breast", "pelvis", "root")):
            neckline = neckY + 0.1 - 0.45 * np.clip(v[2] / 0.8, 0, 1)  # crew neck: lower at the front
            if b.startswith(("head", "jaw", "eye", "oris", "levator", "temporalis", "oculi", "orbicularis", "risorius", "special", "tongue")) or v[1] > neckline: part[i] = SKIN
            elif v[1] < hipY + 0.35: part[i] = LEGS  # waistband ~3.5 cm above the hip joints
    return part


def tidy_labels(part, T, keep=(SKIN, TOP, LEGS), it=3):
    """Majority filter along the mesh so clothing edges (neckline, sleeves, waist) are clean lines, not zig-zags."""
    E = np.r_[T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]; E = np.r_[E, E[:, ::-1]]
    for _ in range(it):
        votes = np.zeros((len(part), 6)); np.add.at(votes, (E[:, 0], part[E[:, 1]]), 1); votes[np.arange(len(part)), part] += 1.5
        new = votes.argmax(1); ok = np.isin(part, keep) & np.isin(new, keep); part = np.where(ok, new, part)
    return part


def reduce_bone(name):
    sd = name[-2:] if name.endswith((".L", ".R")) else ""
    if name.startswith("upperarm"): return "uarm" + sd
    if name.startswith(("lowerarm", "wrist", "finger", "metacarpal")): return "farm" + sd
    if name.startswith("upperleg"): return "thigh" + sd
    if name.startswith(("lowerleg", "foot", "toe")): return "shin" + sd
    if name.startswith(HEAD_BONES): return "head"
    if name.startswith(("root", "pelvis", "spine05", "spine04")): return "root"
    return "spine"  # spine03-01, clavicles, shoulders, breasts


def reduced_weights(sk, W):
    R = np.zeros((len(sk.order), len(BONES)))
    for i, b in enumerate(sk.order): R[i, BONES.index(reduce_bone(b))] = 1
    return W @ R


def build_body(D, look, pose, base):
    V0, F = base
    V = mh.apply_targets(V0, D, look["mix"]); sk = mh.Skeleton(D, V)
    body = tris(F["body"]); eyes = tris(F["helper-l-eye"] + F["helper-r-eye"])
    W = sk.skin_matrix(len(V)); hi = sk.order.index("head")
    eye_v = np.unique(eyes); W[eye_v] = 0; W[eye_v, hi] = 1
    part = tidy_labels(label_parts(sk, W, V, look), body); part[eye_v] = SHOES  # eyes: dark
    G = aim_pose(sk, pose_aims(pose)); P = sk.deform(V, W, G); Wr = reduced_weights(sk, W)
    used = np.unique(np.r_[body.ravel(), eyes.ravel()])
    P = smooth(P, body, part == TOP, it=40); P = smooth(P, body, part == LEGS, it=4); P = smooth(P, body, part == SHOES, it=14)
    n = vertex_normals(P, body)  # after smoothing, so the offset doesn't put the smoothed-away detail back
    P = P + n * np.select([part == TOP, part == LEGS, part == SHOES], [look["top"], 0.11, 0.14], 0)[:, None]
    return dict(V=P, body=body, eyes=eyes, part=part, sk=sk, G=G, used=used, W=Wr)


HAIR_STYLES = {  # thickness (dm), hairline elevation (rad) at front / side / back, lowest y below head centre (dm), curtain
    "short": dict(t=0.10, front=0.42, side=-0.05, back=-0.62, low=9, curtain=None),
    "crop": dict(t=0.06, front=0.50, side=0.02, back=-0.55, low=9, curtain=None),
    "long": dict(t=0.15, front=0.40, side=-0.75, back=-1.0, low=1.9, curtain=dict(end=-3.4, w=0.8, wb=0.3, front=0.0, thick=0.22, hang=None)),
    "bob": dict(t=0.18, front=0.36, side=-0.85, back=-1.2, low=1.25, curtain=dict(end=-1.3, rx=0.93, rz=1.08, dz=-0.1, front=0.38, oval=True)),
}


def grow_hair(b, style):
    """Hair as a voxel solid around the posed head: a shell of thickness t over the scalp, above a hairline that runs
    across the forehead, over the ears and down to the nape, plus (long styles) a curtain hanging behind the head and
    resting on the back. Only the part outside the body is kept; marching cubes turns it into a mesh."""
    from mathutils.bvhtree import BVHTree
    from mathutils import Vector
    from skimage.measure import marching_cubes
    H = HAIR_STYLES[style]; sk, G, V = b["sk"], b["G"], b["V"]
    def wpos(bone, which): p = (sk.head if which == "h" else sk.tail)[bone]; return G[bone][:3, :3] @ p + G[bone][:3, 3]
    h0, h1 = wpos("head", "h"), wpos("head", "t"); c = h0 + 0.42 * (h1 - h0)
    T = b["body"]; bvh = BVHTree.FromPolygons([Vector(v) for v in V], [tuple(t) for t in T])
    step = 0.05; lo = c + [-1.25, H["curtain"]["end"] - 0.3 if H["curtain"] else -1.6, -1.35]; hi = c + [1.25, 1.2, 1.3]
    xs, ys, zs = [np.arange(lo[k], hi[k], step) for k in range(3)]
    X, Y, Z = np.meshgrid(xs, ys, zs, indexing="ij"); Pts = np.stack([X, Y, Z], -1).reshape(-1, 3)
    d = np.empty(len(Pts))
    for i, p in enumerate(Pts):
        co, n, _, dist = bvh.find_nearest(Vector(p), 3.0)
        d[i] = 3.0 if co is None else dist * (1 if np.dot(p - np.array(co), np.array(n)) >= 0 else -1)
    rel = Pts - c; az = np.arctan2(rel[:, 0], rel[:, 2]); el = np.arctan2(rel[:, 1], np.hypot(rel[:, 0], rel[:, 2])); r = np.linalg.norm(rel, axis=1)
    f = (1 + np.cos(az)) / 2  # 1 front, 0.5 side, 0 back
    hl = np.where(f > 0.5, H["side"] + (H["front"] - H["side"]) * np.clip((f - 0.5) * 2, 0, 1) ** 1.2, H["back"] + (H["side"] - H["back"]) * (f * 2) ** 0.8)
    line = (hl - el) * np.maximum(r, 0.3)
    cap = np.maximum(d - H["t"] * (1 + 0.6 * np.clip(rel[:, 1] / 0.9, 0, 1)), line)  # a little more volume on top
    cap = np.maximum(cap, -rel[:, 1] - H["low"])
    hair = cap
    if H["curtain"]:
        C = H["curtain"]
        if C.get("oval"):  # bob: an oval around the head axis, tucked in a little at the ends
            tuck = 1 - 0.22 * np.clip(-rel[:, 1] / -C["end"], 0, 1) ** 2
            cur = (np.sqrt((rel[:, 0] / (C["rx"] * tuck)) ** 2 + ((rel[:, 2] - C["dz"]) / (C["rz"] * tuck)) ** 2) - 1) * C["rx"]
            for term, k in ((rel[:, 2] - C["front"], 0.2), (C["end"] - rel[:, 1], 0.4), (rel[:, 1] - 0.3, 0.2)):
                cur = smax(cur, term, k)
            hair = smin(hair, cur, 0.12)
        else:
            hair = smin(hair, straight_curtain(C, bvh, c, Pts, rel, d, Vector), 0.12)
    hair = np.maximum(hair, -d + 0.005)  # never inside the body
    return hair_mesh(hair, X.shape, lo, step, bvh, c, Vector)


def straight_curtain(C, bvh, c, Pts, rel, d, Vector):
    """Long hair below the skull: falls in a straight line from the back of the head to the upper back, filling the
    hollow behind the neck; soft intersections keep every edge rounded."""
    def back_z(y):
        hit = bvh.ray_cast(Vector((c[0], y, c[2] - 4)), Vector((0, 0, 1)), 8); return hit[0][2] if hit[0] is not None else c[2] - 0.9
    y0, y1 = c[1] - 0.2, c[1] + C["end"]; z0 = back_z(y0); z1 = z0 + C["hang"] if C["hang"] is not None else back_z(y1)
    zl = z0 + (z1 - z0) * np.clip((Pts[:, 1] - y0) / (y1 - y0), 0, 1)
    w = C["w"] + C["wb"] * np.clip(-rel[:, 1] / 2.5, 0, 1)
    cur = (zl - C["thick"] * (1 - 0.6 * np.clip(rel[:, 0] / w, -1, 1) ** 2)) - Pts[:, 2]  # fuller in the middle: rounded
    for term in (Pts[:, 2] - (c[2] + C["front"]), np.abs(rel[:, 0]) - w, (C["end"] * (1 - 0.12 * np.clip(rel[:, 0] / w, -1, 1) ** 2)) - rel[:, 1], rel[:, 1] - 0.3):
        cur = smax(cur, term, 0.3)
    # plus a layer lying on the upper back across the full width (hair resting on the shirt), so it doesn't pinch in
    lay = d - C["thick"] * 0.8
    for term in (rel[:, 2] - (C["front"] - 0.5), np.abs(rel[:, 0]) - w * 0.92, (C["end"] * (1 - 0.12 * np.clip(rel[:, 0] / w, -1, 1) ** 2)) - rel[:, 1], rel[:, 1] + 1.2):
        lay = smax(lay, term, 0.3)
    return smin(cur, lay, 0.15)


def hair_mesh(hair, shape, lo, step, bvh, c, Vector):
    from skimage.measure import marching_cubes
    vol = hair.reshape(shape)
    vs, fs, _, _ = marching_cubes(vol, 0.0, spacing=(step, step, step))
    vs = vs + lo
    fn = np.cross(vs[fs[:, 1]] - vs[fs[:, 0]], vs[fs[:, 2]] - vs[fs[:, 0]])
    if (fn * (vs[fs].mean(1) - c)).sum() < 0: fs = fs[:, ::-1]; fn = -fn  # outward-facing
    # drop the inner surface lying on the scalp (faces close to the body and facing into it: never visible)
    inner = np.zeros(len(fs), bool)
    for i, ctr in enumerate(vs[fs].mean(1)):
        co, n, _, dist = bvh.find_nearest(Vector(ctr), 0.06)
        if co is not None and np.dot(fn[i], n) < -0.3 * np.linalg.norm(fn[i]): inner[i] = True
    fs = fs[~inner]
    u, inv = np.unique(fs.ravel(), return_inverse=True)
    return vs[u], inv.reshape(-1, 3)


def wpos(b, bone, which="h"):
    p = (b["sk"].head if which == "h" else b["sk"].tail)[bone]; return b["G"][bone][:3, :3] @ p + b["G"][bone][:3, 3]


def phone_box(b):
    """iPhone-sized box (71.9 x 150 x 8.75 mm) in the right hand of the rest pose: lying along the hanging forearm,
    screen (+z face) forward. When the app raises the forearm to film, the phone stands up with the screen to the eyes."""
    hand = wpos(b, "wrist.R", "t"); fdir = unit(hand - wpos(b, "lowerarm01.R"))
    nrm = unit(np.array([0, 0, 1.0]) - fdir * fdir[2]); rt = np.cross(fdir, nrm); ctr = hand + fdir * 0.45 + nrm * 0.12
    w, h, t = 0.719 / 2, 1.5 / 2, 0.0875 / 2
    corners = np.array([[sx, sy, sz] for sx in (-w, w) for sy in (-h, h) for sz in (-t, t)])
    V = ctr + corners[:, 0:1] * rt + corners[:, 1:2] * fdir + corners[:, 2:3] * nrm
    F = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
    return V[np.ravel(F)], tris(np.arange(24).reshape(6, 4))  # separate corners per face: flat normals (lit screen)


def decimate(V, T, part, extra, target):
    """Blender Decimate (collapse). Parts (one-hot) and bone weights travel as colour attributes, which the collapse
    interpolates; argmax picks the part back, the two strongest bones are kept."""
    import bpy
    me = bpy.data.meshes.new("d"); me.from_pydata([tuple(v) for v in V], [], [tuple(t) for t in T]); me.update()
    A = np.zeros((len(V), 6), np.float32); A[np.arange(len(V)), part] = 1; A = np.c_[A, extra].astype(np.float32)
    A = np.c_[A, np.zeros((len(V), -A.shape[1] % 4), np.float32)]; nk = A.shape[1] // 4
    for k in range(nk):
        a = me.color_attributes.new("a%d" % k, "FLOAT_COLOR", "POINT"); a.data.foreach_set("color", A[:, 4 * k:4 * k + 4].ravel())
    ob = bpy.data.objects.new("d", me); bpy.context.scene.collection.objects.link(ob)
    if target < len(T):
        m = ob.modifiers.new("dec", "DECIMATE"); m.ratio = target / len(T); m.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier="dec")
    me = ob.data; me.calc_loop_triangles()
    nv = len(me.vertices); P = np.zeros(nv * 3); me.vertices.foreach_get("co", P)
    TT = np.zeros(len(me.loop_triangles) * 3, int); me.loop_triangles.foreach_get("vertices", TT)
    cols = []
    for k in range(nk):
        a = np.zeros(nv * 4, np.float32); me.color_attributes["a%d" % k].data.foreach_get("color", a); cols.append(a.reshape(-1, 4))
    C = np.concatenate(cols, 1); bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    return P.reshape(-1, 3), TT.reshape(-1, 3), C[:, :6].argmax(1), C[:, 6:6 + extra.shape[1]]


def onehot_bone(n, name): w = np.zeros((n, len(BONES))); w[:, BONES.index(name)] = 1; return w


def assemble(b, hair):
    used = b["used"]; remap = -np.ones(len(b["V"]), int); remap[used] = np.arange(len(used))
    body = (b["V"][used], remap[np.r_[b["body"], b["eyes"]]], b["part"][used], b["W"][used])
    pv, pt = phone_box(b)
    return body, (hair[0], hair[1], np.full(len(hair[0]), HAIR), onehot_bone(len(hair[0]), "head")), (pv, pt, np.full(len(pv), PHONE), onehot_bone(len(pv), "farm.R"))


def top2(W):
    o = np.argsort(-W, 1)[:, :2]; w = np.take_along_axis(W, o, 1); s = np.maximum(w.sum(1), 1e-9)
    return o[:, 0], o[:, 1], w[:, 0] / s


def build_all(D, preview_dir=None):
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    base = mh.load_obj(os.path.join(D, "3dobjs", "base.obj")); meshes = []; grid = []; looks = {}
    for look in LOOKS:
        b = build_body(D, look, "stand", base)
        S = b["V"][b["used"]][:, 1].max() - b["V"][b["used"]][:, 1].min()  # stature (dm)
        root = b["sk"].head["root"]; floor = b["V"][b["used"]][:, 1].min(); org = np.array([root[0], floor, root[2]])
        hair = grow_hair(b, look["hair"]); body, hp, phone = assemble(b, hair)
        looks[look["id"]] = {k: [round(float(x), 5) for x in (wpos(b, *v) - org) / S] for k, v in JOINTS.items()}
        print(look["id"], "stature %.2f dm, hair %d tris" % (S, len(hair[1])), flush=True)
        for lod, (nb, nh) in enumerate(LOD_TRIS):
            parts = [decimate(*body, nb), decimate(*hp, nh), phone]
            V, T, P, Wt, n0 = [], [], [], [], 0
            for pv, pt, pp, pw in parts: V.append(pv); T.append(pt + n0); P.append(pp); Wt.append(pw); n0 += len(pv)
            V = np.concatenate(V); T = np.concatenate(T); P = np.concatenate(P); b0, b1, w0 = top2(np.concatenate(Wt))
            if lod == 0: grid.append([(V, T, P)])
            meshes.append(dict(key="%s-%d" % (look["id"], lod), V=(V - org) / S, T=T, P=P, B0=b0, B1=b1, W0=w0))
    if preview_dir:
        preview_grid([[r[0] for r in grid]], os.path.join(preview_dir, "people.png"), views=(("back", (0, 9, 0)), ("front", (0, -9, 0))))
    return meshes, looks


def pack(meshes, looks, out):
    """Binary: uint32 header length, JSON header (meshes + joints per look), then per mesh: uint16 xyz (quantised to its
    box), uint8 part, uint8 bone0, uint8 bone1, uint8 weight0 (x255), padding to 2 bytes, uint16 indices."""
    head, blobs, off = [], [], 0
    for m in meshes:
        lo, hi = m["V"].min(0), m["V"].max(0); q = np.round((m["V"] - lo) / np.maximum(hi - lo, 1e-9) * 65535).astype("<u2")
        b = q.tobytes() + m["P"].astype("u1").tobytes() + m["B0"].astype("u1").tobytes() + m["B1"].astype("u1").tobytes() + np.round(m["W0"] * 255).astype("u1").tobytes()
        b += b"\0" * (-len(b) % 2); b += m["T"].astype("<u2").tobytes()
        head.append(dict(key=m["key"], nv=len(m["V"]), nt=len(m["T"]), lo=[round(float(x), 6) for x in lo], hi=[round(float(x), 6) for x in hi], off=off)); blobs.append(b); off += len(b)
    hj = json.dumps(dict(v=2, bones=BONES, looks=looks, meshes=head), separators=(",", ":")).encode(); hj += b" " * (-len(hj) % 4)
    raw = struct.pack("<I", len(hj)) + hj + b"".join(blobs); gz = gzip.compress(raw, 9, mtime=0)
    js = ("/* Crowd people built by tools/humans/build_humans.py from MakeHuman assets (CC0 1.0, makehumancommunity/makehuman).\n"
          " * %d meshes (4 looks x 3 levels of detail) with an 11-bone skeleton for animation, gzip + base64. Decoded once by js/people.js. */\n"
          "window.HUMANS_GZ = \"%s\";\n") % (len(meshes), base64.b64encode(gz).decode())
    open(out, "w").write(js)
    print("wrote %s: %d KB raw, %d KB gzip, %d KB js" % (out, len(raw) // 1024, len(gz) // 1024, len(js) // 1024))


def preview_grid(items, out, views=(("side", (9, 0.0, 1.0)), ("back", (0.0, 9, 1.4)), ("front", (0.0, -9, 1.2)))):
    """items: rows of [(V (dm), T, part)], rendered in a grid from several sides."""
    import preview
    preview.reset()
    for r, row in enumerate(items):
        for c, (V, T, part) in enumerate(row):
            ob = preview.add_mesh("m%d_%d" % (r, c), V * 0.1, T, np.array([PAL[p] for p in part]), loc=(0, 0, 0))
            ob.location = ((c - (len(row) - 1) / 2) * 0.9, 0, (len(items) - 1 - r) * 2.0)
    w = max(len(r) for r in items) * 0.9; h = len(items) * 2.0
    for name, cam in views:
        preview.render_ortho(out.replace(".png", "_%s.png" % name), (cam[0], cam[1], h / 2), (0, 0, h / 2), max(w * 1.5, h) * 1.02)


if __name__ == "__main__" and len(sys.argv) > 1:
    D = sys.argv[1]; prev = sys.argv[2] if len(sys.argv) > 2 else None
    ms, looks = build_all(D, prev)
    for m in ms: print(m["key"], len(m["T"]), "tris")
    pack(ms, looks, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "js", "data", "humans.js"))
