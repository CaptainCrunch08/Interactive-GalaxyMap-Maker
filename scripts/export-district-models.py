"""
Export district meshes from HiveTower.blend to public/models/districts/*.glb

Usage (Blender 4.2+):
  blender --background HiveTower.blend --python scripts/export-district-models.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import bpy

# Object name in .blend → output stem (DistrictKind)
EXPORT_MAP = {
    "HiveSpireMain": "spire",
    "Bastion": "bastion",
    "Manufactorum": "manufactorum",
    "SpacePort": "docks",
}


def project_root() -> Path:
    # Prefer cwd when launched from repo; fall back to script-relative.
    here = Path(__file__).resolve()
    if (here.parent.parent / "public").is_dir():
        return here.parent.parent
    return Path.cwd()


def clear_selection() -> None:
    bpy.ops.object.select_all(action="DESELECT")


def export_object(obj: bpy.types.Object, out_path: Path) -> None:
    clear_selection()
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.hide_render = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    out_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        use_selection=True,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
    )
    print(f"Exported {obj.name} → {out_path}")


def main() -> int:
    root = project_root()
    out_dir = root / "public" / "models" / "districts"
    missing = []
    for obj_name, stem in EXPORT_MAP.items():
        obj = bpy.data.objects.get(obj_name)
        if obj is None:
            missing.append(obj_name)
            continue
        export_object(obj, out_dir / f"{stem}.glb")
    if missing:
        print("Missing objects:", ", ".join(missing), file=sys.stderr)
        print("Available:", ", ".join(sorted(o.name for o in bpy.data.objects)))
        return 1
    print("Done →", out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
