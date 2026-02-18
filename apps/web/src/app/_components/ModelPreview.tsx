'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { cn } from '../../lib/utils';
import { buildGatewayApiUrl } from '../../lib/gatewayApi';

interface ModelPreviewProps {
  projectId: string | null;
  hasGeometry: boolean;
  className?: string;
}

type PreviewResponse = {
  ok: boolean;
  status: 'ready' | 'processing' | 'empty' | 'error';
  gltf?: string;
  message?: string;
};

const PREVIEW_POLL_MS = 1200;

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

const normalizeModelScale = (group: Group): void => {
  const box = new Box3().setFromObject(group);
  if (box.isEmpty()) {
    return;
  }
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = 2.2 / maxDim;
  group.position.sub(center);
  group.scale.setScalar(scale);
};

export const ModelPreview = ({ projectId, hasGeometry, className }: ModelPreviewProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const modelRootRef = useRef<Group | null>(null);
  const rafRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusLabel, setStatusLabel] = useState<string>('Initializing preview…');
  const [gltfSource, setGltfSource] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const clearPreview = () => {
      const modelRoot = modelRootRef.current;
      if (modelRoot) {
        disposeGroupChildren(modelRoot);
      }
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
        const response = await fetch(buildGatewayApiUrl(`/projects/${encodeURIComponent(projectId)}/preview`), {
          cache: 'no-store'
        });
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
  }, [projectId, hasGeometry]);

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

    const ambientLight = new AmbientLight(0xffffff, 0.72);
    const keyLight = new DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(2, 3, 4);
    const fillLight = new DirectionalLight(0x99b5ff, 0.42);
    fillLight.position.set(-2, 1.5, -3);
    scene.add(ambientLight, keyLight, fillLight);

    const pivot = new Group();
    const modelRoot = new Group();
    pivot.add(modelRoot);
    scene.add(pivot);

    modelRootRef.current = modelRoot;
    host.appendChild(renderer.domElement);

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(() => {
      resize();
    });
    observer.observe(host);
    resizeObserverRef.current = observer;

    const renderLoop = () => {
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      disposeGroupChildren(modelRoot);
      renderer.dispose();
      modelRootRef.current = null;
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [hasGeometry]);

  useEffect(() => {
    if (!gltfSource) {
      return;
    }
    const modelRoot = modelRootRef.current;
    if (!modelRoot) {
      return;
    }

    const loader = new GLTFLoader();
    loader.parse(
      gltfSource,
      '',
      (gltf: GLTF) => {
        disposeGroupChildren(modelRoot);
        modelRoot.add(gltf.scene);
        normalizeModelScale(modelRoot);
        setIsReady(true);
      },
      () => {
        setIsReady(false);
        setStatusLabel('Preview parse failed');
      }
    );
  }, [gltfSource]);

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
