use crate::catalog::VexPartItem;
use crate::stl_loader::{MeshData, Vertex};
use glam::Vec3;
use std::f32::consts::PI;

const PITCH: f32 = 12.7;
const BEAM_THICKNESS: f32 = 6.35;

/// Generates an instant procedural 3D VEX IQ mesh when the raw STL file is not yet downloaded.
pub fn generate_procedural_mesh(part: &VexPartItem) -> MeshData {
    let mut vertices = Vec::new();

    match part.part_type.as_str() {
        "beam" => build_beam(&part.name, &mut vertices),
        "gear" => build_gear(&part.name, &mut vertices),
        "plate" => build_plate(&part.name, &mut vertices),
        "connector" => build_connector(&mut vertices),
        "shaft" => build_shaft(&part.name, &mut vertices),
        "pin" => build_pin(&part.name, &mut vertices),
        "wheel" => build_wheel(&part.name, &mut vertices),
        "motor" => build_motor(&part.name, &mut vertices),
        _ => add_box(&mut vertices, Vec3::ZERO, Vec3::new(25.4, 6.35, 12.7)),
    }

    let tri_count = vertices.len() / 3;
    let mut mesh = MeshData {
        vertices,
        bounds_min: Vec3::ZERO,
        bounds_max: Vec3::ZERO,
        triangle_count: tri_count,
    };
    mesh.normalize(false);
    mesh
}

fn push_tri(verts: &mut Vec<Vertex>, a: Vec3, b: Vec3, c: Vec3) {
    let cross = (b - a).cross(c - a);
    let n = if cross.length_squared() > 1e-10 {
        cross.normalize()
    } else {
        Vec3::Y
    };
    let na = n.to_array();
    verts.push(Vertex { position: a.to_array(), normal: na });
    verts.push(Vertex { position: b.to_array(), normal: na });
    verts.push(Vertex { position: c.to_array(), normal: na });
}

fn push_quad(verts: &mut Vec<Vertex>, a: Vec3, b: Vec3, c: Vec3, d: Vec3) {
    push_tri(verts, a, b, c);
    push_tri(verts, a, c, d);
}

fn add_box(verts: &mut Vec<Vertex>, center: Vec3, size: Vec3) {
    let h = size * 0.5;
    let p000 = center + Vec3::new(-h.x, -h.y, -h.z);
    let p001 = center + Vec3::new(-h.x, -h.y, h.z);
    let p010 = center + Vec3::new(-h.x, h.y, -h.z);
    let p011 = center + Vec3::new(-h.x, h.y, h.z);
    let p100 = center + Vec3::new(h.x, -h.y, -h.z);
    let p101 = center + Vec3::new(h.x, -h.y, h.z);
    let p110 = center + Vec3::new(h.x, h.y, -h.z);
    let p111 = center + Vec3::new(h.x, h.y, h.z);

    // Front (+Z)
    push_quad(verts, p001, p101, p111, p011);
    // Back (-Z)
    push_quad(verts, p100, p000, p010, p110);
    // Top (+Y)
    push_quad(verts, p011, p111, p110, p010);
    // Bottom (-Y)
    push_quad(verts, p000, p100, p101, p001);
    // Right (+X)
    push_quad(verts, p101, p100, p110, p111);
    // Left (-X)
    push_quad(verts, p000, p001, p011, p010);
}

fn add_cylinder_y(verts: &mut Vec<Vertex>, center: Vec3, radius: f32, height: f32, segments: usize) {
    let half_h = height * 0.5;
    let top_c = center + Vec3::new(0.0, half_h, 0.0);
    let bot_c = center + Vec3::new(0.0, -half_h, 0.0);

    for i in 0..segments {
        let a0 = (i as f32 / segments as f32) * 2.0 * PI;
        let a1 = ((i + 1) as f32 / segments as f32) * 2.0 * PI;
        let (s0, c0) = a0.sin_cos();
        let (s1, c1) = a1.sin_cos();

        let b0 = bot_c + Vec3::new(c0 * radius, 0.0, s0 * radius);
        let b1 = bot_c + Vec3::new(c1 * radius, 0.0, s1 * radius);
        let t0 = top_c + Vec3::new(c0 * radius, 0.0, s0 * radius);
        let t1 = top_c + Vec3::new(c1 * radius, 0.0, s1 * radius);

        push_tri(verts, top_c, t1, t0);
        push_tri(verts, bot_c, b0, b1);
        push_quad(verts, b0, t0, t1, b1);
    }
}

fn add_cylinder_x(verts: &mut Vec<Vertex>, center: Vec3, radius: f32, length: f32, segments: usize) {
    let half_l = length * 0.5;
    let left_c = center + Vec3::new(-half_l, 0.0, 0.0);
    let right_c = center + Vec3::new(half_l, 0.0, 0.0);

    for i in 0..segments {
        let a0 = (i as f32 / segments as f32) * 2.0 * PI;
        let a1 = ((i + 1) as f32 / segments as f32) * 2.0 * PI;
        let (s0, c0) = a0.sin_cos();
        let (s1, c1) = a1.sin_cos();

        let l0 = left_c + Vec3::new(0.0, c0 * radius, s0 * radius);
        let l1 = left_c + Vec3::new(0.0, c1 * radius, s1 * radius);
        let r0 = right_c + Vec3::new(0.0, c0 * radius, s0 * radius);
        let r1 = right_c + Vec3::new(0.0, c1 * radius, s1 * radius);

        push_tri(verts, right_c, r0, r1);
        push_tri(verts, left_c, l1, l0);
        push_quad(verts, l0, r0, r1, l1);
    }
}

fn parse_nxm(name: &str) -> Option<(usize, usize)> {
    for token in name.split_whitespace() {
        if let Some((a, b)) = token.split_once('x').or_else(|| token.split_once('X')) {
            if let (Ok(w), Ok(l)) = (a.parse::<f32>(), b.parse::<f32>()) {
                return Some((
                    (w.round() as usize).clamp(1, 16),
                    (l.round() as usize).clamp(1, 24),
                ));
            }
        }
    }
    None
}

fn parse_first_number(name: &str) -> Option<usize> {
    for token in name.split_whitespace() {
        let clean: String = token.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(n) = clean.parse::<usize>() {
            if n > 0 {
                return Some(n);
            }
        }
    }
    None
}

fn build_beam(name: &str, verts: &mut Vec<Vertex>) {
    let (rows, cols) = parse_nxm(name).unwrap_or((1, 6));
    let len = cols as f32 * PITCH;
    let width = rows as f32 * PITCH;
    add_box(verts, Vec3::new(0.0, BEAM_THICKNESS * 0.5, 0.0), Vec3::new(len, BEAM_THICKNESS, width));

    // Pitch boss rings to visualize holes clearly
    for r in 0..rows {
        let z = (r as f32 - (rows as f32 - 1.0) * 0.5) * PITCH;
        for c in 0..cols {
            let x = (c as f32 - (cols as f32 - 1.0) * 0.5) * PITCH;
            add_cylinder_y(verts, Vec3::new(x, BEAM_THICKNESS + 0.25, z), 3.0, 0.5, 16);
        }
    }
}

fn build_plate(name: &str, verts: &mut Vec<Vertex>) {
    let (rows, cols) = parse_nxm(name).unwrap_or((4, 6));
    let len = cols as f32 * PITCH;
    let width = rows as f32 * PITCH;
    add_box(verts, Vec3::new(0.0, 1.5, 0.0), Vec3::new(len, 3.0, width));
    for r in 0..rows {
        let z = (r as f32 - (rows as f32 - 1.0) * 0.5) * PITCH;
        for c in 0..cols {
            let x = (c as f32 - (cols as f32 - 1.0) * 0.5) * PITCH;
            add_cylinder_y(verts, Vec3::new(x, 3.2, z), 2.8, 0.4, 12);
        }
    }
}

fn build_gear(name: &str, verts: &mut Vec<Vertex>) {
    let teeth = if name.to_lowercase().contains("tooth") {
        parse_first_number(name).unwrap_or(24).clamp(8, 72)
    } else {
        24
    };
    let pitch_r = teeth as f32 * 1.05;
    let outer_r = pitch_r + 2.0;
    let root_r = (pitch_r - 2.0).max(3.5);
    let thick = 5.0;

    // Central gear disk
    add_cylinder_y(verts, Vec3::new(0.0, thick * 0.5, 0.0), root_r, thick, (teeth * 2).max(24));
    // Hub collar
    add_cylinder_y(verts, Vec3::new(0.0, thick * 0.5, 0.0), 4.5, thick + 1.6, 20);

    // Individual gear teeth
    let tooth_angle = (2.0 * PI) / teeth as f32;
    for i in 0..teeth {
        let a = i as f32 * tooth_angle;
        let a_prev = a - tooth_angle * 0.22;
        let a_next = a + tooth_angle * 0.22;
        let a_tip1 = a - tooth_angle * 0.12;
        let a_tip2 = a + tooth_angle * 0.12;

        let b0 = Vec3::new(a_prev.cos() * root_r, 0.0, a_prev.sin() * root_r);
        let b1 = Vec3::new(a_next.cos() * root_r, 0.0, a_next.sin() * root_r);
        let b2 = Vec3::new(a_tip2.cos() * outer_r, 0.0, a_tip2.sin() * outer_r);
        let b3 = Vec3::new(a_tip1.cos() * outer_r, 0.0, a_tip1.sin() * outer_r);

        let t0 = b0 + Vec3::Y * thick;
        let t1 = b1 + Vec3::Y * thick;
        let t2 = b2 + Vec3::Y * thick;
        let t3 = b3 + Vec3::Y * thick;

        push_quad(verts, t0, t1, t2, t3);
        push_quad(verts, b3, b2, b1, b0);
        push_quad(verts, b0, b3, t3, t0);
        push_quad(verts, b2, b1, t1, t2);
        push_quad(verts, b3, b2, t2, t3);
    }
}

fn build_connector(verts: &mut Vec<Vertex>) {
    let leg = 2.0 * PITCH;
    add_box(verts, Vec3::new(leg * 0.5, BEAM_THICKNESS * 0.5, 0.0), Vec3::new(leg, BEAM_THICKNESS, PITCH));
    add_box(verts, Vec3::new(BEAM_THICKNESS * 0.5, leg * 0.5, 0.0), Vec3::new(BEAM_THICKNESS, leg, PITCH));
}

fn build_shaft(name: &str, verts: &mut Vec<Vertex>) {
    let pitches = parse_first_number(name).unwrap_or(4).clamp(1, 24) as f32;
    let len = pitches * PITCH;
    if name.to_lowercase().contains("standoff") {
        add_cylinder_x(verts, Vec3::new(0.0, 3.5, 0.0), 3.5, len, 6);
        add_cylinder_x(verts, Vec3::new(-len * 0.5 - 3.0, 3.5, 0.0), 2.0, 6.0, 12);
        add_cylinder_x(verts, Vec3::new(len * 0.5 + 3.0, 3.5, 0.0), 2.0, 6.0, 12);
    } else {
        add_box(verts, Vec3::new(0.0, 1.6, 0.0), Vec3::new(len, 3.18, 3.18));
        if name.to_lowercase().contains("capped") {
            add_cylinder_x(verts, Vec3::new(-len * 0.5 - 0.9, 1.6, 0.0), 4.5, 1.8, 20);
        }
    }
}

fn build_pin(name: &str, verts: &mut Vec<Vertex>) {
    let len = if name.contains("1x2") || name.contains("2x2") { 18.0 } else { 12.0 };
    add_cylinder_x(verts, Vec3::new(0.0, 3.2, 0.0), 3.2, 1.4, 20);
    add_cylinder_x(verts, Vec3::new(0.0, 3.2, 0.0), 2.05, len, 18);
}

fn build_wheel(name: &str, verts: &mut Vec<Vertex>) {
    let diam = if name.to_lowercase().contains("mm") {
        parse_first_number(name).unwrap_or(48).clamp(10, 140) as f32
    } else {
        48.0
    };
    let radius = diam * 0.5;
    let width = if name.to_lowercase().contains("pulley") { 8.0 } else { 16.0 };
    add_cylinder_y(verts, Vec3::new(0.0, width * 0.5, 0.0), radius, width, 36);
    add_cylinder_y(verts, Vec3::new(0.0, width * 0.5, 0.0), radius * 0.6, width + 1.0, 24);
}

fn build_motor(name: &str, verts: &mut Vec<Vertex>) {
    if name.to_lowercase().contains("fan") {
        add_cylinder_y(verts, Vec3::new(0.0, 7.0, 0.0), 25.0, 14.0, 32);
    } else {
        add_box(verts, Vec3::new(0.0, 12.5, 0.0), Vec3::new(35.0, 25.0, 48.0));
        add_cylinder_y(verts, Vec3::new(0.0, 27.0, 12.0), 6.0, 6.0, 20);
    }
}
