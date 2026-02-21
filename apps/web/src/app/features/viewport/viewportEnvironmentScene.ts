import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry
} from 'three';

import type { ViewportEnvironmentTemplateId } from './viewportEnvironmentTemplates';

const createMesh = (
  geometry:
    | BoxGeometry
    | PlaneGeometry
    | CylinderGeometry
    | ConeGeometry
    | SphereGeometry
    | CircleGeometry,
  material: MeshStandardMaterial
): Mesh => {
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
};

const createGround = (color: number): Mesh => {
  const ground = createMesh(
    new PlaneGeometry(14, 14, 1, 1),
    new MeshStandardMaterial({
      color,
      roughness: 0.96,
      metalness: 0.02,
      side: DoubleSide
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.56;
  return ground;
};

const createBackdrop = (color: number): Mesh => {
  const backdrop = createMesh(
    new SphereGeometry(9.8, 20, 16),
    new MeshStandardMaterial({
      color,
      roughness: 1,
      metalness: 0,
      side: DoubleSide
    })
  );
  backdrop.position.set(0, 1.2, 0);
  return backdrop;
};

const createTree = (x: number, z: number, scale = 1): Group => {
  const tree = new Group();
  const trunk = createMesh(
    new CylinderGeometry(0.08 * scale, 0.1 * scale, 0.86 * scale, 6),
    new MeshStandardMaterial({ color: 0x5c3a27, roughness: 0.92, metalness: 0.01 })
  );
  trunk.position.y = -1.12;
  const crown = createMesh(
    new ConeGeometry(0.42 * scale, 0.94 * scale, 8),
    new MeshStandardMaterial({ color: 0x3a7f45, roughness: 0.84, metalness: 0.01 })
  );
  crown.position.y = -0.44;
  tree.add(trunk, crown);
  tree.position.set(x, 0, z);
  return tree;
};

const createRock = (x: number, z: number, scale = 1): Mesh => {
  const rock = createMesh(
    new BoxGeometry(0.46 * scale, 0.25 * scale, 0.34 * scale),
    new MeshStandardMaterial({ color: 0x6d737a, roughness: 0.9, metalness: 0.04 })
  );
  rock.position.set(x, -1.42, z);
  rock.rotation.y = (x + z) * 0.35;
  rock.rotation.z = 0.06;
  return rock;
};

const createBush = (x: number, z: number, scale = 1): Mesh => {
  const bush = createMesh(
    new SphereGeometry(0.24 * scale, 8, 8),
    new MeshStandardMaterial({ color: 0x4e8d52, roughness: 0.86, metalness: 0.01 })
  );
  bush.position.set(x, -1.34, z);
  return bush;
};

const createReed = (x: number, z: number, height = 0.56): Mesh => {
  const reed = createMesh(
    new CylinderGeometry(0.02, 0.03, height, 5),
    new MeshStandardMaterial({ color: 0x6f8f44, roughness: 0.88, metalness: 0.02 })
  );
  reed.position.set(x, -1.56 + height / 2, z);
  return reed;
};

const createFence = (x: number, z: number, horizontal = true): Group => {
  const fence = new Group();
  const postA = createMesh(
    new BoxGeometry(0.07, 0.52, 0.07),
    new MeshStandardMaterial({ color: 0xa77b4d, roughness: 0.87, metalness: 0.02 })
  );
  const postB = postA.clone();
  postA.position.set(-0.35, -1.3, 0);
  postB.position.set(0.35, -1.3, 0);
  const railTop = createMesh(
    new BoxGeometry(0.72, 0.05, 0.06),
    new MeshStandardMaterial({ color: 0xc29563, roughness: 0.84, metalness: 0.02 })
  );
  const railBottom = railTop.clone();
  railTop.position.set(0, -1.18, 0);
  railBottom.position.set(0, -1.34, 0);
  fence.add(postA, postB, railTop, railBottom);
  fence.position.set(x, 0, z);
  if (!horizontal) {
    fence.rotation.y = Math.PI / 2;
  }
  return fence;
};

const buildForestTemplate = (): Group => {
  const root = new Group();
  root.add(createBackdrop(0x7da98e), createGround(0x668f57));
  root.add(createTree(-2.3, -2.1, 1.1), createTree(2.5, -2.2, 1.18), createTree(-2.8, 1.9, 0.96), createTree(2.2, 2.1, 1.02));
  root.add(createBush(-1.2, 1.6, 1.12), createBush(1.7, 1.4, 1), createBush(0.9, -1.6, 0.95));
  root.add(createRock(-0.8, -2.3, 1), createRock(2.2, 0.9, 0.85));
  return root;
};

const buildSwampTemplate = (): Group => {
  const root = new Group();
  root.add(createBackdrop(0x6a826f), createGround(0x4f6d4f));
  const pond = createMesh(
    new CircleGeometry(2.1, 28),
    new MeshStandardMaterial({ color: 0x304f63, roughness: 0.34, metalness: 0.06, side: DoubleSide })
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(0, -1.5, 0.5);
  root.add(pond);
  root.add(createRock(-2.2, -1.3, 1), createRock(2.3, -1.2, 0.86), createRock(1.9, 1.6, 0.82));
  const reedPositions: ReadonlyArray<readonly [number, number, number]> = [
    [-1.6, -0.2, 0.62],
    [-1.2, 0.6, 0.54],
    [-0.4, 1.4, 0.67],
    [0.5, 1.2, 0.58],
    [1.3, 0.1, 0.63],
    [1.7, -0.6, 0.52]
  ];
  for (const [x, z, height] of reedPositions) {
    root.add(createReed(x, z, height));
  }
  return root;
};

const buildHillTemplate = (): Group => {
  const root = new Group();
  root.add(createBackdrop(0x8f99b6), createGround(0x7a8f62));
  const hillA = createMesh(
    new SphereGeometry(1.6, 14, 10),
    new MeshStandardMaterial({ color: 0x8ea476, roughness: 0.92, metalness: 0.01 })
  );
  hillA.position.set(-2.8, -1.9, -1.7);
  const hillB = hillA.clone();
  hillB.position.set(3.1, -1.85, -1.9);
  hillB.scale.set(1.18, 1, 1.08);
  root.add(hillA, hillB);
  root.add(createRock(-1.2, -0.9, 1.2), createRock(1.3, -1.1, 1.14), createRock(2.3, 1.4, 1), createRock(-2.1, 1.5, 0.92));
  return root;
};

const buildFarmTemplate = (): Group => {
  const root = new Group();
  root.add(createBackdrop(0xa8b28d), createGround(0x9d905f));

  const furrowMaterial = new MeshStandardMaterial({ color: 0x7d5d3a, roughness: 0.95, metalness: 0.01 });
  for (let index = -2; index <= 2; index += 1) {
    const furrow = createMesh(new BoxGeometry(0.28, 0.04, 4.8), furrowMaterial);
    furrow.position.set(index * 0.7, -1.53, 0.8);
    root.add(furrow);
  }

  root.add(createFence(-3.3, 0.2, false), createFence(3.3, 0.2, false), createFence(0, -2.8, true), createFence(0, 2.9, true));
  root.add(createBush(-1.8, -2.3, 0.9), createBush(2, -2.2, 0.88), createBush(-2.1, 2.3, 0.85));
  return root;
};

const disposeObject3DTree = (root: Object3D): void => {
  root.traverse((node) => {
    const mesh = node as {
      geometry?: { dispose?: () => void };
      material?:
        | { dispose?: () => void }
        | Array<{
            dispose?: () => void;
          }>;
    };
    mesh.geometry?.dispose?.();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => material.dispose?.());
      return;
    }
    mesh.material?.dispose?.();
  });
};

export const clearViewportEnvironmentRoot = (environmentRoot: Group): void => {
  while (environmentRoot.children.length > 0) {
    const child = environmentRoot.children[0];
    environmentRoot.remove(child);
    disposeObject3DTree(child);
  }
  environmentRoot.position.set(0, 0, 0);
  environmentRoot.rotation.set(0, 0, 0);
  environmentRoot.scale.set(1, 1, 1);
};

const buildViewportEnvironmentTemplate = (templateId: ViewportEnvironmentTemplateId): Group | null => {
  if (templateId === 'forest') {
    return buildForestTemplate();
  }
  if (templateId === 'swamp') {
    return buildSwampTemplate();
  }
  if (templateId === 'hill') {
    return buildHillTemplate();
  }
  if (templateId === 'farm') {
    return buildFarmTemplate();
  }
  return null;
};

export const applyViewportEnvironmentTemplate = (
  environmentRoot: Group,
  templateId: ViewportEnvironmentTemplateId
): void => {
  clearViewportEnvironmentRoot(environmentRoot);
  const templateRoot = buildViewportEnvironmentTemplate(templateId);
  if (!templateRoot) {
    return;
  }
  environmentRoot.add(templateRoot);
  environmentRoot.updateMatrixWorld(true);
};
