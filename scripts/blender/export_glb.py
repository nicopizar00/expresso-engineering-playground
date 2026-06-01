"""
Headless Blender → GLB exporter for the mini-commerce visualizer.

Designed to run inside `blender --background --python` with arguments
passed after the `--` separator (Blender's convention for forwarding
argv to the user script).

Typical invocation (see scripts/blender/export.sh for the wrapper):

    blender --background \
      --python scripts/blender/export_glb.py \
      -- \
      --input  /tmp/espresso_cup_renders/espresso_cup_v1.blend \
      --output apps/visualizer-3d/public/models/espresso_cup_v1.glb

Pipeline steps:
  1. Parse `--input` / `--output` and validate filesystem access.
  2. Open the .blend file.
  3. Prepare the scene:
       - clear non-mesh parents (preserving world transform),
       - apply Location / Rotation / Scale to every mesh,
       - evaluate and apply non-armature modifiers (Mirror, Subsurf, …).
  4. Validate materials use a Principled BSDF graph so they round-trip
     cleanly to Three.js MeshStandardMaterial.
  5. Export GLB with Three.js-friendly settings (Y-up, no cameras/lights).

Exit codes:
  0 = success
  1 = export / runtime failure
  2 = bad arguments or missing input
"""

from __future__ import annotations

import argparse
import os
import sys
import traceback

# ---------------------------------------------------------------------------
# argv parsing
#
# Blender forwards everything after `--` to the script untouched. When the
# script is launched without `--` (e.g. for `--help` introspection) we
# fall back to an empty list so argparse can print usage instead of choking
# on Blender's own flags.
# ---------------------------------------------------------------------------

def _user_argv() -> list[str]:
    if "--" not in sys.argv:
        return []
    sep = sys.argv.index("--")
    return sys.argv[sep + 1 :]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="export_glb.py",
        description="Convert a .blend file into a Three.js-friendly GLB.",
    )
    parser.add_argument("--input", required=True, help="Path to the source .blend file.")
    parser.add_argument("--output", required=True, help="Path to the destination .glb file.")
    return parser.parse_args(argv)


def log(phase: str, message: str = "") -> None:
    """Single-line phase markers so the shell wrapper can grep progress."""
    if message:
        print(f"PHASE {phase} :: {message}", flush=True)
    else:
        print(f"PHASE {phase}", flush=True)


# ---------------------------------------------------------------------------
# Scene preparation
# ---------------------------------------------------------------------------

def prepare_scene(bpy) -> int:
    """Apply transforms + modifiers on all mesh objects. Returns the count."""
    log("prepare", "selecting meshes")
    bpy.ops.object.select_all(action="DESELECT")

    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("no mesh objects found in the .blend file")

    for mesh in meshes:
        bpy.context.view_layer.objects.active = mesh
        mesh.select_set(True)

        # Clear non-mesh parents but preserve world transform so the cup
        # doesn't snap back to the origin after parent_clear.
        if mesh.parent is not None and mesh.parent.type != "MESH":
            try:
                bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
            except RuntimeError as err:
                print(f"WARN parent_clear skipped on {mesh.name}: {err}", flush=True)

    # All meshes selected → one apply pass.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    log("prepare", f"applied transforms on {len(meshes)} mesh(es)")

    applied_mods = 0
    for mesh in meshes:
        bpy.context.view_layer.objects.active = mesh
        bpy.ops.object.select_all(action="DESELECT")
        mesh.select_set(True)

        # iterate over a snapshot — modifier_apply mutates the collection.
        for mod in list(mesh.modifiers):
            if mod.type == "ARMATURE":
                # Skip armatures so animations survive the export.
                continue
            try:
                bpy.ops.object.modifier_apply(modifier=mod.name)
                applied_mods += 1
            except RuntimeError as err:
                print(f"WARN modifier_apply skipped {mod.type}/{mod.name} on {mesh.name}: {err}", flush=True)

    log("prepare", f"applied {applied_mods} modifier(s)")
    return len(meshes)


# ---------------------------------------------------------------------------
# Material validation
# ---------------------------------------------------------------------------

def _build_principled_graph(bpy, material) -> None:
    """Rebuild a minimal Principled BSDF graph that preserves diffuse color."""
    base_color = (0.8, 0.8, 0.8, 1.0)
    try:
        if hasattr(material, "diffuse_color"):
            dc = material.diffuse_color
            base_color = (dc[0], dc[1], dc[2], dc[3] if len(dc) > 3 else 1.0)
    except Exception:
        pass

    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    principled = nodes.new(type="ShaderNodeBsdfPrincipled")
    output = nodes.new(type="ShaderNodeOutputMaterial")
    principled.location = (0, 0)
    output.location = (300, 0)
    principled.inputs["Base Color"].default_value = base_color
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])


def validate_materials(bpy) -> tuple[int, int]:
    """Return (ok_count, rebuilt_count)."""
    ok = 0
    rebuilt = 0
    for material in bpy.data.materials:
        if material.library is not None:
            # Linked library material — leave it alone.
            ok += 1
            continue

        needs_rebuild = not material.use_nodes
        if not needs_rebuild:
            tree = material.node_tree
            output_node = next((n for n in tree.nodes if n.type == "OUTPUT_MATERIAL"), None)
            if output_node is None:
                needs_rebuild = True
            else:
                surface_link = next(
                    (link for link in tree.links if link.to_node is output_node and link.to_socket.name == "Surface"),
                    None,
                )
                if surface_link is None or surface_link.from_node.type != "BSDF_PRINCIPLED":
                    needs_rebuild = True

        if needs_rebuild:
            _build_principled_graph(bpy, material)
            rebuilt += 1
            print(f"PHASE materials :: rebuilt {material.name}", flush=True)
        else:
            ok += 1

    log("materials", f"ok={ok} rebuilt={rebuilt}")
    return ok, rebuilt


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def export_glb(bpy, output_path: str) -> None:
    out_dir = os.path.dirname(os.path.abspath(output_path))
    if out_dir and not os.path.isdir(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    log("export", f"writing {output_path}")
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        export_apply=True,        # bake remaining modifiers on export
        export_yup=True,          # Three.js Y-up
        export_materials="EXPORT",
        export_normals=True,
        export_texcoords=True,
        export_animations=True,
        export_cameras=False,
        export_lights=False,
        use_selection=False,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    argv = _user_argv()
    if not argv:
        print(
            "ERROR usage: blender --background --python export_glb.py -- "
            "--input <path.blend> --output <path.glb>",
            flush=True,
        )
        return 2

    try:
        args = parse_args(argv)
    except SystemExit:
        # argparse already printed the error.
        return 2

    input_path = os.path.abspath(args.input)
    output_path = os.path.abspath(args.output)

    if not os.path.isfile(input_path):
        print(f"ERROR input not found: {input_path}", flush=True)
        return 2

    out_dir = os.path.dirname(output_path) or "."
    if not os.path.isdir(out_dir):
        try:
            os.makedirs(out_dir, exist_ok=True)
        except OSError as err:
            print(f"ERROR cannot create output dir {out_dir}: {err}", flush=True)
            return 2

    # Import bpy lazily so `--help` / argument errors don't require Blender.
    try:
        import bpy  # type: ignore
    except ImportError:
        print(
            "ERROR `bpy` is not available — run this script with "
            "`blender --background --python ...`",
            flush=True,
        )
        return 1

    try:
        log("open", input_path)
        bpy.ops.wm.open_mainfile(filepath=input_path)
    except Exception as err:
        print(f"ERROR open_mainfile failed: {type(err).__name__}: {err}", flush=True)
        return 1

    try:
        prepare_scene(bpy)
        validate_materials(bpy)
        export_glb(bpy, output_path)
    except Exception as err:
        print(f"ERROR export pipeline failed: {type(err).__name__}: {err}", flush=True)
        traceback.print_exc()
        return 1

    if not os.path.isfile(output_path):
        print(f"ERROR export reported success but {output_path} is missing", flush=True)
        return 1

    size = os.path.getsize(output_path)
    print(f"OK {output_path} ({size} bytes)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
