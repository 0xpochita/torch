"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Capsule machine in plain three.js: gold body and a glass dome of glossy capsules (the stage is the page background).
 * pull(): the machine shakes, one capsule drops out and floats in front of the camera with a rarity glow.
 * crack(): the floating capsule splits, shards burst out, and the light flares.
 * ponytail: hand-rolled sphere physics (O(n²) over ~30 capsules); swap for rapier if the count grows.
 */

export type GachaHandle = { pull: (color: string) => Promise<void>; crack: () => Promise<void> };

const DOME_R = 1.5;
const CAP_R = 0.26;
const CENTER = new THREE.Vector3(0, 0.75, 0);
const COUNT = 30;
const SHARDS = 48;

type Capsule = { group: THREE.Group; core: THREE.Mesh; halo: THREE.Sprite; mat: THREE.ShaderMaterial; v: THREE.Vector3; spin: THREE.Vector3 };

// Animated fire: fbm noise scrolling upward, dark red → orange → white-hot core, glowing rim.
const FIRE_VERT = /* glsl */ `
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vPos = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FIRE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHeat;
uniform float uSeed;
uniform vec3 uTint;
uniform float uTintAmt;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  float speed = 1.2 + uHeat * 3.0;
  vec3 q = vPos * 9.0 + vec3(uSeed, -uTime * speed, uSeed * 0.7);
  float n = fbm(q + fbm(q * 0.6) * 1.5);
  float fres = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.2);
  vec3 col = mix(vec3(0.35, 0.04, 0.0), vec3(1.0, 0.38, 0.02), smoothstep(0.25, 0.6, n));
  col = mix(col, vec3(1.0, 0.82, 0.38), smoothstep(0.55, 0.85, n));
  col = mix(col, col * uTint * 1.6, uTintAmt * 0.3);
  col *= 0.85 + uHeat * 1.0;
  col += vec3(1.0, 0.55, 0.12) * fres * (0.8 + uHeat);
  gl_FragColor = vec4(col, 1.0);
}`;

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,200,120,1)");
  r.addColorStop(0.25, "rgba(255,140,30,0.55)");
  r.addColorStop(1, "rgba(255,90,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeFireball(geo: THREE.SphereGeometry, haloTex: THREE.Texture): Capsule {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    vertexShader: FIRE_VERT,
    fragmentShader: FIRE_FRAG,
    uniforms: { uTime: { value: 0 }, uHeat: { value: 0.15 }, uSeed: { value: Math.random() * 50 }, uTint: { value: new THREE.Color("#ff8a00") }, uTintAmt: { value: 0 } },
  });
  const core = new THREE.Mesh(geo, mat);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: "#ff9a30", blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 }));
  halo.scale.setScalar(CAP_R * 4);
  group.add(halo, core);
  return { group, core, halo, mat, v: new THREE.Vector3(), spin: new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2) };
}

export function GachaMachine({ ref, className = "" }: { ref?: Ref<GachaHandle>; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<GachaHandle>({ pull: async () => {}, crack: async () => {} });

  useImperativeHandle(ref, () => ({ pull: (c) => api.current.pull(c), crack: () => api.current.crack() }), []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block";

    const scene = new THREE.Scene();
    // studio reflections so gold and glass read as real materials
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    camera.position.set(0, 0.9, 10.5);
    const look = new THREE.Vector3(0, 0, 0);

    scene.add(new THREE.HemisphereLight("#fff4e6", "#2a1a0c", 0.6));
    const key = new THREE.DirectionalLight("#ffffff", 1.6);
    key.position.set(3, 6, 5);
    scene.add(key);
    const rimLight = new THREE.PointLight("#ff8a00", 18, 8);
    rimLight.position.set(0, -1.4, 1.2);
    scene.add(rimLight);
    const glow = new THREE.PointLight("#ffffff", 0, 7);
    scene.add(glow);

    const machine = new THREE.Group();
    machine.position.y = 0.2;
    scene.add(machine);

    const gold = new THREE.MeshPhysicalMaterial({ color: "#e8a23a", metalness: 1, roughness: 0.18, clearcoat: 0.6 });
    const dark = new THREE.MeshPhysicalMaterial({ color: "#151517", metalness: 0.6, roughness: 0.3, clearcoat: 1 });
    const orange = new THREE.MeshStandardMaterial({ color: "#ff8a00", emissive: "#ff6a00", emissiveIntensity: 1.6 });

    // glass dome
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_R, 64, 40),
      new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.15, ior: 1.3, transparent: true, opacity: 0.35, envMapIntensity: 1.4, depthWrite: false }),
    );
    glass.position.copy(CENTER);
    machine.add(glass);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(DOME_R * 0.74, 0.09, 20, 80), gold);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = CENTER.y - DOME_R * 0.68;
    machine.add(collar);
    const topCap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), gold);
    topCap.position.y = CENTER.y + DOME_R - 0.04;
    machine.add(topCap);

    // body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 1.35, 64), gold);
    body.position.y = -0.62;
    machine.add(body);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.155, 1.155, 0.5, 64, 1, true, -0.55, 1.1), dark);
    plate.position.y = -0.75;
    machine.add(plate);
    // dispenser door: dark recess in a gold frame, with a smoked flap
    const door = new THREE.Group();
    door.position.set(0, -1.02, 1.18);
    machine.add(door);
    const recess = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.2), new THREE.MeshStandardMaterial({ color: "#050505", roughness: 1 }));
    door.add(recess);
    [
      [0.78, 0.06, 0, 0.23],
      [0.78, 0.06, 0, -0.23],
      [0.06, 0.52, 0.36, 0],
      [0.06, 0.52, -0.36, 0],
    ].forEach(([w, h, x, y]) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), gold);
      bar.position.set(x, y, 0.1);
      door.add(bar);
    });
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.36, 0.02), new THREE.MeshPhysicalMaterial({ color: "#ff8a00", transparent: true, opacity: 0.35, roughness: 0.1, clearcoat: 1 }));
    flap.position.set(0, 0, 0.12);
    door.add(flap);
    const chuteGlow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.05), orange);
    chuteGlow.position.set(0, -0.19, 0.11);
    door.add(chuteGlow);

    // dial: gold rim, dark face, thick rounded handle bar, centre hub
    const knob = new THREE.Group();
    const spinner = new THREE.Group();
    knob.add(spinner);
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 16, 48), gold);
    rimRing.rotation.x = Math.PI / 2;
    knob.add(rimRing);
    spinner.add(new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.08, 48), dark));
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.42, 8, 16), new THREE.MeshPhysicalMaterial({ color: "#ff8a00", roughness: 0.25, clearcoat: 1 }));
    handle.rotation.z = Math.PI / 2;
    handle.position.y = 0.09;
    spinner.add(handle);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 12), gold);
    hub.position.y = 0.16;
    spinner.add(hub);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(0, -0.4, 1.22);
    machine.add(knob);

    // fireballs
    const ballGeo = new THREE.SphereGeometry(CAP_R, 40, 24);
    const haloTex = glowTexture();
    const caps: Capsule[] = Array.from({ length: COUNT }, () => {
      const c = makeFireball(ballGeo, haloTex);
      c.group.position.copy(new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * (DOME_R - CAP_R) * 0.9).add(CENTER));
      machine.add(c.group);
      return c;
    });
    // fire inside the dome lights the gold from within
    const domeLight = new THREE.PointLight("#ff7a1a", 6, 6);
    domeLight.position.copy(CENTER).setY(CENTER.y - 0.6);
    machine.add(domeLight);
    let heat = 0.15;

    // shards for the crack burst
    const shardGeo = new THREE.TetrahedronGeometry(0.07);
    const shardMat = new THREE.MeshStandardMaterial({ color: "#ffb04a", emissive: "#ff7a1a", emissiveIntensity: 2, transparent: true });
    const shards = Array.from({ length: SHARDS }, () => {
      const m = new THREE.Mesh(shardGeo, shardMat);
      m.visible = false;
      scene.add(m);
      return { m, v: new THREE.Vector3() };
    });

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      // keep the whole machine in frame on narrow stages
      camera.position.z = camera.aspect < 1.1 ? 13 : 10.5;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let shake = 0;
    type Stage = "drop" | "float" | "crack";
    let active: { cap: Capsule; t: number; stage: Stage; color: THREE.Color; done?: () => void } | null = null;
    let burst = 0;
    const gravity = new THREE.Vector3(0, -9, 0);
    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();
    const maxD = DOME_R - CAP_R;

    const step = (dt: number) => {
      for (const c of caps) {
        if (active?.cap === c) continue;
        c.v.addScaledVector(gravity, dt);
        if (shake > 0) c.v.add(tmp.set((Math.random() - 0.5) * 1.8, Math.random() * 2.4, (Math.random() - 0.5) * 1.8));
        c.v.multiplyScalar(shake > 0 ? 0.985 : 0.96);
        c.group.position.addScaledVector(c.v, dt);
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

    const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
    const exit = new THREE.Vector3(0, -1.0, 1.4);
    // float point in machine space, right in front of the camera
    const front = new THREE.Vector3(0, 0.55, 3.4);

    const animate = (dt: number, now: number) => {
      if (!active) return;
      active.t += dt;
      const { cap: c, t } = active;
      const g = c.group;
      const u = c.mat.uniforms;
      if (active.stage === "drop") {
        if (t < 0.5) g.position.lerp(exit, ease(t / 0.5) * 0.35);
        else {
          const k = ease((t - 0.5) / 1.0);
          g.position.lerpVectors(exit, front, k);
          g.scale.setScalar(1 + k * 0.9);
          g.rotation.y += dt * (10 - k * 8);
          u.uTintAmt.value = k;
          // the halo carries the rarity colour, the fire keeps burning orange
          (c.halo.material as THREE.SpriteMaterial).color.set("#ff9a30").lerp(active.color, k);
          glow.color.copy(active.color);
          glow.position.copy(g.position).add(machine.position).add(tmp2.set(0, 0, 0.8));
          glow.intensity = k * 40;
          if (t >= 1.5) {
            active.stage = "float";
            active.t = 0;
            const done = active.done;
            active.done = undefined;
            done?.();
          }
        }
      } else if (active.stage === "float") {
        // idle hover, waiting for a tap
        g.position.y = front.y + Math.sin(now / 420) * 0.06;
        g.rotation.y += dt * 0.9;
        glow.intensity = 40 + Math.sin(now / 300) * 10;
        u.uHeat.value = 0.55 + Math.sin(now / 260) * 0.15;
        c.halo.scale.setScalar(CAP_R * (5 + Math.sin(now / 180) * 0.6));
      } else {
        // crack: split, flare, shards
        const k = ease(t / 0.5);
        // the fireball swells, burns white-hot, then bursts into embers
        g.scale.setScalar(1.9 + k * 1.6);
        u.uHeat.value = 1.5 + k * 3;
        c.halo.scale.setScalar(CAP_R * (5 + k * 10));
        (c.halo.material as THREE.SpriteMaterial).opacity = 0.55 + k * 0.45;
        glow.intensity = 40 + k * 260;
        if (t > 0.9) {
          g.visible = false;
          const done = active.done;
          active = null;
          glow.intensity = 0;
          done?.();
        }
      }
    };

    const animateShards = (dt: number) => {
      if (burst <= 0) return;
      burst -= dt;
      shardMat.opacity = Math.max(0, burst / 1.2);
      for (const s of shards) {
        s.v.y -= 3 * dt;
        s.m.position.addScaledVector(s.v, dt);
        s.m.rotation.x += dt * 6;
        s.m.rotation.y += dt * 5;
        if (burst <= 0) s.m.visible = false;
      }
    };

    // put back any capsule that was popped or is still floating
    const reset = () => {
      for (const c of caps) {
        if (c.group.visible && active?.cap !== c) continue;
        c.group.visible = true;
        c.group.scale.setScalar(1);
        c.mat.uniforms.uTintAmt.value = 0;
        (c.halo.material as THREE.SpriteMaterial).color.set("#ff9a30");
        c.halo.scale.setScalar(CAP_R * 4);
        (c.halo.material as THREE.SpriteMaterial).opacity = 0.55;
        c.group.position.copy(CENTER).add(tmp.set(0, 0.8, 0));
        c.v.set(0, 0, 0);
      }
      active = null;
      glow.intensity = 0;
    };

    api.current.pull = (color: string) =>
      new Promise<void>((resolve) => {
        reset();
        if (reduce) return resolve();
        shake = 1.3;
        setTimeout(() => {
          const lowest = [...caps].sort((a, b) => a.group.position.y - b.group.position.y)[0];
          lowest.mat.uniforms.uTint.value.set(color);
          lowest.v.set(0, 0, 0);
          active = { cap: lowest, t: 0, stage: "drop", color: new THREE.Color(color), done: resolve };
        }, 1300);
      });

    api.current.crack = () =>
      new Promise<void>((resolve) => {
        if (!active || active.stage !== "float") return resolve();
        active.stage = "crack";
        active.t = 0;
        active.done = resolve;
        const origin = active.cap.group.position.clone().add(machine.position);
        shardMat.color.set("#ffb04a").lerp(active.color, 0.5);
        shardMat.emissive.set("#ff7a1a").lerp(active.color, 0.5);
        for (const s of shards) {
          s.m.visible = true;
          s.m.position.copy(origin);
          s.v.randomDirection().multiplyScalar(2 + Math.random() * 4);
        }
        burst = 1.2;
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
        machine.rotation.z = Math.sin(now / 38) * 0.04 * Math.min(1, shake * 2);
        spinner.rotation.y += dt * 10;
      } else machine.rotation.z *= 0.9;
      machine.rotation.y = active ? machine.rotation.y * 0.95 : Math.sin(now / 2800) * 0.2;
      orange.emissiveIntensity = 1.4 + Math.sin(now / 500) * 0.4;
      rimLight.intensity = 14 + Math.sin(now / 500) * 4 + (shake > 0 ? 20 : 0);
      // everything burns hotter while a pull is running
      heat = THREE.MathUtils.lerp(heat, shake > 0 || active ? 1 : 0.15, dt * 3);
      const flicker = Math.sin(now / 90) * 0.06 + Math.sin(now / 37) * 0.04;
      for (const c of caps) {
        c.mat.uniforms.uTime.value = now / 1000;
        if (active?.cap !== c) {
          c.mat.uniforms.uHeat.value = heat;
          c.halo.scale.setScalar(CAP_R * (3.6 + heat * 2.2 + flicker * 3));
        }
      }
      domeLight.intensity = 5 + heat * 35 + flicker * 20;
      animate(dt, now);
      animateShards(dt);
      camera.lookAt(look);
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
      caps.forEach((c) => c.halo.material.dispose());
      haloTex.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className={className} aria-hidden />;
}
