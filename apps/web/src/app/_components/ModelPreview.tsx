'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AnimationClip,
  AnimationMixer,
  Clock,
  AmbientLight,
  BufferAttribute,
  BoxGeometry,
  Box3,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  SkinnedMesh,
  Sphere,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  LoopOnce,
  LoopRepeat
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { cn } from '../../lib/utils';
import { buildGatewayApiUrl } from '../../lib/gatewayApi';

interface ModelPreviewProps {
  projectId: string | null;
  workspaceId: string | null;
  hasGeometry: boolean;
  yawDeg: number;
  pitchDeg: number;
  selectedAnimationId: string | null;
  selectedAnimationName: string | null;
  animationPlaying: boolean;
  animationLoopEnabled: boolean;
  className?: string;
}

type PreviewResponse = {
  ok: boolean;
  status: 'ready' | 'processing' | 'empty' | 'error';
  gltf?: string;
  message?: string;
};

const PREVIEW_POLL_MS = 1200;
const PREVIEW_TARGET_SIZE = 2.8;
const DEFAULT_CAMERA_FOV_DEG = 42;
const CAMERA_FRAME_MARGIN = 1.22;
const ORBIT_DAMPING = 0.22;
const ORBIT_SNAP_EPSILON = 0.01;

const supportsWebgl = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  if (
    typeof window.WebGLRenderingContext === 'undefined' &&
    typeof window.WebGL2RenderingContext === 'undefined'
  ) {
    return false;
  }
  const canvas = window.document.createElement('canvas');
  return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
};

const disposeGroupChildren = (group: Group): void => {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    child.traverse((node: Object3D) => {
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
      } else {
        mesh.material?.dispose?.();
      }
    });
  }
};

const resetGroupTransform = (group: Group): void => {
  group.position.set(0, 0, 0);
  group.quaternion.set(0, 0, 0, 1);
  group.scale.set(1, 1, 1);
  group.updateMatrixWorld(true);
};

const computeRenderableBounds = (root: Object3D): Box3 | null => {
  root.updateMatrixWorld(true);
  const box = new Box3();
  let foundRenderable = false;

  root.traverse((node) => {
    if (!(node instanceof Mesh)) {
      return;
    }
    const geometry = node.geometry;
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    if (!geometry.boundingBox) {
      return;
    }
    const transformed = geometry.boundingBox.clone().applyMatrix4(node.matrixWorld);
    box.union(transformed);
    foundRenderable = true;
  });

  return foundRenderable ? box : null;
};

const normalizeModelScale = (group: Group): void => {
  const box = computeRenderableBounds(group);
  if (!box) {
    return;
  }
  const anchor = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = PREVIEW_TARGET_SIZE / maxDim;
  group.scale.setScalar(scale);
  group.position.set(-anchor.x * scale, -anchor.y * scale, -anchor.z * scale);
  group.updateMatrixWorld(true);
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const fitCameraToModel = (
  camera: PerspectiveCamera,
  modelRoot: Group,
  host: HTMLElement,
  orbitTarget: Vector3
): number => {
  const width = Math.max(host.clientWidth, 1);
  const height = Math.max(host.clientHeight, 1);
  camera.aspect = width / height;
  camera.fov = DEFAULT_CAMERA_FOV_DEG;

  const box = computeRenderableBounds(modelRoot);
  if (!box) {
    orbitTarget.set(0, 0, 0);
    camera.position.set(orbitTarget.x, orbitTarget.y, orbitTarget.z + 4.4);
    camera.near = 0.1;
    camera.far = 100;
    camera.lookAt(orbitTarget);
    camera.updateProjectionMatrix();
    return 4.4;
  }

  const sphere = box.getBoundingSphere(new Sphere());
  const size = box.getSize(new Vector3());
  orbitTarget.copy(sphere.center);
  const halfWidth = Math.max(size.x * 0.5, 0.001);
  const halfHeight = Math.max(size.y * 0.5, 0.001);
  const halfFovRad = (camera.fov * Math.PI) / 360;
  const tanHalfFov = Math.tan(halfFovRad);
  const fitHeightDistance = halfHeight / tanHalfFov;
  const fitWidthDistance = halfWidth / (Math.max(camera.aspect, 0.001) * tanHalfFov);
  const distance = Math.max(fitHeightDistance, fitWidthDistance, sphere.radius) * CAMERA_FRAME_MARGIN;

  camera.position.set(orbitTarget.x, orbitTarget.y, orbitTarget.z + distance);
  camera.near = Math.max(0.01, distance - sphere.radius * 3.5);
  camera.far = Math.max(64, distance + sphere.radius * 9);
  camera.lookAt(orbitTarget);
  camera.updateProjectionMatrix();
  return distance;
};

const recenterProjectedBounds = (camera: PerspectiveCamera, modelRoot: Group, orbitTarget: Vector3): void => {
  const box = computeRenderableBounds(modelRoot);
  if (!box) {
    return;
  }

  const corners = [
    new Vector3(box.min.x, box.min.y, box.min.z),
    new Vector3(box.min.x, box.min.y, box.max.z),
    new Vector3(box.min.x, box.max.y, box.min.z),
    new Vector3(box.min.x, box.max.y, box.max.z),
    new Vector3(box.max.x, box.min.y, box.min.z),
    new Vector3(box.max.x, box.min.y, box.max.z),
    new Vector3(box.max.x, box.max.y, box.min.z),
    new Vector3(box.max.x, box.max.y, box.max.z)
  ];

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const corner of corners) {
    corner.project(camera);
    minX = Math.min(minX, corner.x);
    maxX = Math.max(maxX, corner.x);
    minY = Math.min(minY, corner.y);
    maxY = Math.max(maxY, corner.y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return;
  }

  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  if (Math.abs(centerX) < 1e-3 && Math.abs(centerY) < 1e-3) {
    return;
  }

  const distance = Math.max(camera.position.distanceTo(orbitTarget), 0.001);
  const halfFovRad = (camera.fov * Math.PI) / 360;
  const worldHalfHeight = Math.tan(halfFovRad) * distance;
  const worldHalfWidth = worldHalfHeight * Math.max(camera.aspect, 0.001);
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const correction = right.multiplyScalar(centerX * worldHalfWidth).add(up.multiplyScalar(centerY * worldHalfHeight));
  camera.position.add(correction);
  orbitTarget.add(correction);
  camera.lookAt(orbitTarget);
  camera.updateMatrixWorld();
};

const buildProxyModel = (): Group => {
  const root = new Group();

  const body = new Mesh(
    new BoxGeometry(1.3, 0.7, 0.6),
    new MeshStandardMaterial({ color: 0xce6e34, roughness: 0.75, metalness: 0.05 })
  );
  body.position.set(0, 0, 0);
  root.add(body);

  const chest = new Mesh(
    new BoxGeometry(0.58, 0.45, 0.4),
    new MeshStandardMaterial({ color: 0xf4e8d6, roughness: 0.82, metalness: 0.02 })
  );
  chest.position.set(0.24, -0.08, 0.19);
  root.add(chest);

  const head = new Mesh(
    new BoxGeometry(0.62, 0.52, 0.58),
    new MeshStandardMaterial({ color: 0xd17a3f, roughness: 0.74, metalness: 0.05 })
  );
  head.position.set(0.84, 0.16, 0);
  root.add(head);

  const earLeft = new Mesh(
    new BoxGeometry(0.13, 0.23, 0.12),
    new MeshStandardMaterial({ color: 0xb85f2f, roughness: 0.78, metalness: 0.04 })
  );
  earLeft.position.set(1.02, 0.5, -0.16);
  root.add(earLeft);

  const earRight = new Mesh(
    new BoxGeometry(0.13, 0.23, 0.12),
    new MeshStandardMaterial({ color: 0xb85f2f, roughness: 0.78, metalness: 0.04 })
  );
  earRight.position.set(1.02, 0.5, 0.16);
  root.add(earRight);

  const legOffsets: Array<[number, number, number]> = [
    [-0.42, -0.48, -0.2],
    [-0.42, -0.48, 0.2],
    [0.42, -0.48, -0.2],
    [0.42, -0.48, 0.2]
  ];
  legOffsets.forEach((offset) => {
    const leg = new Mesh(
      new BoxGeometry(0.18, 0.55, 0.18),
      new MeshStandardMaterial({ color: 0xb96233, roughness: 0.8, metalness: 0.03 })
    );
    leg.position.set(offset[0], offset[1], offset[2]);
    root.add(leg);
  });

  const tail = new Mesh(
    new BoxGeometry(0.78, 0.18, 0.18),
    new MeshStandardMaterial({ color: 0xe9e0d5, roughness: 0.82, metalness: 0.02 })
  );
  tail.position.set(-0.95, 0.06, 0);
  tail.rotation.z = 0.42;
  root.add(tail);

  return root;
};

const getVertexCount = (root: Object3D): number => {
  let count = 0;
  root.traverse((node) => {
    const mesh = node as Mesh;
    const geometry = mesh.geometry;
    const positionAttribute = geometry?.getAttribute?.('position');
    if (!positionAttribute || typeof positionAttribute.count !== 'number') {
      return;
    }
    count += positionAttribute.count;
  });
  return count;
};

const bakeSkinnedMeshesForStaticPreview = (root: Object3D): void => {
  const replacements: Array<{
    parent: Object3D;
    original: SkinnedMesh;
    replacement: Mesh;
  }> = [];
  const skinnedPosition = new Vector3();

  root.traverse((node) => {
    if (!(node instanceof SkinnedMesh) || !node.parent) {
      return;
    }
    node.updateMatrixWorld(true);
    node.skeleton.update();
    const geometry = node.geometry.clone();
    const positionAttr = geometry.getAttribute('position');
    if (positionAttr instanceof BufferAttribute) {
      for (let index = 0; index < positionAttr.count; index += 1) {
        skinnedPosition.fromBufferAttribute(positionAttr, index);
        node.applyBoneTransform(index, skinnedPosition);
        positionAttr.setXYZ(index, skinnedPosition.x, skinnedPosition.y, skinnedPosition.z);
      }
      positionAttr.needsUpdate = true;
      if (geometry.index) {
        geometry.computeVertexNormals();
      }
    }
    geometry.deleteAttribute('skinIndex');
    geometry.deleteAttribute('skinWeight');

    const replacement = new Mesh(geometry, node.material);
    replacement.name = node.name;
    replacement.position.copy(node.position);
    replacement.quaternion.copy(node.quaternion);
    replacement.scale.copy(node.scale);
    replacement.matrix.copy(node.matrix);
    replacement.matrixAutoUpdate = node.matrixAutoUpdate;
    replacement.renderOrder = node.renderOrder;
    replacement.frustumCulled = false;
    replacements.push({
      parent: node.parent,
      original: node,
      replacement
    });
  });

  for (const item of replacements) {
    item.parent.add(item.replacement);
    item.parent.remove(item.original);
  }
};

const hashHueFromProjectId = (projectId: string | null): number => {
  if (!projectId) {
    return 24;
  }
  let hash = 0;
  for (let index = 0; index < projectId.length; index += 1) {
    hash = (hash * 31 + projectId.charCodeAt(index)) >>> 0;
  }
  return hash % 360;
};

const buildProjectBaseColor = (projectId: string | null): Color => {
  const color = new Color();
  const hue = hashHueFromProjectId(projectId) / 360;
  color.setHSL(hue, 0.46, 0.5);
  return color;
};

const colorLuminance = (color: Color): number => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;

const materialLooksFlatWhite = (material: MeshStandardMaterial): boolean => {
  const hasTexture =
    Boolean(material.map) ||
    Boolean(material.normalMap) ||
    Boolean(material.roughnessMap) ||
    Boolean(material.metalnessMap) ||
    Boolean(material.emissiveMap) ||
    Boolean(material.alphaMap);
  if (hasTexture) {
    return false;
  }
  const hsl = { h: 0, s: 0, l: 0 };
  material.color.getHSL(hsl);
  return colorLuminance(material.color) > 0.9 && hsl.s < 0.08;
};

const enhanceModelVisibility = (root: Object3D, projectId: string | null): void => {
  const baseColor = buildProjectBaseColor(projectId);
  let variantIndex = 0;
  root.traverse((node) => {
    if (!(node instanceof Mesh)) {
      return;
    }
    node.frustumCulled = false;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) {
        continue;
      }
      if (!materialLooksFlatWhite(material)) {
        continue;
      }
      const baseHsl = { h: 0, s: 0, l: 0 };
      baseColor.getHSL(baseHsl);
      const tint = new Color();
      const hue = (baseHsl.h + (variantIndex % 5) * 0.035) % 1;
      const sat = clamp(baseHsl.s + 0.06, 0.2, 0.8);
      const light = clamp(baseHsl.l + (variantIndex % 2 === 0 ? -0.06 : 0.04), 0.28, 0.72);
      tint.setHSL(hue, sat, light);
      material.color.copy(tint);
      material.roughness = clamp(material.roughness, 0.55, 1);
      material.metalness = clamp(material.metalness, 0, 0.2);
      material.needsUpdate = true;
      variantIndex += 1;
    }
  });
};

export const ModelPreview = ({
  projectId,
  workspaceId,
  hasGeometry,
  yawDeg,
  pitchDeg,
  selectedAnimationId,
  selectedAnimationName,
  animationPlaying,
  animationLoopEnabled,
  className
}: ModelPreviewProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const baseDistanceRef = useRef<number>(4.4);
  const orbitTargetRef = useRef<Vector3>(new Vector3(0, 0, 0));
  const yawRef = useRef<number>(yawDeg);
  const pitchRef = useRef<number>(pitchDeg);
  const smoothYawRef = useRef<number>(yawDeg);
  const smoothPitchRef = useRef<number>(pitchDeg);
  const modelRootRef = useRef<Group | null>(null);
  const rafRef = useRef<number | null>(null);
  const renderDirtyRef = useRef(false);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationClockRef = useRef<Clock>(new Clock(false));
  const animationMixerRef = useRef<AnimationMixer | null>(null);
  const animationClipsRef = useRef<readonly AnimationClip[]>([]);
  const activeClipNameRef = useRef<string | null>(null);
  const activeActionRef = useRef<ReturnType<AnimationMixer['clipAction']> | null>(null);
  const [statusLabel, setStatusLabel] = useState<string>('Initializing preview…');
  const [gltfSource, setGltfSource] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const resetAnimationPlayback = (): void => {
    const mixer = animationMixerRef.current;
    if (mixer) {
      mixer.stopAllAction();
      mixer.setTime(0);
    }
    animationClockRef.current.stop();
    activeActionRef.current = null;
    activeClipNameRef.current = null;
    requestRenderRef.current?.();
  };

  const resolvePreviewClip = (): AnimationClip | null => {
    const clips = animationClipsRef.current;
    if (clips.length === 0) {
      return null;
    }
    if (selectedAnimationName) {
      const byName = AnimationClip.findByName(clips, selectedAnimationName);
      if (byName) {
        return byName;
      }
    }
    if (selectedAnimationId) {
      const byId = AnimationClip.findByName(clips, selectedAnimationId);
      if (byId) {
        return byId;
      }
    }
    return clips[0] ?? null;
  };

  const applyOrbitCamera = (
    camera: PerspectiveCamera,
    distance: number,
    yaw: number,
    pitch: number,
    target: Vector3
  ): void => {
    const yawRad = (yaw * Math.PI) / 180;
    const pitchRad = (pitch * Math.PI) / 180;
    const cosPitch = Math.cos(pitchRad);
    const x = Math.sin(yawRad) * cosPitch * distance;
    const y = Math.sin(pitchRad) * distance;
    const z = Math.cos(yawRad) * cosPitch * distance;
    camera.position.set(target.x + x, target.y + y, target.z + z);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };

  const applySmoothedOrbit = (camera: PerspectiveCamera): void => {
    applyOrbitCamera(
      camera,
      baseDistanceRef.current,
      smoothYawRef.current,
      smoothPitchRef.current,
      orbitTargetRef.current
    );
  };

  const snapOrbitToTargetAngles = (camera: PerspectiveCamera): void => {
    smoothYawRef.current = yawRef.current;
    smoothPitchRef.current = pitchRef.current;
    applySmoothedOrbit(camera);
  };

  useEffect(() => {
    const clearPreview = () => {
      const modelRoot = modelRootRef.current;
      if (modelRoot) {
        disposeGroupChildren(modelRoot);
        resetGroupTransform(modelRoot);
      }
      animationMixerRef.current = null;
      animationClipsRef.current = [];
      resetAnimationPlayback();
      requestRenderRef.current?.();
    };

    if (!hasGeometry) {
      clearPreview();
      setIsReady(false);
      setGltfSource(null);
      setStatusLabel('No geometry');
      return;
    }

    if (!projectId) {
      clearPreview();
      setIsReady(false);
      setGltfSource(null);
      setStatusLabel('Select a project');
      return;
    }

    const normalizedWorkspaceId = workspaceId?.trim() ?? '';
    if (!normalizedWorkspaceId) {
      clearPreview();
      setIsReady(false);
      setGltfSource(null);
      setStatusLabel('Select a workspace');
      return;
    }

    if (!supportsWebgl()) {
      clearPreview();
      setIsReady(false);
      setGltfSource(null);
      setStatusLabel('WebGL unavailable');
      return;
    }

    let cancelled = false;

    const clearPoll = () => {
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };

    const poll = async () => {
      try {
        const response = await fetch(
          buildGatewayApiUrl(
            `/projects/${encodeURIComponent(projectId)}/preview?workspaceId=${encodeURIComponent(normalizedWorkspaceId)}`
          ),
          {
            cache: 'no-store'
          }
        );
        const payload = (await response.json()) as PreviewResponse;
        if (cancelled) {
          return;
        }
        if (payload.status === 'ready' && typeof payload.gltf === 'string') {
          setGltfSource(payload.gltf);
          setStatusLabel('Preview ready');
          return;
        }
        if (payload.status === 'processing') {
          setStatusLabel('Rendering preview…');
          clearPoll();
          pollingTimerRef.current = setTimeout(() => {
            void poll();
          }, PREVIEW_POLL_MS);
          return;
        }
        if (payload.status === 'empty') {
          setStatusLabel('No geometry');
          return;
        }
        setStatusLabel(payload.message ?? 'Preview unavailable');
      } catch {
        if (cancelled) {
          return;
        }
        setStatusLabel('Preview load failed');
        clearPoll();
        pollingTimerRef.current = setTimeout(() => {
          void poll();
        }, PREVIEW_POLL_MS * 2);
      }
    };

    setIsReady(false);
    setGltfSource(null);
    setStatusLabel('Preparing preview…');
    clearPreview();
    void poll();

    return () => {
      cancelled = true;
      clearPoll();
    };
  }, [projectId, hasGeometry, workspaceId]);

  useEffect(() => {
    if (!hostRef.current || !hasGeometry || !supportsWebgl()) {
      return;
    }

    const host = hostRef.current;
    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new Scene();
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 4.4);

    const ambientLight = new AmbientLight(0xffffff, 0.46);
    const keyLight = new DirectionalLight(0xffffff, 1.05);
    keyLight.position.set(2, 3, 4);
    const fillLight = new DirectionalLight(0x9ab6ff, 0.52);
    fillLight.position.set(-2, 1.5, -3);
    const rimLight = new DirectionalLight(0xfff2d4, 0.35);
    rimLight.position.set(0, 3, -4);
    scene.add(ambientLight, keyLight, fillLight, rimLight);

    const modelRoot = new Group();
    scene.add(modelRoot);

    cameraRef.current = camera;
    modelRootRef.current = modelRoot;
    host.appendChild(renderer.domElement);

    const renderFrame = () => {
      rafRef.current = null;
      let shouldRender = renderDirtyRef.current;
      renderDirtyRef.current = false;

      const yawDelta = yawRef.current - smoothYawRef.current;
      const pitchDelta = pitchRef.current - smoothPitchRef.current;
      if (Math.abs(yawDelta) > ORBIT_SNAP_EPSILON || Math.abs(pitchDelta) > ORBIT_SNAP_EPSILON) {
        smoothYawRef.current += yawDelta * ORBIT_DAMPING;
        smoothPitchRef.current += pitchDelta * ORBIT_DAMPING;
        if (Math.abs(yawRef.current - smoothYawRef.current) < ORBIT_SNAP_EPSILON) {
          smoothYawRef.current = yawRef.current;
        }
        if (Math.abs(pitchRef.current - smoothPitchRef.current) < ORBIT_SNAP_EPSILON) {
          smoothPitchRef.current = pitchRef.current;
        }
        applySmoothedOrbit(camera);
        shouldRender = true;
      }

      const hasOrbitMomentum =
        Math.abs(yawRef.current - smoothYawRef.current) > ORBIT_SNAP_EPSILON ||
        Math.abs(pitchRef.current - smoothPitchRef.current) > ORBIT_SNAP_EPSILON;

      const mixer = animationMixerRef.current;
      if (mixer && animationClockRef.current.running) {
        const deltaSeconds = animationClockRef.current.getDelta();
        if (deltaSeconds > 0) {
          mixer.update(Math.min(deltaSeconds, 0.05));
          shouldRender = true;
        }
      }

      if (shouldRender) {
        renderer.render(scene, camera);
      }

      if (hasOrbitMomentum || (mixer && animationClockRef.current.running) || renderDirtyRef.current) {
        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(renderFrame);
        }
      }
    };

    const requestRender = () => {
      renderDirtyRef.current = true;
      if (rafRef.current !== null) {
        return;
      }
      rafRef.current = requestAnimationFrame(renderFrame);
    };
    requestRenderRef.current = requestRender;

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height);
      baseDistanceRef.current = fitCameraToModel(camera, modelRoot, host, orbitTargetRef.current);
      snapOrbitToTargetAngles(camera);
      recenterProjectedBounds(camera, modelRoot, orbitTargetRef.current);
      requestRender();
    };
    const observer = new ResizeObserver(() => {
      resize();
    });
    observer.observe(host);
    resizeObserverRef.current = observer;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        return;
      }
      requestRender();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    resize();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      requestRenderRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
      renderDirtyRef.current = false;
      resetAnimationPlayback();
      animationMixerRef.current = null;
      animationClipsRef.current = [];
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      disposeGroupChildren(modelRoot);
      renderer.dispose();
      cameraRef.current = null;
      modelRootRef.current = null;
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [hasGeometry]);

  useEffect(() => {
    yawRef.current = yawDeg;
    pitchRef.current = pitchDeg;
    requestRenderRef.current?.();
  }, [yawDeg, pitchDeg]);

  useEffect(() => {
    if (!gltfSource) {
      return;
    }
    const modelRoot = modelRootRef.current;
    if (!modelRoot) {
      return;
    }

    let disposed = false;
    const loader = new GLTFLoader();
    const showProxyFallback = (label: string) => {
      if (disposed) {
        return;
      }
      disposeGroupChildren(modelRoot);
      resetGroupTransform(modelRoot);
      resetAnimationPlayback();
      animationMixerRef.current = null;
      animationClipsRef.current = [];
      modelRoot.add(buildProxyModel());
      normalizeModelScale(modelRoot);
      if (cameraRef.current && hostRef.current) {
        baseDistanceRef.current = fitCameraToModel(cameraRef.current, modelRoot, hostRef.current, orbitTargetRef.current);
        snapOrbitToTargetAngles(cameraRef.current);
        recenterProjectedBounds(cameraRef.current, modelRoot, orbitTargetRef.current);
      }
      setStatusLabel(label);
      setIsReady(true);
      requestRenderRef.current?.();
    };
    loader.parse(
      gltfSource,
      '',
      (gltf: GLTF) => {
        if (disposed) {
          return;
        }
        try {
          const hasClips = gltf.animations.length > 0;
          if (!hasClips) {
            bakeSkinnedMeshesForStaticPreview(gltf.scene);
          }
          disposeGroupChildren(modelRoot);
          resetGroupTransform(modelRoot);
          resetAnimationPlayback();
          animationMixerRef.current = null;
          animationClipsRef.current = [];
          if (getVertexCount(gltf.scene) <= 0) {
            modelRoot.add(buildProxyModel());
            normalizeModelScale(modelRoot);
            if (cameraRef.current && hostRef.current) {
              baseDistanceRef.current = fitCameraToModel(cameraRef.current, modelRoot, hostRef.current, orbitTargetRef.current);
              snapOrbitToTargetAngles(cameraRef.current);
              recenterProjectedBounds(cameraRef.current, modelRoot, orbitTargetRef.current);
            }
            setStatusLabel('Preview source is empty. Showing proxy model.');
            setIsReady(true);
            requestRenderRef.current?.();
            return;
          }
          enhanceModelVisibility(gltf.scene, projectId);
          modelRoot.add(gltf.scene);
          if (hasClips) {
            animationMixerRef.current = new AnimationMixer(gltf.scene);
            animationClipsRef.current = gltf.animations;
          }
          normalizeModelScale(modelRoot);
          if (cameraRef.current && hostRef.current) {
            baseDistanceRef.current = fitCameraToModel(cameraRef.current, modelRoot, hostRef.current, orbitTargetRef.current);
            snapOrbitToTargetAngles(cameraRef.current);
            recenterProjectedBounds(cameraRef.current, modelRoot, orbitTargetRef.current);
          }
          setIsReady(true);
          requestRenderRef.current?.();
        } catch (error) {
          console.error('ashfox preview render failed', error);
          showProxyFallback('Preview render failed. Showing proxy model.');
        }
      },
      (error: unknown) => {
        if (disposed) {
          return;
        }
        console.error('ashfox preview parse failed', error);
        showProxyFallback('Preview parse failed. Showing proxy model.');
      }
    );
    return () => {
      disposed = true;
    };
  }, [gltfSource, projectId]);

  useEffect(() => {
    const mixer = animationMixerRef.current;
    if (!mixer) {
      return;
    }

    const clip = resolvePreviewClip();
    if (!clip) {
      resetAnimationPlayback();
      return;
    }

    if (!animationPlaying) {
      resetAnimationPlayback();
      return;
    }

    const clipName = clip.name || '__default';
    let action = activeActionRef.current;
    if (!action || activeClipNameRef.current !== clipName) {
      resetAnimationPlayback();
      action = mixer.clipAction(clip);
      activeActionRef.current = action;
      activeClipNameRef.current = clipName;
    }

    action.enabled = true;
    action.reset();
    action.setLoop(animationLoopEnabled ? LoopRepeat : LoopOnce, animationLoopEnabled ? Infinity : 1);
    action.clampWhenFinished = !animationLoopEnabled;
    action.play();
    if (!animationClockRef.current.running) {
      animationClockRef.current.start();
    }
    requestRenderRef.current?.();
  }, [animationLoopEnabled, animationPlaying, gltfSource, isReady, selectedAnimationId, selectedAnimationName]);

  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)}>
      <div ref={hostRef} className="absolute inset-0" />
      {!isReady ? (
        <div className="absolute inset-0 flex items-center justify-center text-center text-sm font-semibold text-foreground/90">
          {statusLabel}
        </div>
      ) : null}
    </div>
  );
};
