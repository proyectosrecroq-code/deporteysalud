import { useEffect, useRef } from 'react';
import outlines from '@/assets/logo-shapes.json';

export default function LogoScene({ running, onReady }: { running: boolean; onReady: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false;
    let cleanup = () => {};
    void import('three').then(THREE => {
      if (disposed) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
      renderer.setClearColor(0, 0);
      container.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
      camera.position.z = 12;
      const css = getComputedStyle(document.documentElement);
      // CSS tokens are converted by the browser to sRGB for Three.js.
      const color = (token: string) => {
        const probe = document.createElement('canvas').getContext('2d');
        if (!probe) return new THREE.Color();
        probe.fillStyle = css.getPropertyValue(token).trim();
        probe.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data;
        return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
      };
      const lime = new THREE.MeshStandardMaterial({ color: color('--primary'), metalness: .28, roughness: .24 });
      const white = new THREE.MeshStandardMaterial({ color: color('--foreground'), metalness: .2, roughness: .2 });
      const group = new THREE.Group();
      const geometries: InstanceType<typeof THREE.BufferGeometry>[] = [];
      for (const points of outlines.paths) {
        const shape = new THREE.Shape();
        points.forEach((point, index) => {
          const [x = 0, y = 0] = point;
          const px = (x - outlines.width / 2) / 100;
          const py = (outlines.height / 2 - y) / 100;
          if (index === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
        });
        shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: .18, bevelEnabled: true, bevelThickness: .025, bevelSize: .02, bevelSegments: 4, curveSegments: 32 });
        geometry.translate(0, 0, -.09);
        geometries.push(geometry);
        group.add(new THREE.Mesh(geometry, lime));
      }
      const head = new THREE.SphereGeometry(.365, 64, 48);
      geometries.push(head);
      const sphere = new THREE.Mesh(head, white);
      sphere.position.set(0, (outlines.height / 2 - 54) / 100, 0);
      group.add(sphere);
      scene.add(group, new THREE.AmbientLight(color('--foreground'), 2));
      const key = new THREE.DirectionalLight(color('--foreground'), 4); key.position.set(4, 5, 7); scene.add(key);
      const rim = new THREE.DirectionalLight(color('--primary'), 2); rim.position.set(-4, 0, -2); scene.add(rim);
      const resize = () => {
        const { width, height } = container.getBoundingClientRect();
        renderer.setSize(width, height); camera.aspect = width / Math.max(height, 1);
        camera.position.z = camera.aspect < 1 ? 13 / camera.aspect : 12;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize); observer.observe(container); resize();
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const start = performance.now();
      let frame = 0;
      const draw = () => {
        if (disposed) return;
        const t = running ? Math.min((performance.now() - start) / 1000, 10) : 0;
        const turn = Math.min(t / 7.4, 1);
        const ease = turn * turn * (3 - 2 * turn);
        group.rotation.y = reduced ? 0 : ease * Math.PI * 4;
        group.rotation.x = reduced ? 0 : Math.sin(t * .65) * .045 * (1 - turn);
        const scale = running && !reduced ? .9 + .1 * Math.min(t / 2, 1) : 1;
        group.scale.setScalar(scale);
        renderer.render(scene, camera);
        frame = requestAnimationFrame(draw);
      };
      draw(); onReady();
      cleanup = () => { cancelAnimationFrame(frame); observer.disconnect(); geometries.forEach(g => g.dispose()); lime.dispose(); white.dispose(); renderer.dispose(); renderer.domElement.remove(); };
    }).catch(() => {});
    return () => { disposed = true; cleanup(); };
  }, [running, onReady]);
  return <div ref={host} className="absolute inset-0" aria-hidden="true" />;
}