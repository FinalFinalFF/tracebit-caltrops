"""
Tracebit Caltrop — Blender Python script
Run in Blender's Scripting workspace (or via Text > Run Script).

Creates a 3D caltrop logo mark matching the Three.js visualizer defaults:
  - 3 flat rectangular arms along X, Y, Z axes, each ±1.0 from center
  - Arm width (thickness): 0.1
  - Center sphere radius: 0.1
"""

import bpy

# --- Parameters (match Three.js defaults) ---
ARM_HALF   = 1.0    # arm extends ±this from center
THICKNESS  = 0.1    # arm cross-section "wide" dimension
SLAB       = 0.018  # arm cross-section "thin" dimension (flat panel depth)
SPHERE_R   = 0.1    # center sphere radius

# Clear the scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# Blender's primitive_cube_add creates a cube with vertices at ±1,
# so we scale by half-extents.

# X arm — long along X
bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))
x_arm = bpy.context.active_object
x_arm.name = "Arm_X"
x_arm.scale = (ARM_HALF, THICKNESS / 2, SLAB / 2)
bpy.ops.object.transform_apply(scale=True)

# Y arm — long along Y
bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))
y_arm = bpy.context.active_object
y_arm.name = "Arm_Y"
y_arm.scale = (SLAB / 2, ARM_HALF, THICKNESS / 2)
bpy.ops.object.transform_apply(scale=True)

# Z arm — long along Z
bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))
z_arm = bpy.context.active_object
z_arm.name = "Arm_Z"
z_arm.scale = (THICKNESS / 2, SLAB / 2, ARM_HALF)
bpy.ops.object.transform_apply(scale=True)

# Center sphere
bpy.ops.mesh.primitive_uv_sphere_add(
    radius=SPHERE_R, segments=32, ring_count=16, location=(0, 0, 0)
)
center = bpy.context.active_object
center.name = "Center_Sphere"

# White material
mat = bpy.data.materials.new(name="Caltrop_White")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
bsdf.inputs["Roughness"].default_value = 0.25

for obj in [x_arm, y_arm, z_arm, center]:
    obj.data.materials.clear()
    obj.data.materials.append(mat)

# Join into a single mesh object
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = x_arm
bpy.ops.object.join()
bpy.context.active_object.name = "Caltrop"

print("Caltrop created successfully!")
