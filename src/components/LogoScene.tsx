import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import outlines from '@/assets/logo-shapes.json';

function tokenColor(token: string) {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return new THREE.Color();
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}

function Model({ running, onReady }: { running: boolean; onReady: () => void }) {
  const group = useRef<THREE.Group>(null);
  const time = useRef(0);
  const { camera, size } = useThree();
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const primary = useMemo(() => tokenColor('--primary'), []);
  const foreground = useMemo(() => tokenColor('--foreground'), []);
  const geometries = useMemo(() => outlines.paths.map(points => {
    const shape = new THREE.Shape();
    points.forEach(([x = 0, y = 0], i) => {
      const px = (x - outlines.width / 2) / 100, py = (outlines.height / 2 - y) / 100;
      if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
    });
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .18, bevelEnabled: true, bevelThickness: .025, bevelSize: .02, bevelSegments: 4, curveSegments: 32 });
    geometry.translate(0, 0, -.09); return geometry;
  }), []);
  useEffect(() => {
    camera.position.z = size.width < size.height ? 11 / (size.width / size.height) : 12;
    camera.updateProjectionMatrix();
  }, [camera, size]);
  useEffect(() => { time.current = 0; }, [running]);
  useEffect(() => { onReady(); return () => geometries.forEach(g => g.dispose()); }, [onReady, geometries]);
  useFrame((_, delta) => {
    if (!group.current) return;
    if (running) time.current += Math.min(delta, .05);
    const fraction = Math.min(time.current / 3.3, 1);
    const eased = fraction * fraction * (3 - 2 * fraction);
    group.current.rotation.y = running && !reduced ? eased * Math.PI * 4 : 0;
  });
  return <>
    <ambientLight intensity={.8} />
    <directionalLight position={[4, 5, 7]} intensity={2} color={foreground} />
    <Environment resolution={128}>
      <Lightformer intensity={2} position={[0, 5, 4]} scale={[10, 4, 1]} color={foreground} />
      <Lightformer intensity={1} position={[-5, 1, -2]} rotation-y={Math.PI / 2} scale={[12, 1, 1]} color={primary} />
    </Environment>
    <group ref={group} scale={.5}>
      {geometries.map((geometry, i) => <mesh key={i} geometry={geometry}><meshStandardMaterial color={primary} metalness={.25} roughness={.3} /></mesh>)}
      <mesh position={[0, (outlines.height / 2 - 54) / 100, 0]}><sphereGeometry args={[.365, 64, 48]} /><meshStandardMaterial color={foreground} metalness={.15} roughness={.25} /></mesh>
    </group>
  </>;
}

export default function LogoScene(props: { running: boolean; onReady: () => void }) {
  return <div className="absolute inset-0" aria-hidden="true"><Canvas frameloop={props.running ? 'always' : 'demand'} camera={{ position: [0, 0, 12], fov: 34 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}><Model {...props} /></Canvas></div>;
}
