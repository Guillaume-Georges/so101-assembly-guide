import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import data from './generated/data.json';

// Phase 0 shell: proves data → JSON → viewer and the R3F toolchain build.
// Step navigation, highlighting, explode, side panel: Phase 3.
export function App() {
  const steps = Object.values(data.assemblies).reduce((n, s) => n + s.length, 0);
  return (
    <div className="app">
      <header>
        <h1>SO-101 Assembly Guide</h1>
        <p>
          {data.parts.length} parts · {steps} steps · data @ {data.commit}
        </p>
      </header>
      <Canvas camera={{ position: [0.4, 0.3, 0.4], near: 0.01, far: 10 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[1, 2, 1]} />
        <Grid args={[1, 1]} cellSize={0.01} sectionSize={0.1} fadeDistance={2} />
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
