// 3D renderer for STACK. Reads the pure game state (src/game.js) and draws it with Three.js:
// an orthographic isometric camera, flat-shaded colored boxes, a few falling slices and gold
// sparks. No textures — colors come from the theme. The sky gradient is a CSS backdrop behind
// this transparent WebGL canvas (handled in main.js).
import * as THREE from '../vendor/three.module.js';
import { themeById, GOLD } from './themes.js';

const N = 32;            // ring of reusable tower-box meshes (only the top ~N are ever on screen)
const BLOCK_H = 1;
const LOOK_DOWN = 4;     // look slightly below the active block so it sits high in frame
const DIST = 120;        // camera distance along the iso direction (orthographic: clipping only)

export class Scene3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0); // transparent — the CSS sky shows through
    this.scene = new THREE.Scene();

    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 500);
    this.dir = new THREE.Vector3(1, 0.85, 1).normalize();

    this.scene.add(new THREE.HemisphereLight(0x9ec1ff, 0x202838, 1.05));
    const key = new THREE.DirectionalLight(0xfff2dd, 1.4);
    key.position.set(6, 12, 8);
    this.scene.add(key);

    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.blocks = new Array(N).fill(null);
    this.active = this._mkMesh(); this.active.visible = false; this.scene.add(this.active);
    this.sliceMeshes = [];
    this._col = new THREE.Color();
  }

  _mkMesh() {
    const m = new THREE.Mesh(this.geo, new THREE.MeshLambertMaterial({ color: 0xffffff }));
    return m;
  }

  _block(slot) {
    if (!this.blocks[slot]) { this.blocks[slot] = this._mkMesh(); this.scene.add(this.blocks[slot]); }
    return this.blocks[slot];
  }

  _slice(i) {
    if (!this.sliceMeshes[i]) { this.sliceMeshes[i] = this._mkMesh(); this.scene.add(this.sliceMeshes[i]); }
    return this.sliceMeshes[i];
  }

  resize(w, h) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    const vs = Math.max(19, 17 / aspect); // keep the full travel of the active block in frame
    this.camera.left = -vs * aspect / 2; this.camera.right = vs * aspect / 2;
    this.camera.top = vs / 2; this.camera.bottom = -vs / 2;
    this.camera.near = 1; this.camera.far = 500;
    this.camera.updateProjectionMatrix();
  }

  _setBox(mesh, x, y, z, sx, sz, styleColor) {
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, BLOCK_H * 0.98, sz); // tiny gap between layers reads as separate blocks
    this._col.setStyle(styleColor);
    mesh.material.color.copy(this._col);
    mesh.visible = true;
  }

  // Pull the whole frame from the game's plain-data state.
  sync(game, themeId) {
    const theme = themeById(themeId);

    // tower: a ring of N meshes mapped to the top N layers (rest never seen — camera only pans up)
    for (const m of this.blocks) if (m) m.visible = false;
    const start = Math.max(0, game.tower.length - N);
    for (let i = start; i < game.tower.length; i++) {
      const b = game.tower[i];
      this._setBox(this._block(i % N), b.x, (i + 0.5) * BLOCK_H, b.z, b.sx, b.sz, theme.block(b.colorIndex));
    }

    // active block
    if (game.state === 'playing' && game.active) {
      const a = game.active;
      this._setBox(this.active, a.x, (game.tower.length + 0.5) * BLOCK_H, a.z, a.sx, a.sz, theme.block(a.colorIndex));
    } else {
      this.active.visible = false;
    }

    // slices + gold sparks
    for (let i = 0; i < game.slices.length; i++) {
      const s = game.slices[i];
      const m = this._slice(i);
      if (!s.live) { m.visible = false; continue; }
      this._setBox(m, s.x, s.y, s.z, s.sx, s.sz, s.gold ? GOLD : theme.block(s.colorIndex));
      m.scale.set(s.sx, s.sy, s.sz);
      m.rotation.set(s.rx, s.ry, s.rz);
    }

    // camera follows the tower up, keeping a fixed isometric direction
    const ty = game.camTargetY - LOOK_DOWN;
    this.camera.position.set(this.dir.x * DIST, ty + this.dir.y * DIST, this.dir.z * DIST);
    this.camera.lookAt(0, ty, 0);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
