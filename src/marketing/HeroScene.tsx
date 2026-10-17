import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

/* ── Brand palette (mirror of the CSS tokens) ─────────────────── */
const GREEN = "#19D186";
const GREEN_HI = "#1CE08E";
const TEAL = "#2DD4BF";
const CYAN = "#38BDF8";
const BLUE = "#1F77EF";

/* Node tints: emerald-dominant, turquoise/cyan accents, rare blue. */
const NODE_COLORS = ["#CFFBE8", GREEN_HI, TEAL, CYAN, BLUE] as const;

const SHELL_R = 2.55;

type NodeDef = { pos: THREE.Vector3; group: number; phase: number };
type Edge = { curve: THREE.QuadraticBezierCurve3; bright: boolean };

/* Deterministic PRNG so the topology is stable across mounts. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickGroup(r: number) {
  if (r < 0.44) return 0;
  if (r < 0.64) return 1;
  if (r < 0.79) return 2;
  if (r < 0.9) return 3;
  return 4;
}

/* Fibonacci sphere shell — the globe of nodes. */
function buildNodes(count: number, seed: number): NodeDef[] {
  const rnd = mulberry32(seed);
  const out: NodeDef[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const jitter = 1 + (rnd() - 0.5) * 0.16;
    out.push({
      pos: new THREE.Vector3(
        Math.cos(theta) * rad * SHELL_R * jitter,
        y * SHELL_R * 0.86 * jitter,
        Math.sin(theta) * rad * SHELL_R * jitter,
      ),
      group: pickGroup(rnd()),
      phase: rnd() * Math.PI * 2,
    });
  }
  return out;
}

/* Nearest-neighbour links, drawn as gently bowed curves, plus bright
   spokes radiating from the core shield. */
function buildEdges(nodes: NodeDef[]) {
  const edges: Edge[] = [];
  const pts: number[] = [];
  const seen = new Set<string>();
  const SEG = 12;

  const add = (a: THREE.Vector3, b: THREE.Vector3, bright: boolean, dedupe: boolean) => {
    if (dedupe) {
      const key = [a.x, a.y, a.z, b.x, b.y, b.z].map((v) => Math.round(v * 20)).join(",");
      if (seen.has(key)) return;
      seen.add(key);
    }
    const mid = a.clone().add(b).multiplyScalar(0.5);
    if (mid.lengthSq() > 1e-6) {
      mid.addScaledVector(mid.clone().normalize(), mid.length() * 0.16 + 0.08);
    }
    const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    const p = curve.getPoints(SEG);
    for (let k = 0; k < SEG; k++) {
      pts.push(p[k].x, p[k].y, p[k].z, p[k + 1].x, p[k + 1].y, p[k + 1].z);
    }
    edges.push({ curve, bright });
  };

  const link = 3;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i].pos;
    const near = nodes
      .map((n, j) => ({ j, d: a.distanceTo(n.pos) }))
      .filter((x) => x.j !== i)
      .sort((x, y) => x.d - y.d)
      .slice(0, link);
    for (const { j, d } of near) {
      if (j < i || d > SHELL_R * 1.2) continue;
      add(a, nodes[j].pos, false, true);
    }
  }

  const step = Math.max(1, Math.floor(nodes.length / 9));
  for (let i = 0, n = 0; i < nodes.length && n < 9; i += step, n++) {
    add(new THREE.Vector3(0, 0, 0), nodes[i].pos, true, false);
  }

  return { segs: new Float32Array(pts), edges };
}

/* A soft radial sprite used for the aura behind the shield. */
function makeGlowTexture() {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(28,224,142,0.55)");
  g.addColorStop(0.45, "rgba(25,209,134,0.18)");
  g.addColorStop(1, "rgba(25,209,134,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* The "C" glyph baked to a texture, kept local (no CDN font fetch). */
function makeCTexture() {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = "#f2fff9";
  ctx.font = "700 200px Inter, Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("C", s / 2, s / 2 + 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* Central floating hexagonal shield with the CallGuard "C". */
function Shield({ paused }: { paused: boolean }) {
  const group = useRef<THREE.Group>(null);
  const cTex = useMemo(() => (typeof document === "undefined" ? null : makeCTexture()), []);
  const glowTex = useMemo(() => (typeof document === "undefined" ? null : makeGlowTexture()), []);
  useEffect(() => () => { cTex?.dispose(); glowTex?.dispose(); }, [cTex, glowTex]);

  const hexEdge = useMemo(() => {
    const r = 0.99;
    const arr: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 3;
      const b = Math.PI / 2 + ((i + 1) * Math.PI) / 3;
      arr.push(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(b) * r, Math.sin(b) * r, 0);
    }
    return new Float32Array(arr);
  }, []);

  useFrame(({ clock }) => {
    if (paused || !group.current) return;
    const t = clock.getElapsedTime();
    group.current.position.y = Math.sin(t * 0.6) * 0.06;
    group.current.rotation.z = Math.sin(t * 0.25) * 0.04;
  });

  return (
    <group ref={group}>
      {glowTex && (
        <sprite scale={[4.6, 4.6, 1]} position={[0, 0, -0.35]}>
          <spriteMaterial map={glowTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      )}

      {/* hexagon prism body */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.92, 0.92, 0.3, 6]} />
        <meshStandardMaterial color="#08241b" emissive={GREEN} emissiveIntensity={0.25} metalness={0.6} roughness={0.35} />
      </mesh>
      {/* glowing beveled rim */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.99, 0.99, 0.34, 6, 1, true]} />
        <meshBasicMaterial color={GREEN_HI} transparent opacity={0.5} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {/* dark inset plaque so the "C" reads crisply */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.16]}>
        <cylinderGeometry args={[0.8, 0.8, 0.02, 6]} />
        <meshBasicMaterial color="#04120c" toneMapped={false} />
      </mesh>
      {/* crisp outline */}
      <lineSegments position={[0, 0, 0.19]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[hexEdge, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={GREEN_HI} toneMapped={false} transparent opacity={0.9} />
      </lineSegments>

      {cTex && (
        <mesh position={[0, 0, 0.18]}>
          <planeGeometry args={[0.82, 0.82]} />
          <meshBasicMaterial map={cTex} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/* A floating wireframe cube with a faint glowing core. */
function FloatingCube({
  position, color, size = 0.5, speed = 1,
}: { position: [number, number, number]; color: string; size?: number; speed?: number }) {
  const ref = useRef<THREE.Group>(null);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)), [size]);
  useEffect(() => () => edges.dispose(), [edges]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * speed;
    const g = ref.current;
    if (!g) return;
    g.rotation.x = t * 0.4;
    g.rotation.y = t * 0.55;
    g.position.y = position[1] + Math.sin(t * 0.8) * 0.12;
  });
  return (
    <group ref={ref} position={position}>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={color} toneMapped={false} transparent opacity={0.75} />
      </lineSegments>
      <mesh>
        <boxGeometry args={[size * 0.82, size * 0.82, size * 0.82]} />
        <meshBasicMaterial color={color} transparent opacity={0.08} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* A larger glowing hexagonal node (the network "hub" markers). */
function FloatingHex({
  position, color, radius = 0.26, speed = 1,
}: { position: [number, number, number]; color: string; radius?: number; speed?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * speed;
    const g = ref.current;
    if (!g) return;
    g.rotation.y = t * 0.5;
    g.rotation.x = Math.sin(t * 0.6) * 0.2;
    g.position.y = position[1] + Math.sin(t * 0.9) * 0.1;
  });
  return (
    <group ref={ref} position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius, radius, radius * 0.5, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} metalness={0.4} roughness={0.35} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 1.5, radius * 1.5, radius * 0.4, 6, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* Light pulse travelling along a curved connection. */
function Pulse({
  curve, offset, speed = 0.35, size = 0.05,
}: { curve: THREE.QuadraticBezierCurve3; offset: number; speed?: number; size?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = (clock.getElapsedTime() * speed + offset) % 1;
    ref.current?.position.copy(curve.getPoint(t));
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[size, 10, 10]} />
      <meshBasicMaterial color={GREEN_HI} toneMapped={false} />
    </mesh>
  );
}

/* Distant drifting particles for atmosphere. */
function Particles() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const rnd = mulberry32(7);
    const n = 180;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 5.5 + rnd() * 4.5;
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

const LABELS: { text: string; pos: [number, number, number] }[] = [
  { text: "AI Agents", pos: [-2.4, 1.5, 0.7] },
  { text: "Providers", pos: [2.3, 1.3, 0.3] },
  { text: "Callers", pos: [-2.2, -1.75, 0.7] },
];

function Scene({ count, paused }: { count: number; paused: boolean }) {
  const { nodes, segs, edges, groups } = useMemo(() => {
    const nodes = buildNodes(count, 11);
    const { segs, edges } = buildEdges(nodes);
    const groups: number[][] = NODE_COLORS.map(() => []);
    nodes.forEach((n, i) => groups[n.group].push(i));
    return { nodes, segs, edges, groups };
  }, [count]);

  const halo = useMemo(() => (typeof document === "undefined" ? null : makeGlowTexture()), []);
  useEffect(() => () => halo?.dispose(), [halo]);

  const group = useRef<THREE.Group>(null);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const { pointer, camera } = useThree();
  const zoom = useRef(0);

  useEffect(() => {
    const onScroll = () => { zoom.current = Math.min(1, window.scrollY / 600); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const pulses = useMemo(() => {
    const bright = edges.filter((e) => e.bright);
    const links = edges.filter((e) => !e.bright);
    const step = Math.max(1, Math.floor(links.length / 6));
    return [...bright.slice(0, 5), ...links.filter((_, i) => i % step === 0).slice(0, 6)];
  }, [edges]);

  useFrame(({ clock }) => {
    if (paused) return;
    const t = clock.getElapsedTime();
    if (group.current) {
      group.current.rotation.y = t * 0.06;
      group.current.rotation.x = Math.sin(t * 0.12) * 0.05;
    }
    const place = (mesh: THREE.InstancedMesh | null, idx: number[]) => {
      if (!mesh) return;
      idx.forEach((ni, k) => {
        const n = nodes[ni];
        dummy.position.copy(n.pos);
        dummy.rotation.set(t * 0.4 + n.phase, t * 0.5 + n.phase, 0);
        const s = 0.85 + Math.sin(t * 1.2 + n.phase) * 0.12;
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mesh.setMatrixAt(k, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    groups.forEach((idx, gi) => place(meshes.current[gi], idx));
    camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.03;
    camera.position.y += (pointer.y * 0.4 - camera.position.y) * 0.03;
    const z = 7.2 + zoom.current * 1.8;
    camera.position.z += (z - camera.position.z) * 0.06;
    camera.lookAt(0, 0, 0);
  });

  return (
    <group ref={group}>
      {halo && (
        <sprite scale={[9.5, 9.5, 1]} position={[0, 0, -1.2]}>
          <spriteMaterial map={halo} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      )}

      <Shield paused={paused} />

      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[segs, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={GREEN} transparent opacity={0.2} toneMapped={false} />
      </lineSegments>

      {groups.map((idx, gi) =>
        idx.length ? (
          <instancedMesh
            key={gi}
            ref={(el) => { meshes.current[gi] = el; }}
            args={[undefined, undefined, idx.length]}
          >
            <octahedronGeometry args={[0.085, 0]} />
            <meshStandardMaterial
              color={NODE_COLORS[gi]}
              emissive={NODE_COLORS[gi]}
              emissiveIntensity={1.1}
              metalness={0.4}
              roughness={0.35}
            />
          </instancedMesh>
        ) : null,
      )}

      {/* floating geometry around the network */}
      <FloatingHex position={[-1.75, 1.55, 0.35]} color={GREEN_HI} radius={0.28} speed={1.1} />
      <FloatingHex position={[1.6, 0.5, 0.4]} color={GREEN} radius={0.22} speed={0.9} />
      <FloatingHex position={[0.25, -1.9, 0.5]} color={GREEN_HI} radius={0.2} speed={1.3} />
      <FloatingCube position={[1.75, -1.05, 0.6]} color={BLUE} size={0.5} speed={1} />
      <FloatingCube position={[-1.4, -0.8, 1.1]} color={CYAN} size={0.42} speed={1.2} />
      <FloatingCube position={[1.85, 1.65, -0.3]} color={CYAN} size={0.36} speed={0.8} />

      {pulses.map((e, k) => (
        <Pulse key={k} curve={e.curve} offset={k / pulses.length} />
      ))}

      <Particles />

      {LABELS.map((l) => (
        <Html key={l.text} position={l.pos} center distanceFactor={9} zIndexRange={[10, 0]}>
          <span className="viz3d-tag"><i className="viz3d-tag__dot" />{l.text}</span>
        </Html>
      ))}

      <ambientLight intensity={0.5} />
      <pointLight position={[0, 1.2, 2.4]} intensity={1.5} color={GREEN} />
      <pointLight position={[5, 5, 5]} intensity={1.1} color="#ffffff" />
      <pointLight position={[-4, -3, 3]} intensity={0.7} color={CYAN} />
    </group>
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
