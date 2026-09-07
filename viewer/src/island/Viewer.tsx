import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, Html, Line, OrbitControls, useGLTF, useProgress } from '@react-three/drei';
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

/**
 * Mesh colours follow the page tokens (--accent for "this step", --muted for built, --line for
 * ghosts) so the highlight survives the light theme. These defaults match the dark palette and are
 * replaced from computed styles once the island mounts; Part only renders after that.
 */
const COLORS: Record<Visibility, string> = {
  current: '#4da3ff',
  installed: '#9fabbe',
  future: '#22314a',
};
function readColors(): void {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  COLORS.current = v('--accent', COLORS.current);
  COLORS.installed = v('--muted', COLORS.installed);
  COLORS.future = v('--line', COLORS.future);
}
/** Crease lines: near-black reads on the lit grey and orange meshes in both themes. */
const EDGE = '#0b0d12';
/** Name chip for a current-step part; fasteners stay unlabelled (eight screws would bury the picture). */
const labelFor = (arm: ArmData, p: Placement, vis: Visibility): string | undefined =>
  vis === 'current' && p.kind !== 'fastener' ? (arm.parts[p.id]?.name ?? p.name) : undefined;
/** Camera framing: this step's parts with context, or everything built so far. */
type FitMode = 'step' | 'arm';
const LEGEND: [Visibility, string][] = [
  ['current', 'This step'],
  ['installed', 'Built'],
  ['future', 'Later'],
];

function Part({
  p,
  vis,
  explode,
  centre,
  ghost,
  onPick,
  url,
  label,
  dragging,
}: {
  p: Placement;
  vis: Visibility;
  explode: number;
  centre: THREE.Vector3;
  ghost: boolean;
  onPick: (p: Placement) => void;
  url: string;
  label?: string;
  dragging: boolean;
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
  // Edge lines at a 25° crease threshold: flat-shaded printed parts read as blobs without them.
  const edges = useMemo(() => (geom ? new THREE.EdgesGeometry(geom, 25) : undefined), [geom]);
  // label anchor: top-centre of the part's bounding box, in the placed frame
  const anchor = useMemo(() => {
    if (!geom) return null;
    geom.computeBoundingBox();
    const b = geom.boundingBox!;
    const top = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
    return top.multiply(scale).applyQuaternion(quat).add(pos);
  }, [geom, pos, quat, scale]);
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
      {edges && vis !== 'future' && (
        <lineSegments
          geometry={edges}
          position={pos}
          quaternion={quat}
          scale={scale}
          raycast={() => null}
        >
          <lineBasicMaterial color={EDGE} transparent opacity={vis === 'current' ? 0.75 : 0.45} />
        </lineSegments>
      )}
      {label && anchor && !dragging && (
        <Html position={anchor} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <span className="lbl3d">{label}</span>
        </Html>
      )}
    </group>
  );
}

/** Frame the built-so-far group once its meshes exist (Bounds would fit before world matrices update). */
function FitCamera({
  target,
  k,
  fit,
  mode,
}: {
  target: React.RefObject<THREE.Group | null>;
  k: number;
  fit: number;
  mode: FitMode;
}) {
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
    // "step" frames this step's parts (with a wider margin for context); "arm" frames everything built.
    const collect = (want: (vis: string) => boolean) => {
      const box = new THREE.Box3();
      g.traverse((o) => {
        const mesh = o as THREE.Mesh & { isLine2?: boolean };
        // Line2 (cables) extends Mesh with a unit quad geometry: never let it into the fit
        if (mesh.isMesh && !mesh.isLine2 && mesh.userData.vis && want(mesh.userData.vis))
          box.expandByObject(mesh, true);
      });
      return box;
    };
    let box = mode === 'step' ? collect((v) => v === 'current') : new THREE.Box3();
    if (box.isEmpty()) box = collect((v) => v !== 'future');
    const margin = mode === 'step' ? 2.1 : 1.15;
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
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(cam.fov) / 2)) * margin;
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
  }, [target, k, fit, mode, camera, controls, invalidate]);
  return null;
}

/**
 * OrbitControls sets touch-action: none on the canvas, which turns a phone's vertical swipe into a
 * rotate and traps the page scroll under a 55vh canvas. pan-y gives the swipe back to the page;
 * a sideways drag still rotates and a pinch still zooms.
 */
function TouchPolicy() {
  const { gl, controls } = useThree();
  useEffect(() => {
    gl.domElement.style.touchAction = 'pan-y';
  }, [gl, controls]);
  return null;
}

/**
 * Keyboard orbit on the focusable canvas wrapper: arrows turn, +/- zoom, Home re-frames. Works on
 * the camera and the OrbitControls target directly, so it needs no private control internals.
 */
function KeyOrbit({ onHome }: { onHome: () => void }) {
  const { gl, camera, controls, invalidate } = useThree();
  useEffect(() => {
    // The focusable element is the Canvas root (role=img), two levels above the canvas.
    const root =
      (gl.domElement.closest('[role="img"]') as HTMLElement | null) ?? gl.domElement.parentElement;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      const c = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
      if (!c) return;
      let dTheta = 0;
      let dPhi = 0;
      let zoom = 1;
      switch (e.key) {
        case 'ArrowLeft':
          dTheta = 0.15;
          break;
        case 'ArrowRight':
          dTheta = -0.15;
          break;
        case 'ArrowUp':
          dPhi = -0.1;
          break;
        case 'ArrowDown':
          dPhi = 0.1;
          break;
        case '+':
        case '=':
          zoom = 0.85;
          break;
        case '-':
          zoom = 1.18;
          break;
        case 'Home':
          onHome();
          e.preventDefault();
          return;
        default:
          return;
      }
      e.preventDefault();
      const offset = camera.position.clone().sub(c.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      sph.theta += dTheta;
      sph.phi = THREE.MathUtils.clamp(sph.phi + dPhi, 0.05, Math.PI - 0.05);
      sph.radius *= zoom;
      camera.position.copy(c.target).add(new THREE.Vector3().setFromSpherical(sph));
      camera.lookAt(c.target);
      c.update();
      invalidate();
    };
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, [gl, camera, controls, invalidate, onHome]);
  return null;
}

function Scene({
  arm,
  placements,
  k,
  fit,
  explode,
  ghost,
  onPick,
  base,
  dragging,
  onDrag,
  mode,
}: {
  arm: ArmData;
  placements: Placement[];
  k: number;
  fit: number;
  explode: number;
  ghost: boolean;
  onPick: (p: Placement) => void;
  base: string;
  dragging: boolean;
  onDrag: (d: boolean) => void;
  mode: FitMode;
}) {
  const posOf = (p: Placement) =>
    new THREE.Vector3().setFromMatrixPosition(
      new THREE.Matrix4().fromArray(p.transform).transpose(),
    );
  // Assembly centroid (fallback) and the centres of everything already built at this step.
  const { centre, installed } = useMemo(() => {
    const c = new THREE.Vector3();
    let n = 0;
    const installed: THREE.Vector3[] = [];
    for (const p of placements) {
      if (p.kind === 'cable') continue;
      const pos = posOf(p);
      if (p.kind === 'part') {
        c.add(pos);
        n++;
      }
      if (visibility(p, arm.steps, k, arm.assembly) === 'installed') installed.push(pos);
    }
    return { centre: n ? c.divideScalar(n) : c, installed };
  }, [placements, arm, k]);
  /** Explode away from the nearest built part (the host), not the whole assembly's centroid. */
  const hostFor = (p: Placement, vis: Visibility): THREE.Vector3 => {
    if (vis !== 'current' || installed.length === 0) return centre;
    const pos = posOf(p);
    let best = installed[0];
    let d = Infinity;
    for (const c of installed) {
      const dd = c.distanceToSquared(pos);
      if (dd > 1e-9 && dd < d) {
        d = dd;
        best = c;
      }
    }
    return best;
  };
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
      <FitCamera target={built} k={k} fit={fit} mode={mode} />
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
              centre={hostFor(p, vis)}
              ghost={ghost}
              onPick={onPick}
              url={`${base}so101/geometry/${p.mesh}`}
              label={labelFor(arm, p, vis)}
              dragging={dragging}
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
              centre={hostFor(p, vis)}
              ghost={ghost}
              onPick={onPick}
              url={`${base}so101/geometry/${p.mesh}`}
              label={labelFor(arm, p, vis)}
              dragging={dragging}
            />
          );
        })}
      </group>
      <Grid
        args={[0.6, 0.6]}
        cellSize={0.02}
        sectionSize={0.1}
        cellColor={COLORS.future}
        sectionColor={COLORS.installed}
        fadeDistance={1.5}
        position={[0, -0.001, 0]}
      />
      <OrbitControls
        makeDefault
        enableDamping={false}
        onStart={() => onDrag(true)}
        onEnd={() => onDrag(false)}
      />
      <TouchPolicy />
    </>
  );
}

export default function Viewer({ assembly, stepId, base, embed }: Props) {
  const [arm, setArm] = useState<ArmData | null>(null);
  const [placements, setPlacements] = useState<Placement[] | null>(null);
  const [explode, setExplode] = useState(0);
  const [ghost, setGhost] = useState(true);
  const [fit, setFit] = useState(0);
  const [mode, setMode] = useState<FitMode>('step');
  const [dragging, setDragging] = useState(false);
  const progress = useProgress();
  const [picked, setPicked] = useState<Placement | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    readColors();
    Promise.all([
      fetch(`${base}so101/data/${assembly}.json`).then((r) => r.json()),
      fetch(`${base}so101/geometry/placements.json`).then((r) => r.json()),
    ])
      .then(([a, g]) => {
        setArm(a);
        setPlacements((g.placements as Placement[]).filter((p) => p.assembly.includes(assembly)));
      })
      .catch((e) => {
        console.error('so101 island', e);
        setError(String(e));
      });
  }, [assembly, base]);
  const k = arm ? arm.steps.findIndex((s) => s.id === stepId) : -1;
  if (error)
    return (
      <p className="fallback" role="status">
        The 3D view did not load. Every instruction is in the text; reload the page to try again.
      </p>
    );
  if (!arm || !placements || k < 0)
    return (
      <p className="fallback" aria-live="polite">
        Loading 3D view…
      </p>
    );
  // preload the meshes of the next step
  const next = arm.steps[k + 1];
  if (next)
    for (const p of placements)
      if (visibility(p, arm.steps, k + 1, assembly) === 'current')
        useGLTF.preload(`${base}so101/geometry/${p.mesh}`);
  const currentNames = placements
    .filter((p) => p.kind !== 'cable' && visibility(p, arm.steps, k, assembly) === 'current')
    .map((p) => arm.parts[p.id]?.name ?? p.name);
  const label = `3D view of step ${stepId}. Highlighted: ${[...new Set(currentNames)].join(', ') || 'nothing yet'}. Drag sideways to turn, pinch or scroll to zoom.`;
  const explodeText =
    explode === 0
      ? 'together'
      : explode >= 0.99
        ? 'fully apart'
        : `${Math.round(explode * 100)}% apart`;
  return (
    <>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ position: [0.35, 0.3, 0.45], near: 0.005, far: 10, fov: 40 }}
        style={{ height: embed ? '100vh' : '55vh', minHeight: 320 }}
        onPointerMissed={() => setPicked(null)}
        role="img"
        aria-label={label}
        tabIndex={0}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - Home"
      >
        <KeyOrbit onHome={() => setFit((n) => n + 1)} />
        <Suspense fallback={null}>
          <Scene
            arm={arm}
            placements={placements}
            k={k}
            fit={fit}
            explode={explode}
            ghost={ghost}
            onPick={setPicked}
            base={base}
            dragging={dragging}
            onDrag={setDragging}
            mode={mode}
          />
        </Suspense>
      </Canvas>
      {progress.active && (
        <div className="loading" role="status" aria-live="polite">
          Loading parts… {progress.loaded} of {progress.total}
        </div>
      )}
      <div className="legend" aria-hidden="true">
        {LEGEND.map(([vis, text]) => (
          <span key={vis} className={`key ${vis}`}>
            <i style={{ background: COLORS[vis] }} />
            {text}
          </span>
        ))}
      </div>
      <div className="views" role="group" aria-label="Camera">
        <button
          type="button"
          className="reset"
          aria-pressed={mode === 'step'}
          onClick={() => {
            setExplode(0);
            setMode('step');
            setFit((n) => n + 1);
          }}
          title="Frame this step's parts"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M2 7a5 5 0 1 0 1.5-3.5M2 2v3h3" />
          </svg>
          <span>Frame step</span>
        </button>
        <button
          type="button"
          className="reset"
          aria-pressed={mode === 'arm'}
          onClick={() => {
            setExplode(0);
            setMode('arm');
            setFit((n) => n + 1);
          }}
          title="Show everything built so far"
        >
          <span>Whole arm</span>
        </button>
      </div>
      <div className="hud">
        <label htmlFor="so101-explode">
          Pull apart{' '}
          <input
            id="so101-explode"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={explode}
            onChange={(e) => setExplode(Number(e.target.value))}
            aria-valuetext={explodeText}
          />
        </label>
        <label htmlFor="so101-ghost">
          <input
            id="so101-ghost"
            type="checkbox"
            checked={ghost}
            onChange={(e) => setGhost(e.target.checked)}
          />{' '}
          Show later parts
        </label>
      </div>
      {picked && (
        <div className="pick" role="status">
          <strong>{arm.parts[picked.id]?.name ?? picked.id}</strong>{' '}
          {picked.approximation ? <span className="flag approximation">approximation</span> : null}
          <div>
            <a href={`${base}so101/parts/${picked.id}/`}>BOM entry and sources →</a>
          </div>
        </div>
      )}
    </>
  );
}
