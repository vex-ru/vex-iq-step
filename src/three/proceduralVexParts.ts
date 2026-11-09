/**
 * High-fidelity procedural geometry synthesizer for VEX IQ parts
 * Follows exact VEX IQ mechanical pitch specs:
 * 1 Pitch = 12.7 mm (0.5 inch)
 * Thickness = 6.35 mm (0.25 inch)
 * Standard hole diameter = 4.2 mm
 * Shaft socket = 3.2 mm square
 */

import * as THREE from 'three';
import type { VexPartItem } from '../data/vexCatalog';

const PITCH = 12.7; // mm
const BEAM_THICKNESS = 6.35; // mm
const HOLE_RADIUS = 2.1; // mm (4.2 mm diameter)

/**
 * Creates authentic procedural 3D model geometry for any VEX IQ catalog item
 */
export function createVexProceduralMesh(part: VexPartItem): THREE.Group {
  const group = new THREE.Group();
  group.name = `VEX_${part.sku}_${part.partType}`;

  switch (part.partType) {
    case 'beam':
      buildBeamGeometry(part, group);
      break;
    case 'gear':
      buildGearGeometry(part, group);
      break;
    case 'plate':
      buildPlateGeometry(part, group);
      break;
    case 'connector':
      buildConnectorGeometry(part, group);
      break;
    case 'shaft':
      buildShaftGeometry(part, group);
      break;
    case 'pin':
      buildPinGeometry(part, group);
      break;
    case 'wheel':
      buildWheelGeometry(part, group);
      break;
    case 'motor':
      buildMotorGeometry(part, group);
      break;
    default:
      buildGeneralMechanism(part, group);
      break;
  }

  // Ground bottom-center pivot
  const box = new THREE.Box3().setFromObject(group);
  const center = new THREE.Vector3();
  box.getCenter(center);
  group.position.x -= center.x;
  group.position.y -= box.min.y;
  group.position.z -= center.z;

  return group;
}

/**
 * Procedural VEX IQ Beam with authentic pitch holes & structural ribs
 */
function buildBeamGeometry(part: VexPartItem, group: THREE.Group) {
  // Parse dimensions like 1x10, 2x4, etc.
  const match = part.name.match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/i);
  const widthPitches = match ? Math.max(1, Math.min(4, parseFloat(match[1]))) : 1;
  const lengthPitches = match ? Math.max(1, Math.min(24, parseFloat(match[2]))) : 6;

  const totalLength = lengthPitches * PITCH;
  const totalWidth = widthPitches * PITCH;
  const height = BEAM_THICKNESS;

  // Outer rounded rectangular profile
  const shape = new THREE.Shape();
  const halfL = totalLength / 2;
  const halfW = totalWidth / 2;
  const cornerR = 2.5;

  shape.moveTo(-halfL + cornerR, -halfW);
  shape.lineTo(halfL - cornerR, -halfW);
  shape.quadraticCurveTo(halfL, -halfW, halfL, -halfW + cornerR);
  shape.lineTo(halfL, halfW - cornerR);
  shape.quadraticCurveTo(halfL, halfW, halfL - cornerR, halfW);
  shape.lineTo(-halfL + cornerR, halfW);
  shape.quadraticCurveTo(-halfL, halfW, -halfL, halfW - cornerR);
  shape.lineTo(-halfL, -halfW + cornerR);
  shape.quadraticCurveTo(-halfL, -halfW, -halfL + cornerR, -halfW);

  // Add authentic pitch holes
  const holesCount = Math.floor(lengthPitches);
  const rowsCount = Math.floor(widthPitches);

  for (let r = 0; r < rowsCount; r++) {
    const yPos = (r - (rowsCount - 1) / 2) * PITCH;
    for (let c = 0; c < holesCount; c++) {
      const xPos = (c - (holesCount - 1) / 2) * PITCH;
      const holePath = new THREE.Path();
      holePath.absarc(xPos, yPos, HOLE_RADIUS, 0, Math.PI * 2, true);
      shape.holes.push(holePath);
    }
  }

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    steps: 1,
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.6,
    bevelSize: 0.6,
    bevelOffset: 0,
    bevelSegments: 2,
  };

  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geom.computeVertexNormals();
  // Rotate so beam lays flat
  geom.rotateX(Math.PI / 2);

  const mainMesh = new THREE.Mesh(geom);
  mainMesh.castShadow = true;
  mainMesh.receiveShadow = true;
  group.add(mainMesh);

  // Add subtle center reinforcement ribs between pitch holes
  const ribMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 });
  const ribGeom = new THREE.CylinderGeometry(HOLE_RADIUS + 0.7, HOLE_RADIUS + 0.7, height + 0.2, 16, 1, true);
  for (let r = 0; r < rowsCount; r++) {
    const yPos = (r - (rowsCount - 1) / 2) * PITCH;
    for (let c = 0; c < holesCount; c++) {
      const xPos = (c - (holesCount - 1) / 2) * PITCH;
      const rib = new THREE.Mesh(ribGeom, ribMat);
      rib.position.set(xPos, height / 2, yPos);
      group.add(rib);
    }
  }
}

/**
 * Procedural VEX IQ Gear (12T, 24T, 36T, 48T, 60T) with square axle hub
 */
function buildGearGeometry(part: VexPartItem, group: THREE.Group) {
  let teeth = 24;
  const match = part.name.match(/(\d+)\s*Tooth/i);
  if (match) {
    teeth = parseInt(match[1], 10);
  }

  const pitchRadius = (teeth * 1.05); // mm scale for realistic CAD viewer
  const outerRadius = pitchRadius + 2.0;
  const rootRadius = Math.max(3.0, pitchRadius - 2.0);
  const thickness = 5.0; // mm

  const shape = new THREE.Shape();
  const toothAngle = (Math.PI * 2) / teeth;

  for (let i = 0; i < teeth; i++) {
    const angle = i * toothAngle;
    const a0 = angle;
    const a1 = angle + toothAngle * 0.25;
    const a2 = angle + toothAngle * 0.45;
    const a3 = angle + toothAngle * 0.7;
    const a4 = angle + toothAngle * 0.9;

    const r0x = Math.cos(a0) * rootRadius;
    const r0y = Math.sin(a0) * rootRadius;
    const t1x = Math.cos(a1) * outerRadius;
    const t1y = Math.sin(a1) * outerRadius;
    const t2x = Math.cos(a2) * outerRadius;
    const t2y = Math.sin(a2) * outerRadius;
    const r3x = Math.cos(a3) * rootRadius;
    const r3y = Math.sin(a3) * rootRadius;
    const r4x = Math.cos(a4) * rootRadius;
    const r4y = Math.sin(a4) * rootRadius;

    if (i === 0) shape.moveTo(r0x, r0y);
    else shape.lineTo(r0x, r0y);

    shape.lineTo(t1x, t1y);
    shape.lineTo(t2x, t2y);
    shape.lineTo(r3x, r3y);
    shape.lineTo(r4x, r4y);
  }

  // Central square shaft hole (standard VEX IQ 3.2 x 3.2 mm square)
  const squareShaftHole = new THREE.Path();
  const halfSq = 1.6;
  squareShaftHole.moveTo(-halfSq, -halfSq);
  squareShaftHole.lineTo(halfSq, -halfSq);
  squareShaftHole.lineTo(halfSq, halfSq);
  squareShaftHole.lineTo(-halfSq, halfSq);
  squareShaftHole.closePath();
  shape.holes.push(squareShaftHole);

  // If gear is large (>24T), add standard VEX IQ circular lightening holes
  if (teeth >= 36) {
    const spokeCount = teeth >= 48 ? 6 : 4;
    const holeRingRadius = (rootRadius + 3.0) / 2;
    const lightHoleR = teeth >= 48 ? 3.0 : 2.2;

    for (let s = 0; s < spokeCount; s++) {
      const sa = (s * Math.PI * 2) / spokeCount;
      const hx = Math.cos(sa) * holeRingRadius;
      const hy = Math.sin(sa) * holeRingRadius;
      const spPath = new THREE.Path();
      spPath.absarc(hx, hy, lightHoleR, 0, Math.PI * 2, true);
      shape.holes.push(spPath);
    }
  }

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    steps: 1,
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.5,
    bevelSegments: 2,
  };

  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geom.computeVertexNormals();
  geom.rotateX(Math.PI / 2);

  const gearMesh = new THREE.Mesh(geom);
  gearMesh.castShadow = true;
  gearMesh.receiveShadow = true;
  group.add(gearMesh);

  // Add raised hub collar
  const hubGeom = new THREE.CylinderGeometry(4.5, 4.5, thickness + 1.6, 24);
  const hubMesh = new THREE.Mesh(hubGeom);
  hubMesh.position.y = (thickness + 1.6) / 2 - 0.8;
  group.add(hubMesh);
}

/**
 * Procedural VEX IQ Plates & Panels
 */
function buildPlateGeometry(part: VexPartItem, group: THREE.Group) {
  const match = part.name.match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/i);
  const wPitches = match ? Math.min(12, Math.max(2, parseFloat(match[1]))) : 4;
  const lPitches = match ? Math.min(16, Math.max(2, parseFloat(match[2]))) : 6;

  const totalLength = lPitches * PITCH;
  const totalWidth = wPitches * PITCH;
  const thickness = 2.4; // mm thin panel or 6.35 mm plate

  const shape = new THREE.Shape();
  const halfL = totalLength / 2;
  const halfW = totalWidth / 2;
  const r = 3;

  shape.moveTo(-halfL + r, -halfW);
  shape.lineTo(halfL - r, -halfW);
  shape.quadraticCurveTo(halfL, -halfW, halfL, -halfW + r);
  shape.lineTo(halfL, halfW - r);
  shape.quadraticCurveTo(halfL, halfW, halfL - r, halfW);
  shape.lineTo(-halfL + r, halfW);
  shape.quadraticCurveTo(-halfL, halfW, -halfL, halfW - r);
  shape.lineTo(-halfL, -halfW + r);
  shape.quadraticCurveTo(-halfL, -halfW, -halfL + r, -halfW);

  // Add grid of pitch holes
  const cols = Math.floor(lPitches);
  const rows = Math.floor(wPitches);
  for (let row = 0; row < rows; row++) {
    const y = (row - (rows - 1) / 2) * PITCH;
    for (let col = 0; col < cols; col++) {
      const x = (col - (cols - 1) / 2) * PITCH;
      const h = new THREE.Path();
      h.absarc(x, y, HOLE_RADIUS, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
  }

  const geom = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.4,
    bevelSize: 0.4,
    bevelSegments: 2,
  });
  geom.computeVertexNormals();
  geom.rotateX(Math.PI / 2);

  const mesh = new THREE.Mesh(geom);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

/**
 * Procedural VEX IQ Corner Connectors & Angles
 */
function buildConnectorGeometry(part: VexPartItem, group: THREE.Group) {
  // Typical L-shape 90-degree or chassis corner connector
  const leg1Len = 2 * PITCH;
  const leg2Len = 2 * PITCH;
  const width = PITCH;
  const thick = BEAM_THICKNESS;

  const groupPart = new THREE.Group();

  // Leg 1
  const leg1Shape = new THREE.Shape();
  leg1Shape.moveTo(0, 0);
  leg1Shape.lineTo(leg1Len, 0);
  leg1Shape.lineTo(leg1Len, thick);
  leg1Shape.lineTo(0, thick);
  leg1Shape.closePath();
  // Pin hole in leg 1
  const h1 = new THREE.Path();
  h1.absarc(PITCH, thick / 2, HOLE_RADIUS, 0, Math.PI * 2, true);
  leg1Shape.holes.push(h1);

  const g1 = new THREE.ExtrudeGeometry(leg1Shape, { depth: width, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5 });
  const m1 = new THREE.Mesh(g1);
  groupPart.add(m1);

  // Leg 2 (perpendicular 90 deg)
  const leg2Shape = new THREE.Shape();
  leg2Shape.moveTo(0, thick);
  leg2Shape.lineTo(thick, thick);
  leg2Shape.lineTo(thick, leg2Len);
  leg2Shape.lineTo(0, leg2Len);
  leg2Shape.closePath();
  const h2 = new THREE.Path();
  h2.absarc(thick / 2, PITCH + thick / 2, HOLE_RADIUS, 0, Math.PI * 2, true);
  leg2Shape.holes.push(h2);

  const g2 = new THREE.ExtrudeGeometry(leg2Shape, { depth: width, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5 });
  const m2 = new THREE.Mesh(g2);
  groupPart.add(m2);

  // Diagonal brace fillet
  const gussetGeom = new THREE.BoxGeometry(thick * 1.5, thick * 1.5, width * 0.9);
  gussetGeom.rotateZ(Math.PI / 4);
  const gusset = new THREE.Mesh(gussetGeom);
  gusset.position.set(thick * 1.1, thick * 1.1, width / 2);
  groupPart.add(gusset);

  group.add(groupPart);
}

/**
 * Procedural VEX IQ Shafts, Standoffs & Bushings
 */
function buildShaftGeometry(part: VexPartItem, group: THREE.Group) {
  const match = part.name.match(/(\d+(?:\.\d+)?)\s*x\s*Pitch/i);
  const pitches = match ? Math.max(1, Math.min(24, parseFloat(match[1]))) : 4;
  const length = pitches * PITCH;
  const isCapped = part.name.toLowerCase().includes('capped');
  const isStandoff = part.name.toLowerCase().includes('standoff');

  if (isStandoff) {
    // Hexagonal standoff or round with pin ends
    const standoffGeom = new THREE.CylinderGeometry(3.5, 3.5, length, 6);
    standoffGeom.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(standoffGeom);
    m.castShadow = true;
    group.add(m);

    // End pins
    const pinGeom = new THREE.CylinderGeometry(HOLE_RADIUS * 0.95, HOLE_RADIUS * 0.95, 6, 16);
    pinGeom.rotateZ(Math.PI / 2);
    const p1 = new THREE.Mesh(pinGeom);
    p1.position.x = -length / 2 - 3;
    const p2 = new THREE.Mesh(pinGeom);
    p2.position.x = length / 2 + 3;
    group.add(p1);
    group.add(p2);
  } else {
    // Standard VEX IQ 3.18mm square shaft
    const shaftGeom = new THREE.BoxGeometry(length, 3.18, 3.18);
    const shaftMesh = new THREE.Mesh(shaftGeom);
    shaftMesh.castShadow = true;
    group.add(shaftMesh);

    if (isCapped) {
      // Shaft cap flange
      const capGeom = new THREE.CylinderGeometry(4.5, 4.5, 1.8, 20);
      capGeom.rotateZ(Math.PI / 2);
      const cap = new THREE.Mesh(capGeom);
      cap.position.x = -length / 2 - 0.9;
      group.add(cap);
    }
  }
}

/**
 * Procedural VEX IQ Pins (0x2, 1x1, 1x2, 2x2)
 */
function buildPinGeometry(part: VexPartItem, group: THREE.Group) {
  const is1x2 = part.name.includes('1x2') || part.name.includes('2x2');
  const totalLength = is1x2 ? 18.0 : 12.0;

  // Center flange ring
  const flangeGeom = new THREE.CylinderGeometry(3.2, 3.2, 1.4, 24);
  flangeGeom.rotateZ(Math.PI / 2);
  const flange = new THREE.Mesh(flangeGeom);
  group.add(flange);

  // Pin studs on both sides with barb retention lip
  const studLen = (totalLength - 1.4) / 2;
  const pinStudGeom = new THREE.CylinderGeometry(HOLE_RADIUS * 0.98, HOLE_RADIUS * 0.98, studLen, 20);
  pinStudGeom.rotateZ(Math.PI / 2);

  const leftPin = new THREE.Mesh(pinStudGeom);
  leftPin.position.x = -studLen / 2 - 0.7;
  const rightPin = new THREE.Mesh(pinStudGeom);
  rightPin.position.x = studLen / 2 + 0.7;

  // Retention barb rings
  const barbGeom = new THREE.CylinderGeometry(HOLE_RADIUS * 1.08, HOLE_RADIUS * 0.85, 0.8, 16);
  barbGeom.rotateZ(Math.PI / 2);
  const barb1 = new THREE.Mesh(barbGeom);
  barb1.position.x = -studLen + 1.2;
  const barb2 = new THREE.Mesh(barbGeom);
  barb2.position.x = studLen - 1.2;

  group.add(leftPin);
  group.add(rightPin);
  group.add(barb1);
  group.add(barb2);
}

/**
 * Procedural VEX IQ Wheels, Tires & Pulleys
 */
function buildWheelGeometry(part: VexPartItem, group: THREE.Group) {
  const isPulley = part.name.toLowerCase().includes('pulley');
  let diameter = 48.0; // mm

  const mmMatch = part.name.match(/(\d+)\s*mm/i);
  if (mmMatch) {
    diameter = parseFloat(mmMatch[1]);
  } else {
    const pitchMatch = part.name.match(/(\d+(?:\.\d+)?)\s*x\s*Pitch/i);
    if (pitchMatch) {
      diameter = parseFloat(pitchMatch[1]) * PITCH;
    }
  }

  const radius = diameter / 2;
  const width = isPulley ? 8.0 : 16.0;

  if (isPulley) {
    // V-groove pulley
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 32));
    hub.rotateX(Math.PI / 2);
    group.add(hub);

    // Inner rim groove cutout representation
    const rimFlange1 = new THREE.Mesh(new THREE.CylinderGeometry(radius + 1.5, radius + 1.5, 1.5, 32));
    rimFlange1.rotateX(Math.PI / 2);
    rimFlange1.position.z = width / 2 - 0.75;
    const rimFlange2 = new THREE.Mesh(new THREE.CylinderGeometry(radius + 1.5, radius + 1.5, 1.5, 32));
    rimFlange2.rotateX(Math.PI / 2);
    rimFlange2.position.z = -width / 2 + 0.75;
    group.add(rimFlange1);
    group.add(rimFlange2);
  } else {
    // Tire + Hub assembly
    const tireGeom = new THREE.CylinderGeometry(radius, radius, width, 36);
    tireGeom.rotateX(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeom);
    tire.castShadow = true;
    group.add(tire);

    // Wheel hub center
    const innerRadius = radius * 0.65;
    const hubGeom = new THREE.CylinderGeometry(innerRadius, innerRadius, width * 0.9, 24);
    hubGeom.rotateX(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeom);
    group.add(hub);

    // Center square drive socket
    const axleBox = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, width + 1));
    axleBox.position.z = 0;
    group.add(axleBox);

    // Subtle offroad tread ribs on outer circumference
    const ribsCount = 18;
    for (let i = 0; i < ribsCount; i++) {
      const angle = (i * Math.PI * 2) / ribsCount;
      const rx = Math.cos(angle) * (radius + 0.4);
      const ry = Math.sin(angle) * (radius + 0.4);
      const rib = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, width * 0.8));
      rib.position.set(rx, ry, 0);
      rib.rotation.z = angle;
      group.add(rib);
    }
  }
}

/**
 * Procedural VEX IQ Motors, Housings & Power parts
 */
function buildMotorGeometry(part: VexPartItem, group: THREE.Group) {
  // Smart Motor or Fan housing
  const isFan = part.name.toLowerCase().includes('fan');
  if (isFan) {
    const ductR = 25;
    const ductH = 14;
    const ductGeom = new THREE.CylinderGeometry(ductR, ductR, ductH, 32, 1, true);
    ductGeom.rotateX(Math.PI / 2);
    const duct = new THREE.Mesh(ductGeom);
    group.add(duct);

    // 6 blades
    const bladeGeom = new THREE.BoxGeometry(ductR * 0.85, 1.2, 6);
    for (let b = 0; b < 6; b++) {
      const blade = new THREE.Mesh(bladeGeom);
      blade.rotation.z = (b * Math.PI) / 3;
      blade.rotation.y = 0.35;
      group.add(blade);
    }
  } else {
    // VEX IQ Motor housing representation
    const bodyGeom = new THREE.BoxGeometry(35, 25, 48);
    const body = new THREE.Mesh(bodyGeom);
    body.castShadow = true;
    group.add(body);

    // Motor output drive socket
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 8, 20));
    boss.position.set(0, 0, 28);
    boss.rotateX(Math.PI / 2);
    group.add(boss);

    // Mounting flange tabs with pitch holes
    const tabGeom = new THREE.BoxGeometry(PITCH, BEAM_THICKNESS, 8);
    const tab1 = new THREE.Mesh(tabGeom);
    tab1.position.set(-20, 0, 20);
    const tab2 = new THREE.Mesh(tabGeom);
    tab2.position.set(20, 0, 20);
    group.add(tab1);
    group.add(tab2);
  }
}

/**
 * Fallback procedural mechanism
 */
function buildGeneralMechanism(part: VexPartItem, group: THREE.Group) {
  const boxGeom = new THREE.BoxGeometry(25, 12, 15);
  const mesh = new THREE.Mesh(boxGeom);
  mesh.castShadow = true;
  group.add(mesh);

  // Pitch mounting holes
  const hGeom = new THREE.CylinderGeometry(HOLE_RADIUS, HOLE_RADIUS, 14, 16);
  const h1 = new THREE.Mesh(hGeom);
  h1.position.x = -6;
  const h2 = new THREE.Mesh(hGeom);
  h2.position.x = 6;
  group.add(h1);
  group.add(h2);
}

/**
 * Converts a THREE.Group or BufferGeometry into a genuine binary STL ArrayBuffer
 * ready to download or save directly to disk!
 */
export function exportGroupToBinarySTL(object: THREE.Object3D, name: string): ArrayBuffer {
  // Collect all triangles from all meshes in the group
  const triangles: {
    normal: THREE.Vector3;
    v1: THREE.Vector3;
    v2: THREE.Vector3;
    v3: THREE.Vector3;
  }[] = [];

  object.updateMatrixWorld(true);

  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geom = mesh.geometry.clone();
      geom.applyMatrix4(mesh.matrixWorld);

      const pos = geom.getAttribute('position');
      const index = geom.getIndex();

      if (index) {
        for (let i = 0; i < index.count; i += 3) {
          const a = index.getX(i);
          const b = index.getX(i + 1);
          const c = index.getX(i + 2);

          const v1 = new THREE.Vector3(pos.getX(a), pos.getY(a), pos.getZ(a));
          const v2 = new THREE.Vector3(pos.getX(b), pos.getY(b), pos.getZ(b));
          const v3 = new THREE.Vector3(pos.getX(c), pos.getY(c), pos.getZ(c));

          const edge1 = new THREE.Vector3().subVectors(v2, v1);
          const edge2 = new THREE.Vector3().subVectors(v3, v1);
          const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

          triangles.push({ normal, v1, v2, v3 });
        }
      } else if (pos) {
        for (let i = 0; i < pos.count; i += 3) {
          const v1 = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
          const v2 = new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
          const v3 = new THREE.Vector3(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));

          const edge1 = new THREE.Vector3().subVectors(v2, v1);
          const edge2 = new THREE.Vector3().subVectors(v3, v1);
          const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

          triangles.push({ normal, v1, v2, v3 });
        }
      }
    }
  });

  // Binary STL format specification:
  // 80 bytes header
  // 4 bytes uint32 (number of triangles)
  // Per triangle:
  //   3 floats (normal X, Y, Z) = 12 bytes
  //   3 floats (v1 X, Y, Z) = 12 bytes
  //   3 floats (v2 X, Y, Z) = 12 bytes
  //   3 floats (v3 X, Y, Z) = 12 bytes
  //   uint16 attribute byte count = 2 bytes
  // Total per triangle = 50 bytes

  const bufferSize = 80 + 4 + triangles.length * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const dataView = new DataView(buffer);

  // Write header (80 bytes)
  const headerStr = `VEX IQ CAD Part: ${name.slice(0, 60)}`;
  for (let i = 0; i < headerStr.length && i < 80; i++) {
    dataView.setUint8(i, headerStr.charCodeAt(i));
  }

  // Number of triangles (offset 80)
  dataView.setUint32(80, triangles.length, true);

  let offset = 84;
  for (let t = 0; t < triangles.length; t++) {
    const tri = triangles[t];

    // Normal
    dataView.setFloat32(offset, tri.normal.x, true);
    dataView.setFloat32(offset + 4, tri.normal.y, true);
    dataView.setFloat32(offset + 8, tri.normal.z, true);
    offset += 12;

    // V1
    dataView.setFloat32(offset, tri.v1.x, true);
    dataView.setFloat32(offset + 4, tri.v1.y, true);
    dataView.setFloat32(offset + 8, tri.v1.z, true);
    offset += 12;

    // V2
    dataView.setFloat32(offset, tri.v2.x, true);
    dataView.setFloat32(offset + 4, tri.v2.y, true);
    dataView.setFloat32(offset + 8, tri.v2.z, true);
    offset += 12;

    // V3
    dataView.setFloat32(offset, tri.v3.x, true);
    dataView.setFloat32(offset + 4, tri.v3.y, true);
    dataView.setFloat32(offset + 8, tri.v3.z, true);
    offset += 12;

    // Attribute byte count = 0
    dataView.setUint16(offset, 0, true);
    offset += 2;
  }

  return buffer;
}
