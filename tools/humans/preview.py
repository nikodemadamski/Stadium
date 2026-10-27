"""Render quick previews of posed meshes with Blender (bpy). Used while building the crowd people."""
import bpy, numpy as np, math

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene; sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "VERTEX"
    sc.render.resolution_x, sc.render.resolution_y = 1200, 800; sc.world = bpy.data.worlds.new("w"); sc.world.color = (0.08, 0.08, 0.1)
    return sc

def add_mesh(name, V, F, cols=None, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in V], [], [tuple(f) for f in F]); me.update()
    if cols is not None:
        a = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        a.data.foreach_set("color", np.c_[cols, np.ones(len(cols))].astype(np.float32).ravel())
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); ob.location = loc; ob.rotation_euler = (math.pi / 2, 0, 0)  # y-up -> z-up
    bpy.context.scene.collection.objects.link(ob); return ob

def render(path, cam_loc, target=(0, 0, 0.9), lens=50):
    sc = bpy.context.scene; cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = lens; cam.location = cam_loc
    d = np.subtract(target, cam_loc); cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
    sc.render.filepath = path; bpy.ops.render.render(write_still=True); bpy.data.objects.remove(cam)

def render_ortho(path, cam_loc, target, scale):
    sc = bpy.context.scene; cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = scale; cam.location = cam_loc
    d = np.subtract(target, cam_loc); cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
    sc.render.filepath = path; bpy.ops.render.render(write_still=True); bpy.data.objects.remove(cam)
