"use client";

import { useRef, useMemo, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Points, PointMaterial, Float, Sphere, MeshDistortMaterial, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// ─────────────────────────────────────────────────
// Particle System - 떠다니는 입자들
// ─────────────────────────────────────────────────
function ParticleField({ count = 2000 }) {
  const ref = useRef<THREE.Points>(null);
  const { mouse } = useThree();

  // 입자 위치 생성 (구 형태로 분포)
  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const color1 = new THREE.Color("#8b5cf6"); // Primary purple
    const color2 = new THREE.Color("#3b82f6"); // Blue
    const color3 = new THREE.Color("#06b6d4"); // Cyan

    for (let i = 0; i < count; i++) {
      // 구 형태로 분포
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 5 + Math.random() * 15;

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      // 랜덤 색상
      const colorChoice = Math.random();
      let color: THREE.Color;
      if (colorChoice < 0.4) color = color1;
      else if (colorChoice < 0.7) color = color2;
      else color = color3;

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    return { positions, colors };
  }, [count]);

  // 애니메이션
  useFrame((state) => {
    if (!ref.current) return;

    // 천천히 회전
    ref.current.rotation.x = state.clock.getElapsedTime() * 0.02;
    ref.current.rotation.y = state.clock.getElapsedTime() * 0.03;

    // 마우스에 따른 미세한 움직임
    ref.current.rotation.x += mouse.y * 0.01;
    ref.current.rotation.y += mouse.x * 0.01;
  });

  return (
    <Points ref={ref} positions={particles.positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        vertexColors
        size={0.05}
        sizeAttenuation={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

// ─────────────────────────────────────────────────
// Connection Lines - 네트워크 연결선
// ─────────────────────────────────────────────────
function ConnectionLines({ nodeCount = 20 }) {
  const linesRef = useRef<THREE.Group>(null);

  const { nodes, lines } = useMemo(() => {
    const nodes: THREE.Vector3[] = [];
    const lines: [THREE.Vector3, THREE.Vector3][] = [];

    // 노드 생성
    for (let i = 0; i < nodeCount; i++) {
      nodes.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 10
        )
      );
    }

    // 가까운 노드끼리 연결
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const distance = nodes[i].distanceTo(nodes[j]);
        if (distance < 5) {
          lines.push([nodes[i], nodes[j]]);
        }
      }
    }

    return { nodes, lines };
  }, [nodeCount]);

  useFrame((state) => {
    if (!linesRef.current) return;
    linesRef.current.rotation.y = Math.sin(state.clock.getElapsedTime() * 0.1) * 0.1;
  });

  return (
    <group ref={linesRef}>
      {/* 연결선 */}
      {lines.map((line, i) => {
        const positions = new Float32Array([
          line[0].x, line[0].y, line[0].z,
          line[1].x, line[1].y, line[1].z,
        ]);
        return (
          <line key={`line-${i}`}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[positions, 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial
              color="#8b5cf6"
              transparent
              opacity={0.15}
              blending={THREE.AdditiveBlending}
            />
          </line>
        );
      })}

      {/* 노드 */}
      {nodes.map((node, i) => (
        <Float
          key={`node-${i}`}
          speed={1}
          rotationIntensity={0}
          floatIntensity={0.5}
          floatingRange={[0, 0.3]}
        >
          <mesh position={node}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshBasicMaterial
              color="#8b5cf6"
              transparent
              opacity={0.6}
            />
          </mesh>
        </Float>
      ))}
    </group>
  );
}

// ─────────────────────────────────────────────────
// Floating Orbs - 부유하는 구체들
// ─────────────────────────────────────────────────
function FloatingOrbs() {
  const orbs = useMemo(() => {
    return [
      { position: [-6, 2, -5] as [number, number, number], color: "#8b5cf6", size: 1.5, speed: 1 },
      { position: [5, -3, -8] as [number, number, number], color: "#3b82f6", size: 2, speed: 0.8 },
      { position: [0, 4, -10] as [number, number, number], color: "#06b6d4", size: 1.2, speed: 1.2 },
      { position: [-4, -2, -6] as [number, number, number], color: "#ec4899", size: 0.8, speed: 1.5 },
    ];
  }, []);

  return (
    <>
      {orbs.map((orb, i) => (
        <Float
          key={i}
          speed={orb.speed}
          rotationIntensity={0.5}
          floatIntensity={2}
          floatingRange={[-0.5, 0.5]}
        >
          <Sphere args={[orb.size, 32, 32]} position={orb.position}>
            <MeshDistortMaterial
              color={orb.color}
              transparent
              opacity={0.15}
              distort={0.4}
              speed={2}
              roughness={0}
            />
          </Sphere>
        </Float>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────
// Camera Controller - 마우스 따라 카메라 이동
// ─────────────────────────────────────────────────
function CameraController() {
  const { camera, mouse } = useThree();

  useFrame(() => {
    // 마우스에 따른 미세한 카메라 이동
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, mouse.x * 2, 0.02);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, mouse.y * 2, 0.02);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// ─────────────────────────────────────────────────
// Background Gradient Plane
// ─────────────────────────────────────────────────
function BackgroundPlane() {
  const meshRef = useRef<THREE.Mesh>(null);

  const gradientMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        color1: { value: new THREE.Color("#0a0a1f") },
        color2: { value: new THREE.Color("#050510") },
        color3: { value: new THREE.Color("#0a0a1f") },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color1;
        uniform vec3 color2;
        uniform vec3 color3;
        varying vec2 vUv;
        void main() {
          vec3 color;
          if (vUv.y < 0.5) {
            color = mix(color1, color2, vUv.y * 2.0);
          } else {
            color = mix(color2, color3, (vUv.y - 0.5) * 2.0);
          }
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      depthWrite: false,
    });
  }, []);

  return (
    <mesh ref={meshRef} position={[0, 0, -30]}>
      <planeGeometry args={[100, 100]} />
      <primitive object={gradientMaterial} attach="material" />
    </mesh>
  );
}

// ─────────────────────────────────────────────────
// Main Scene
// ─────────────────────────────────────────────────
function Scene() {
  return (
    <>
      {/* 배경 */}
      <BackgroundPlane />

      {/* 카메라 컨트롤 */}
      <CameraController />

      {/* 파티클 */}
      <ParticleField count={1500} />

      {/* 네트워크 연결선 */}
      <ConnectionLines nodeCount={25} />

      {/* 부유 구체 */}
      <FloatingOrbs />

      {/* 안개 효과 */}
      <fog attach="fog" args={["#050510", 10, 30]} />

      {/* 조명 */}
      <ambientLight intensity={0.1} />
      <pointLight position={[10, 10, 10]} intensity={0.3} color="#8b5cf6" />
      <pointLight position={[-10, -10, -10]} intensity={0.2} color="#3b82f6" />
    </>
  );
}

// ─────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────
interface ThreeJSBackgroundProps {
  className?: string;
}

export default function ThreeJSBackground({ className }: ThreeJSBackgroundProps) {
  const [isClient, setIsClient] = useState(false);

  // 클라이언트 사이드에서만 렌더링
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    // SSR fallback - 기본 그라데이션
    return (
      <div
        className={`fixed inset-0 z-0 bg-gradient-to-b from-[#0a0a1f] via-[#050510] to-[#0a0a1f] ${className}`}
      />
    );
  }

  return (
    <div className={`fixed inset-0 z-0 ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 15], fov: 60 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        dpr={[1, 2]}
        style={{ background: "#050510" }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
