// Walk a group's subtree, disposing geometry, material, and any canvas-backed
// texture map. The texture map dispose is load-bearing — PS1 textures are
// generated from canvases and leak GPU memory if skipped.
export function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children.pop();
    child.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
  }
}
