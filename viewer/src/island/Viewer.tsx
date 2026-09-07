import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, Line, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { cablesAt, visibility, type Placement, type StepLite, type Visibility } from './state';

type ArmData = {
  assembly: string;
  steps: StepLite[];
  cables: { id: string; path: [number, number, number][]; diameter_m: number }[];
  parts: Record<string, { name: string; category: string }>;
};
type Props = { assembly: string; stepId: string; base: string; embed?: boolean };

const COLORS: Record<Visibility, string> = {
  current: '#ffb454',
  installed: '#8a94a6',
  future: '#3a4050',
};

function Part({
  p,
  vis,
  explode,
  centre,
  ghost,
  onPick,
  url,
}: {
  p: Placement;
  vis: Visibility;
  explode: number;
  centre: THREE.Vector3;
  ghost: boolean;
  onPick: (p: Placement) => void;
  url: string;
}) {
  const gltf = useGLTF(url, undefined, undefined, (loader) =>
    loader.setMeshoptDecoder(MeshoptDecoder),
  );
  // meshopt/quantized GLBs carry the dequantisation on the node: bake the node's world matrix into the geometry
  const geom = useMemo(() => {
    let g: THREE.BufferGeometry | undefined;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!g && mesh.isMesh) g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    });
    return g;
  }, [gltf]);
  const m = useMemo(() => new THREE.Matrix4().fromArray(p.transform).transpose(), [p.transform]);
  const { pos, quat, scale } = useMemo(() => {
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    m.decompose(pos, quat, scale);
    return { pos, quat, scale };
  }, [m]);
  // explode: current-step things move away from the assembly centre along their own offset
  const offset = useMemo(
    () =>
      vis === 'current'
        ? pos
            .clone()
            .sub(centre)
            .normalize()
            .multiplyScalar(explode * 0.08)
        : new THREE.Vector3(),
    [vis, pos, centre, explode],
  );
  if (!geom) return null;
  if (vis === 'future' && !ghost) return null;
  return (
    <group position={offset}>
      <mesh
        geometry={geom}
        position={pos}
        quaternion={quat}
        scale={scale}
        userData={{ vis }}
        onClick={(e) => {
          e.stopPropagation();
          onPick(p);
        }}
      >
        <meshStandardMaterial
          color={COLORS[vis]}
          transparent={vis === 'future'}
          opacity={vis === 'future' ? 0.12 : 1}
          roughness={0.7}
          metalness={p.kind === 'fastener' || p.kind === 'horn' ? 0.6 : 0.05}
        />
      </mesh>
    </group>
  );
}

/** Frame the built-so-far group once its meshes exist (Bounds would fit before world matrices update). */
function FitCamera({ target, k }: { target: React.RefObject<THREE.Group | null>; k: number }) {
  const { camera, controls, invalidate, scene } = useThree();
  useEffect(() => {
    (window as unknown as { __so101?: unknown }).__so101 = {
      scene,
      camera,
      controls,
      group: target.current,
    };
    const g = target.current;
    if (!g) return;
    g.updateMatrixWorld(true);
    const box = new THREE.Box3();
    g.traverse((o) => {
      const mesh = o as THREE.Mesh & { isLine2?: boolean };
      // Line2 (cables) extends Mesh with a unit quad geometry: never let it into the fit
      if (mesh.isMesh && !mesh.isLine2 && mesh.userData.vis && mesh.userData.vis !== 'future')
        box.expandByObject(mesh, true);
    });
    console.log('so101 fit', {
      meshes: g.children.length,
      empty: box.isEmpty(),
      min: box.min.toArray(),
      max: box.max.toArray(),
    });
    if (box.isEmpty()) return;
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.03);
    const cam = camera as THREE.PerspectiveCamera;
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(cam.fov) / 2)) * 1.15;
    const dir = new THREE.Vector3(0.7, 0.55, 0.9).normalize();
    cam.position.copy(centre.clone().add(dir.multiplyScalar(dist)));
    cam.near = dist / 100;
    cam.far = dist * 20;
    cam.updateProjectionMatrix();
    const c = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    if (c) {
      c.target.copy(centre);
      c.update();
    } else cam.lookAt(centre);
    invalidate();
  }, [target, k, camera, controls, invalidate]);
  return null;
}

function Scene({
  arm,
  placements,
  k,
  explode,
  ghost,
  onPick,
  base,
}: {
  arm: ArmData;
  placements: Placement[];
  k: number;
  explode: number;
  ghost: boolean;
  onPick: (p: Placement) => void;
  base: string;
}) {
  const centre = useMemo(() => {
    const c = new THREE.Vector3();
    let n = 0;
    for (const p of placements)
      if (p.kind === 'part') {
        c.add(
          new THREE.Vector3().setFromMatrixPosition(
            new THREE.Matrix4().fromArray(p.transform).transpose(),
          ),
        );
        n++;
      }
    return n ? c.divideScalar(n) : c;
  }, [placements]);
  const cableIds = cablesAt(arm.steps, k);
  console.log('so101 scene', {
    k,
    vis: placements
      .map((p) => visibility(p, arm.steps, k, arm.assembly))
      .reduce((a, v) => ({ ...a, [v]: (a[v] ?? 0) + 1 }), {} as Record<string, number>),
  });
  const built = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  useEffect(() => invalidate(), [k, explode, ghost, invalidate]);
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[1, 2, 1]} intensity={1.2} />
      <directionalLight position={[-1, 1, -1]} intensity={0.4} />
      {/* Camera frames only what is built so far; ghosted future parts sit in a sibling group. */}
      <FitCamera target={built} k={k} />
      <group ref={built}>
        {placements.map((p, i) => {
          if (p.kind === 'cable') return null;
          const vis = visibility(p, arm.steps, k, arm.assembly);
          if (vis === 'future') return null;
          return (
            <Part
              key={i}
              p={p}
              vis={vis}
              explode={explode}
              centre={centre}
              ghost={ghost}
              onPick={onPick}
              url={`${base}geometry/${p.mesh}`}
            />
          );
        })}
        {arm.cables
          .filter((c) => cableIds.has(c.id))
          .map((c) => (
            <Line key={c.id} points={c.path} color="#c678dd" lineWidth={2} />
          ))}
      </group>
      <group>
        {placements.map((p, i) => {
          if (p.kind === 'cable' || p.kind === 'fastener') return null;
          const vis = visibility(p, arm.steps, k, arm.assembly);
          if (vis !== 'future') return null;
          return (
            <Part
              key={i}
              p={p}
              vis={vis}
              explode={explode}
              centre={centre}
              ghost={ghost}
              onPick={onPick}
              url={`${base}geometry/${p.mesh}`}
            />
          );
        })}
      </group>
      <Grid
        args={[0.6, 0.6]}
        cellSize={0.02}
        sectionSize={0.1}
        fadeDistance={1.5}
        position={[0, -0.001, 0]}
      />
      <OrbitControls makeDefault enableDamping={false} />
    </>
  );
}

export default function Viewer({ assembly, stepId, base, embed }: Props) {
  const [arm, setArm] = useState<ArmData | null>(null);
  const [placements, setPlacements] = useState<Placement[] | null>(null);
  const [explode, setExplode] = useState(0);
  const [ghost, setGhost] = useState(true);
  const [picked, setPicked] = useState<Placement | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([
      fetch(`${base}data/${assembly}.json`).then((r) => r.json()),
      fetch(`${base}geometry/placements.json`).then((r) => r.json()),
    ])
      .then(([a, g]) => {
        setArm(a);
        setPlacements((g.placements as Placement[]).filter((p) => p.assembly.includes(assembly)));
      })
      .catch((e) => setError(String(e)));
  }, [assembly, base]);
  const k = arm ? arm.steps.findIndex((s) => s.id === stepId) : -1;
  if (error) return <p className="fallback">3D view unavailable: {error}</p>;
  if (!arm || !placements || k < 0) return <p className="fallback">Loading 3D view…</p>;
  // preload the meshes of the next step
  const next = arm.steps[k + 1];
  if (next)
    for (const p of placements)
      if (visibility(p, arm.steps, k + 1, assembly) === 'current')
        useGLTF.preload(`${base}geometry/${p.mesh}`);
  return (
    <>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ position: [0.35, 0.3, 0.45], near: 0.005, far: 10, fov: 40 }}
        style={{ height: embed ? '100vh' : '55vh', minHeight: 320 }}
        onPointerMissed={() => setPicked(null)}
      >
        <Suspense fallback={null}>
          <Scene
            arm={arm}
            placements={placements}
            k={k}
            explode={explode}
            ghost={ghost}
            onPick={setPicked}
            base={base}
          />
        </Suspense>
      </Canvas>
      <div className="hud">
        <label>
          Explode{' '}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={explode}
            onChange={(e) => setExplode(Number(e.target.value))}
            aria-label="Explode current step"
          />
        </label>
        <label>
          <input type="checkbox" checked={ghost} onChange={(e) => setGhost(e.target.checked)} />{' '}
          ghost future parts
        </label>
      </div>
      {picked && (
        <div className="pick">
          <strong>{arm.parts[picked.id]?.name ?? picked.id}</strong>{' '}
          {picked.approximation ? <span className="flag approximation">approximation</span> : null}
          <div>
            <a href={`${base}parts/${picked.id}/`}>BOM entry and sources →</a>
          </div>
        </div>
      )}
    </>
  );
}
