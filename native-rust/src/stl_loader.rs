use bytemuck::{Pod, Zeroable};
use glam::Vec3;

#[repr(C)]
#[derive(Copy, Clone, Debug, Pod, Zeroable)]
pub struct Vertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
}

#[derive(Clone, Debug)]
pub struct MeshData {
    pub vertices: Vec<Vertex>,
    pub bounds_min: Vec3,
    pub bounds_max: Vec3,
    pub triangle_count: usize,
}

impl MeshData {
    pub fn size(&self) -> Vec3 {
        self.bounds_max - self.bounds_min
    }

    pub fn center(&self) -> Vec3 {
        (self.bounds_min + self.bounds_max) * 0.5
    }

    /// Re-center X/Z around 0 and place bottom at Y = 0.
    /// If `z_up_to_y_up` is true, rotates -90 deg around X so CAD Z-up becomes Y-up.
    pub fn normalize(&mut self, z_up_to_y_up: bool) {
        if self.vertices.is_empty() {
            return;
        }

        if z_up_to_y_up {
            for v in &mut self.vertices {
                let y = v.position[1];
                let z = v.position[2];
                v.position[1] = z;
                v.position[2] = -y;

                let ny = v.normal[1];
                let nz = v.normal[2];
                v.normal[1] = nz;
                v.normal[2] = -ny;
            }
        }

        let mut min = Vec3::splat(f32::INFINITY);
        let mut max = Vec3::splat(f32::NEG_INFINITY);

        for v in &self.vertices {
            let p = Vec3::from_array(v.position);
            min = min.min(p);
            max = max.max(p);
        }

        let center_x = (min.x + max.x) * 0.5;
        let center_z = (min.z + max.z) * 0.5;
        let shift = Vec3::new(center_x, min.y, center_z);

        for v in &mut self.vertices {
            v.position[0] -= shift.x;
            v.position[1] -= shift.y;
            v.position[2] -= shift.z;
        }

        self.bounds_min = min - shift;
        self.bounds_max = max - shift;
    }
}

/// Ultra-fast binary and ASCII STL parser.
pub fn parse_stl(data: &[u8], z_up_to_y_up: bool) -> Result<MeshData, String> {
    if data.len() < 15 {
        return Err("Файл STL слишком мал или повреждён".to_string());
    }

    // Check Binary STL format strictly: 80-byte header + 4-byte count + count * 50 bytes
    if data.len() >= 84 {
        let count_bytes: [u8; 4] = data[80..84].try_into().unwrap();
        let tri_count = u32::from_le_bytes(count_bytes) as usize;
        let expected_len = 84usize.saturating_add(tri_count.saturating_mul(50));
        if expected_len == data.len() && tri_count > 0 {
            return parse_binary_stl(data, tri_count, z_up_to_y_up);
        }
    }

    // Fallback to ASCII STL
    parse_ascii_stl(data, z_up_to_y_up)
}

fn read_vec3_le(slice: &[u8]) -> [f32; 3] {
    [
        f32::from_le_bytes(slice[0..4].try_into().unwrap()),
        f32::from_le_bytes(slice[4..8].try_into().unwrap()),
        f32::from_le_bytes(slice[8..12].try_into().unwrap()),
    ]
}

fn parse_binary_stl(data: &[u8], tri_count: usize, z_up_to_y_up: bool) -> Result<MeshData, String> {
    let mut vertices = Vec::with_capacity(tri_count * 3);
    let mut offset = 84;

    for _ in 0..tri_count {
        let tri_slice = &data[offset..offset + 50];
        let mut normal = Vec3::from_array(read_vec3_le(&tri_slice[0..12]));
        let v1 = read_vec3_le(&tri_slice[12..24]);
        let v2 = read_vec3_le(&tri_slice[24..36]);
        let v3 = read_vec3_le(&tri_slice[36..48]);

        if normal.length_squared() < 1e-8 {
            let p1 = Vec3::from_array(v1);
            let p2 = Vec3::from_array(v2);
            let p3 = Vec3::from_array(v3);
            let computed = (p2 - p1).cross(p3 - p1);
            normal = if computed.length_squared() > 1e-10 {
                computed.normalize()
            } else {
                Vec3::Y
            };
        } else {
            normal = normal.normalize();
        }

        let n = normal.to_array();
        vertices.push(Vertex { position: v1, normal: n });
        vertices.push(Vertex { position: v2, normal: n });
        vertices.push(Vertex { position: v3, normal: n });

        offset += 50;
    }

    let mut mesh = MeshData {
        triangle_count: tri_count,
        vertices,
        bounds_min: Vec3::ZERO,
        bounds_max: Vec3::ZERO,
    };
    mesh.normalize(z_up_to_y_up);
    Ok(mesh)
}

fn parse_ascii_stl(data: &[u8], z_up_to_y_up: bool) -> Result<MeshData, String> {
    let text = String::from_utf8_lossy(data);
    let mut vertices = Vec::new();
    let mut current_normal = Vec3::Y;
    let mut tri_verts: Vec<[f32; 3]> = Vec::with_capacity(3);

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("facet normal") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 5 {
                if let (Ok(x), Ok(y), Ok(z)) = (
                    parts[2].parse::<f32>(),
                    parts[3].parse::<f32>(),
                    parts[4].parse::<f32>(),
                ) {
                    let n = Vec3::new(x, y, z);
                    current_normal = if n.length_squared() > 1e-8 {
                        n.normalize()
                    } else {
                        Vec3::Y
                    };
                }
            }
            tri_verts.clear();
        } else if trimmed.starts_with("vertex") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 4 {
                if let (Ok(x), Ok(y), Ok(z)) = (
                    parts[1].parse::<f32>(),
                    parts[2].parse::<f32>(),
                    parts[3].parse::<f32>(),
                ) {
                    tri_verts.push([x, y, z]);
                    if tri_verts.len() == 3 {
                        let p1 = Vec3::from_array(tri_verts[0]);
                        let p2 = Vec3::from_array(tri_verts[1]);
                        let p3 = Vec3::from_array(tri_verts[2]);
                        let computed = (p2 - p1).cross(p3 - p1);
                        let n = if current_normal.length_squared() < 1e-6 && computed.length_squared() > 1e-10 {
                            computed.normalize()
                        } else {
                            current_normal
                        };
                        let na = n.to_array();
                        vertices.push(Vertex { position: tri_verts[0], normal: na });
                        vertices.push(Vertex { position: tri_verts[1], normal: na });
                        vertices.push(Vertex { position: tri_verts[2], normal: na });
                        tri_verts.clear();
                    }
                }
            }
        }
    }

    if vertices.is_empty() {
        return Err("В файле STL не найдено треугольников".to_string());
    }

    let tri_count = vertices.len() / 3;
    let mut mesh = MeshData {
        triangle_count: tri_count,
        vertices,
        bounds_min: Vec3::ZERO,
        bounds_max: Vec3::ZERO,
    };
    mesh.normalize(z_up_to_y_up);
    Ok(mesh)
}

/// Encode MeshData to standard Binary STL byte vector for saving/exporting.
pub fn encode_binary_stl(mesh: &MeshData, header_label: &str) -> Vec<u8> {
    let tri_count = mesh.vertices.len() / 3;
    let mut out = Vec::with_capacity(84 + tri_count * 50);

    let mut header = [0u8; 80];
    let label_bytes = header_label.as_bytes();
    let copy_len = label_bytes.len().min(80);
    header[..copy_len].copy_from_slice(&label_bytes[..copy_len]);
    out.extend_from_slice(&header);
    out.extend_from_slice(&(tri_count as u32).to_le_bytes());

    for chunk in mesh.vertices.chunks_exact(3) {
        let p1 = Vec3::from_array(chunk[0].position);
        let p2 = Vec3::from_array(chunk[1].position);
        let p3 = Vec3::from_array(chunk[2].position);
        let cross = (p2 - p1).cross(p3 - p1);
        let n = if cross.length_squared() > 1e-10 {
            cross.normalize()
        } else {
            Vec3::from_array(chunk[0].normal)
        };

        for f in [n.x, n.y, n.z] {
            out.extend_from_slice(&f.to_le_bytes());
        }
        for v in chunk {
            for f in v.position {
                out.extend_from_slice(&f.to_le_bytes());
            }
        }
        out.extend_from_slice(&0u16.to_le_bytes());
    }

    out
}
