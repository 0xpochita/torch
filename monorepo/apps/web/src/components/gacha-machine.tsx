"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import * as THREE from "three";

/**
 * Capsule machine in plain three.js: a glass dome full of two-tone capsules that settle under gravity,
 * shake when you pull, and drop one capsule out of the chute that pops open toward the camera.
 * ponytail: hand-rolled sphere physics (O(n²) over ~30 capsules); swap for rapier if the count grows.
 */

export type GachaHandle = { pull: (color: string) => Promise<void> };

const DOME_R = 1.55;
const CAP_R = 0.27;
const CENTER = new THREE.Vector3(0, 0.75, 0);
const PALETTE = ["#9fd3ff", "#b8f0d8", "#ffd8a8", "#e5c8ff", "#ffc2a8", "#c5f5b0", "#ff8a00"];
const COUNT = 30;

type Capsule = { group: THREE.Group; top: THREE.Mesh; bottom: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3 };

function makeCapsule(color: string, shell: THREE.SphereGeometry, base: THREE.Material): Capsule {
  const group = new THREE.Group();
  const top = new THREE.Mesh(shell, new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 }));
  const bottom = new THREE.Mesh(shell, base);
  bottom.rotation.x = Math.PI;
  group.add(top, bottom);
  group.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
  return { group, top, bottom, v: new THREE.Vector3(), spin: new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2) };
}

export function GachaMachine({ ref, className = "" }: { ref?: Ref<GachaHandle>; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<GachaHandle["pull"]>(async () => {});

  useImperativeHandle(ref, () => ({ pull: (color) => api.current(color) }), []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 0.6, 10);
    camera.lookAt(0, -0.15, 0);

    scene.add(new THREE.HemisphereLight("#ffffff", "#3a2a1a", 1.6));
    const key = new THREE.DirectionalLight("#ffffff", 2.4);
    key.position.set(3, 5, 4);
    scene.add(key);
    const warm = new THREE.PointLight("#ff8a00", 0, 6);
    warm.position.set(0, -0.6, 2.4);
    scene.add(warm);

    const machine = new THREE.Group();
    machine.position.y = 0.45;
    scene.add(machine);

    // glass dome
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_R, 48, 32),
      new THREE.MeshPhysicalMaterial({ color: "#ffffff", transparent: true, opacity: 0.14, roughness: 0.05, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }),
    );
    glass.position.copy(CENTER);
    machine.add(glass);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(DOME_R * 0.72, 0.07, 16, 64), new THREE.MeshStandardMaterial({ color: "#ff8a00", metalness: 0.6, roughness: 0.3 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, CENTER.y - DOME_R * 0.7, 0);
    machine.add(rim);

    // body + chute + knob
    const bodyMat = new THREE.MeshStandardMaterial({ color: "#1f1f22", metalness: 0.2, roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 1.5, 48), bodyMat);
    body.position.y = -0.8;
    machine.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.27, 1.27, 0.12, 48), new THREE.MeshStandardMaterial({ color: "#ff8a00", metalness: 0.5, roughness: 0.35 }));
    band.position.y = -0.2;
    machine.add(band);
    const chute = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.55, 0.4), new THREE.MeshStandardMaterial({ color: "#0c0c0d", roughness: 0.9 }));
    chute.position.set(0, -1.1, 1.3);
    machine.add(chute);
    const knob = new THREE.Group();
    const spinner = new THREE.Group(); // rotates around the knob's own axis
    knob.add(spinner);
    spinner.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 32), new THREE.MeshStandardMaterial({ color: "#f5f5f7", metalness: 0.4, roughness: 0.3 })));
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.1), new THREE.MeshStandardMaterial({ color: "#ff8a00" }));
    grip.position.y = 0.09;
    spinner.add(grip);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(0, -0.55, 1.36);
    machine.add(knob);

    // capsules
    const shell = new THREE.SphereGeometry(CAP_R, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const baseMat = new THREE.MeshPhysicalMaterial({ color: "#f7f7f7", roughness: 0.3, clearcoat: 0.6 });
    const caps: Capsule[] = Array.from({ length: COUNT }, (_, i) => {
      const c = makeCapsule(PALETTE[i % PALETTE.length], shell, baseMat);
      const p = new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * (DOME_R - CAP_R) * 0.9).add(CENTER);
      c.group.position.copy(p);
      machine.add(c.group);
      return c;
    });

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let shake = 0; // seconds of agitation left
    let drop: { cap: Capsule; t: number; color: string; done: () => void } | null = null;
    const gravity = new THREE.Vector3(0, -9, 0);
    const tmp = new THREE.Vector3();
    const maxD = DOME_R - CAP_R;

    const step = (dt: number) => {
      for (const c of caps) {
        if (drop?.cap === c) continue;
        c.v.addScaledVector(gravity, dt);
        if (shake > 0) c.v.add(tmp.set((Math.random() - 0.5) * 1.6, Math.random() * 2.2, (Math.random() - 0.5) * 1.6));
        c.v.multiplyScalar(shake > 0 ? 0.985 : 0.96);
        c.group.position.addScaledVector(c.v, dt);
        // keep inside the dome
        tmp.subVectors(c.group.position, CENTER);
        const d = tmp.length();
        if (d > maxD) {
          tmp.multiplyScalar(1 / d);
          c.group.position.copy(CENTER).addScaledVector(tmp, maxD);
          const vn = c.v.dot(tmp);
          if (vn > 0) c.v.addScaledVector(tmp, -1.4 * vn);
        }
        const s = Math.min(c.v.length(), 4) * dt;
        c.group.rotation.x += c.spin.x * s;
        c.group.rotation.y += c.spin.y * s;
      }
      // capsule-capsule push apart
      for (let i = 0; i < caps.length; i++)
        for (let j = i + 1; j < caps.length; j++) {
          const a = caps[i].group.position;
          const b = caps[j].group.position;
          tmp.subVectors(b, a);
          const d = tmp.length();
          if (d > 0 && d < CAP_R * 2) {
            tmp.multiplyScalar((CAP_R * 2 - d) / d / 2);
            a.sub(tmp);
            b.add(tmp);
          }
        }
    };

    const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, t), 3);
    const exit = new THREE.Vector3(0, -1.1, 1.55);
    const front = new THREE.Vector3(0, 0.15, 3.9);

    const animateDrop = (dt: number) => {
      if (!drop) return;
      drop.t += dt;
      const { cap, t } = drop;
      const g = cap.group;
      if (t < 0.6) {
        // fall through the dome floor to the chute
        g.position.lerp(exit, ease(t / 0.6) * 0.35);
      } else if (t < 1.5) {
        // roll out and fly toward the camera, spinning
        const k = ease((t - 0.6) / 0.9);
        g.position.lerpVectors(exit, front, k);
        g.scale.setScalar(1 + k * 1.6);
        g.rotation.y += dt * 8;
        g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, 0, k);
        warm.intensity = k * 30;
      } else if (t < 2.1) {
        // pop open
        const k = ease((t - 1.5) / 0.6);
        cap.top.position.y = k * 0.5;
        cap.bottom.position.y = -k * 0.5;
        cap.top.rotation.z = k * 0.6;
        warm.intensity = 30 + k * 60;
        (cap.top.material as THREE.MeshPhysicalMaterial).emissive.set(drop.color).multiplyScalar(k * 0.6);
      } else {
        const done = drop.done;
        g.visible = false;
        drop = null;
        warm.intensity = 0;
        done();
      }
    };

    api.current = (color: string) =>
      new Promise<void>((resolve) => {
        if (drop) return resolve();
        // restore any capsule we popped earlier
        for (const c of caps) {
          if (!c.group.visible) {
            c.group.visible = true;
            c.group.scale.setScalar(1);
            c.top.position.y = c.bottom.position.y = 0;
            c.top.rotation.z = 0;
            (c.top.material as THREE.MeshPhysicalMaterial).emissive.set("#000000");
            c.group.position.copy(CENTER).add(new THREE.Vector3(0, 0.8, 0));
          }
        }
        if (reduce) return resolve();
        shake = 1.1;
        setTimeout(() => {
          const lowest = [...caps].sort((a, b) => a.group.position.y - b.group.position.y)[0];
          (lowest.top.material as THREE.MeshPhysicalMaterial).color.set(color);
          lowest.v.set(0, 0, 0);
          drop = { cap: lowest, t: 0, color, done: resolve };
        }, 1100);
      });

    let raf = 0;
    let last = performance.now();
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      if (!visible || document.hidden) return;
      for (let i = 0; i < 2; i++) step(dt / 2);
      if (shake > 0) {
        shake -= dt;
        machine.rotation.z = Math.sin(now / 40) * 0.035 * Math.min(1, shake * 2);
        spinner.rotation.y += dt * 9;
      } else machine.rotation.z *= 0.9;
      machine.rotation.y = Math.sin(now / 2600) * 0.18;
      animateDrop(dt);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className={className} aria-hidden />;
}
