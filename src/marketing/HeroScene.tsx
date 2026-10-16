import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

/* CallGuard brand colors (mirror of the CSS tokens). */
const GREEN = "#19D186";
const GREEN_HI = "#1CE08E";
const BLUE = "#1F77EF";

type NodeDef = { pos: THREE.Vector3; green: boolean; phase: number };

/* Deterministic topology so the scene is stable across mounts. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildNodes(count: number, seed: number): NodeDef[] {
  const rnd = mulberry32(seed);
  const out: NodeDef[] = [];
  for (let i = 0; i < count; i++) {
    const a = i * 2.399963 + rnd() * 0.6;
    const t = Math.pow(i / count, 0.6);
    const r = 1.6 + t * 3.0 + rnd() * 0.35;
    out.push({
      pos: new THREE.Vector3(
        Math.cos(a) * r,
        (rnd() - 0.5) * 2.1,
        Math.sin(a) * r,
      ),
      green: rnd() > 0.38,
      phase: rnd() * Math.PI * 2,
    });
  }
  return out;
}

/* Edges between nearby nodes + a few spokes to the core. */
function buildEdges(nodes: NodeDef[]) {
  const segs: number[] = [];
  const pairs: [number, number][] = [];
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i].pos;
    const near = nodes
      .map((n, j) => ({ j, d: a.distanceTo(n.pos) }))
      .filter((x) => x.j !== i)
      .sort((x, y) => x.d - y.d)
      .slice(0, 2);
    for (const { j } of near) {
      if (j < i) continue;
      segs.push(a.x, a.y, a.z, nodes[j].pos.x, nodes[j].pos.y, nodes[j].pos.z);
      pairs.push([i, j]);
    }
  }
  return { segs: new Float32Array(segs), pairs };
}

const LABELS: { text: string; pos: [number, number, number] }[] = [
  { text: "AI Agents", pos: [-2.5, 1.5, 1.2] },
  { text: "Providers", pos: [2.6, 1.2, -1.0] },
  { text: "Callers", pos: [0.4, -1.9, 2.0] },
];

function Pulse({ from, to, offset }: { from: THREE.Vector3; to: THREE.Vector3; offset: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = (clock.getElapsedTime() * 0.35 + offset) % 1;
    const m = ref.current;
    if (m) m.position.lerpVectors(from, to, t);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.045, 10, 10]} />
      <meshBasicMaterial color={GREEN_HI} toneMapped={false} />
    </mesh>
  );
}

function Scene({ count, paused }: { count: number; paused: boolean }) {
  const { nodes, greenIdx, blueIdx, segs, pairs } = useMemo(() => {
    const nodes = buildNodes(count, 11);
    const { segs, pairs } = buildEdges(nodes);
    return {
      nodes,
      segs,
      pairs,
      greenIdx: nodes.map((n, i) => (n.green ? i : -1)).filter((i) => i >= 0),
      blueIdx: nodes.map((n, i) => (n.green ? -1 : i)).filter((i) => i >= 0),
    };
  }, [count]);

  const group = useRef<THREE.Group>(null);
  const green = useRef<THREE.InstancedMesh>(null);
  const blue = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const { pointer, camera } = useThree();
  const zoom = useRef(0);

  useEffect(() => {
    const onScroll = () => { zoom.current = Math.min(1, window.scrollY / 600); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const pulses = useMemo(
    () => pairs.filter((_, i) => i % Math.max(1, Math.floor(pairs.length / 7)) === 0).slice(0, 7),
    [pairs],
  );

  useFrame(({ clock }) => {
    if (paused) return;
    const t = clock.getElapsedTime();
    if (group.current) {
      group.current.rotation.y = t * 0.08;
      group.current.rotation.x = Math.sin(t * 0.15) * 0.06;
    }
    const place = (mesh: THREE.InstancedMesh | null, idx: number[]) => {
      if (!mesh) return;
      idx.forEach((ni, k) => {
        const n = nodes[ni];
        dummy.position.copy(n.pos);
        dummy.position.y += Math.sin(t * 0.7 + n.phase) * 0.06;
        dummy.rotation.set(t * 0.4 + n.phase, t * 0.5 + n.phase, 0);
        const s = 0.85 + Math.sin(t * 1.2 + n.phase) * 0.12;
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mesh.setMatrixAt(k, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    place(green.current, greenIdx);
    place(blue.current, blueIdx);
    // mouse parallax (eased)
    camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.03;
    camera.position.y += (pointer.y * 0.4 - camera.position.y) * 0.03;
    // slight zoom-out on scroll
    const z = 7.2 + zoom.current * 1.8;
    camera.position.z += (z - camera.position.z) * 0.06;
    camera.lookAt(0, 0, 0);
  });

  return (
    <group ref={group}>
      {/* core: emissive green hexagonal prism (the CallGuard "C") */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.92, 0.92, 0.34, 6]} />
        <meshStandardMaterial
          color={GREEN}
          emissive={GREEN}
          emissiveIntensity={1.6}
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.28, 1.28, 0.06, 6, 1, true]} />
        <meshBasicMaterial color={GREEN} transparent opacity={0.12} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      {/* edges */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[segs, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={GREEN} transparent opacity={0.22} toneMapped={false} />
      </lineSegments>

      {/* orbiting nodes (instanced) */}
      <instancedMesh ref={green} args={[undefined, undefined, greenIdx.length]}>
        <cylinderGeometry args={[0.075, 0.075, 0.12, 6]} />
        <meshStandardMaterial color={GREEN} emissive={GREEN} emissiveIntensity={0.9} metalness={0.4} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={blue} args={[undefined, undefined, blueIdx.length]}>
        <cylinderGeometry args={[0.07, 0.07, 0.11, 6]} />
        <meshStandardMaterial color={BLUE} emissive={BLUE} emissiveIntensity={0.8} metalness={0.4} roughness={0.4} />
      </instancedMesh>

      {/* light pulses along edges */}
      {pulses.map(([i, j], k) => (
        <Pulse key={k} from={nodes[i].pos} to={nodes[j].pos} offset={k / pulses.length} />
      ))}

      {/* background particles */}
      <Particles />

      {/* label chips */}
      {LABELS.map((l) => (
        <Html key={l.text} position={l.pos} center distanceFactor={9} zIndexRange={[10, 0]}>
          <span className="viz3d-tag"><i className="viz3d-tag__dot" />{l.text}</span>
        </Html>
      ))}

      <ambientLight intensity={0.5} />
      <pointLight position={[0, 0, 0]} intensity={2} color={GREEN} />
      <pointLight position={[5, 5, 5]} intensity={1.1} color="#ffffff" />

      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.35} luminanceSmoothing={0.3} mipmapBlur />
      </EffectComposer>
    </group>
  );
}

function Particles() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const rnd = mulberry32(7);
    const n = 260;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 5 + rnd() * 5;
      const th = rnd() * Math.PI * 2;
      const ph = Math.acos(2 * rnd() - 1);
      arr[i * 3] = r * Math.sin(ph) * Math.cos(th);
      arr[i * 3 + 1] = r * Math.cos(ph) * 0.6;
      arr[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    return arr;
  }, []);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.02;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[geo, 3]} />
      </bufferGeometry>
      <pointsMaterial color={GREEN} size={0.05} transparent opacity={0.5} sizeAttenuation toneMapped={false} />
    </points>
  );
}

export default function HeroScene({ paused = false, count = 48 }: { paused?: boolean; count?: number }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 7.2], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%" }}
      frameloop={paused ? "never" : "always"}
    >
      <Scene count={count} paused={paused} />
    </Canvas>
  );
}
