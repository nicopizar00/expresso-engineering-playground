import * as THREE from "three";

export const ROOM = { width: 6, depth: 6, height: 3 };

export function buildRoom(scene, { width, depth, height }) {
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide });
  const wallMat  = new THREE.MeshStandardMaterial({ color: 0xfafafa, side: THREE.BackSide });
  const ceilMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), ceilMat);
  ceiling.position.y = height;
  ceiling.rotation.x = Math.PI / 2;
  scene.add(ceiling);

  const walls = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
  walls.position.y = height / 2;
  scene.add(walls);

  const grid = new THREE.GridHelper(width, 12, 0xdddddd, 0xeeeeee);
  grid.position.y = 0.001;
  scene.add(grid);
}
