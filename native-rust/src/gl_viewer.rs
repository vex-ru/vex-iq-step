use crate::stl_loader::{MeshData, Vertex};
use eframe::egui;
use eframe::glow::{self, HasContext};
use glam::{Mat4, Vec3};

#[derive(Clone, Debug)]
pub struct Camera {
    pub yaw: f32,
    pub pitch: f32,
    pub distance: f32,
    pub target: Vec3,
}

impl Default for Camera {
    fn default() -> Self {
        Self {
            yaw: 0.75,
            pitch: 0.55,
            distance: 110.0,
            target: Vec3::new(0.0, 10.0, 0.0),
        }
    }
}

impl Camera {
    pub fn eye_position(&self) -> Vec3 {
        let cp = self.pitch.cos();
        let x = self.distance * cp * self.yaw.sin();
        let y = self.distance * self.pitch.sin();
        let z = self.distance * cp * self.yaw.cos();
        self.target + Vec3::new(x, y, z)
    }

    pub fn view_matrix(&self) -> Mat4 {
        let eye = self.eye_position();
        Mat4::look_at_rh(eye, self.target, Vec3::Y)
    }

    pub fn frame_mesh(&mut self, mesh: &MeshData) {
        let size = mesh.size();
        let radius = (size.length() * 0.5).max(15.0);
        self.target = Vec3::new(0.0, size.y * 0.5, 0.0);
        self.distance = radius * 2.6;
    }

    pub fn set_preset(&mut self, preset: CameraPreset, mesh_height: f32, radius: f32) {
        self.target = Vec3::new(0.0, mesh_height * 0.5, 0.0);
        self.distance = (radius * 2.6).max(30.0);
        match preset {
            CameraPreset::Iso => {
                self.yaw = 0.75;
                self.pitch = 0.55;
            }
            CameraPreset::Top => {
                self.yaw = 0.0;
                self.pitch = 1.54;
            }
            CameraPreset::Front => {
                self.yaw = 0.0;
                self.pitch = 0.05;
            }
            CameraPreset::Right => {
                self.yaw = std::f32::consts::FRAC_PI_2;
                self.pitch = 0.05;
            }
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub enum CameraPreset {
    Iso,
    Top,
    Front,
    Right,
}

#[derive(Clone, Debug)]
pub struct RenderParams {
    pub camera: Camera,
    pub model_color: [f32; 3],
    pub wireframe: bool,
    pub show_grid: bool,
    pub show_bbox: bool,
    pub rotation_y: f32,
}

pub struct GlViewer {
    mesh_program: glow::Program,
    line_program: glow::Program,
    mesh_vao: glow::VertexArray,
    mesh_vbo: glow::Buffer,
    mesh_vertex_count: i32,
    grid_vao: glow::VertexArray,
    grid_vbo: glow::Buffer,
    grid_vertex_count: i32,
    bbox_vao: glow::VertexArray,
    bbox_vbo: glow::Buffer,
    bbox_vertex_count: i32,
}

impl GlViewer {
    pub fn new(gl: &glow::Context) -> Self {
        unsafe {
            let is_es = gl.version().is_embedded;
            let header = if is_es {
                "#version 300 es\nprecision highp float;\n"
            } else {
                "#version 330 core\n"
            };

            let mesh_vs = format!(
                "{header}
                layout(location = 0) in vec3 a_pos;
                layout(location = 1) in vec3 a_norm;
                uniform mat4 u_mvp;
                uniform mat4 u_model;
                out vec3 v_world_pos;
                out vec3 v_world_norm;
                void main() {{
                    vec4 wp = u_model * vec4(a_pos, 1.0);
                    v_world_pos = wp.xyz;
                    v_world_norm = mat3(u_model) * a_norm;
                    gl_Position = u_mvp * vec4(a_pos, 1.0);
                }}"
            );

            let mesh_fs = format!(
                "{header}
                in vec3 v_world_pos;
                in vec3 v_world_norm;
                uniform vec3 u_color;
                uniform vec3 u_eye;
                out vec4 frag_color;
                void main() {{
                    vec3 N = normalize(v_world_norm);
                    vec3 V = normalize(u_eye - v_world_pos);
                    
                    // Three-point CAD studio lighting + hemisphere sky fill
                    vec3 key_dir  = normalize(vec3(0.55, 0.85, 0.45));
                    vec3 fill_dir = normalize(vec3(-0.7, 0.4, -0.5));
                    vec3 rim_dir  = normalize(vec3(0.0, 0.5, -0.9));

                    float diff_key  = max(dot(N, key_dir), 0.0);
                    float diff_fill = max(dot(N, fill_dir), 0.0);
                    float diff_rim  = max(dot(N, rim_dir), 0.0);
                    float hemi = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);

                    // Crisp plastic Blinn-Phong specular highlight
                    vec3 H = normalize(key_dir + V);
                    float spec = pow(max(dot(N, H), 0.0), 42.0) * 0.38;

                    // Subtle Fresnel edge highlight
                    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.14;

                    vec3 ambient = u_color * mix(0.30, 0.44, hemi);
                    vec3 diffuse = u_color * (diff_key * 0.72 + diff_fill * 0.28 + diff_rim * 0.18);
                    vec3 col = ambient + diffuse + vec3(spec) + mix(u_color, vec3(0.7, 0.9, 1.0), 0.5) * fresnel;

                    // Gentle highlight rolloff preserving saturated VEX plastic colors
                    col = col / (col * 0.45 + vec3(0.75));
                    col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 1.06));
                    frag_color = vec4(col, 1.0);
                }}"
            );

            let line_vs = format!(
                "{header}
                layout(location = 0) in vec3 a_pos;
                layout(location = 1) in vec3 a_col;
                uniform mat4 u_mvp;
                out vec3 v_col;
                void main() {{
                    v_col = a_col;
                    gl_Position = u_mvp * vec4(a_pos, 1.0);
                }}"
            );

            let line_fs = format!(
                "{header}
                in vec3 v_col;
                out vec4 frag_color;
                void main() {{
                    frag_color = vec4(v_col, 1.0);
                }}"
            );

            let mesh_program = compile_program(gl, &mesh_vs, &mesh_fs);
            let line_program = compile_program(gl, &line_vs, &line_fs);

            // Mesh VAO/VBO
            let mesh_vao = gl.create_vertex_array().unwrap();
            let mesh_vbo = gl.create_buffer().unwrap();
            gl.bind_vertex_array(Some(mesh_vao));
            gl.bind_buffer(glow::ARRAY_BUFFER, Some(mesh_vbo));
            let stride = std::mem::size_of::<Vertex>() as i32;
            gl.enable_vertex_attrib_array(0);
            gl.vertex_attrib_pointer_f32(0, 3, glow::FLOAT, false, stride, 0);
            gl.enable_vertex_attrib_array(1);
            gl.vertex_attrib_pointer_f32(1, 3, glow::FLOAT, false, stride, 12);
            gl.bind_vertex_array(None);

            // Engineering Pitch Grid (20 x 20 cells of 12.7 mm = 254 mm)
            let mut grid_verts: Vec<Vertex> = Vec::new();
            let half_cells = 10i32;
            let pitch = 12.7f32;
            let extent = half_cells as f32 * pitch;
            for i in -half_cells..=half_cells {
                let pos = i as f32 * pitch;
                let col = if i == 0 {
                    [0.05, 0.55, 0.85]
                } else if i % 5 == 0 {
                    [0.18, 0.26, 0.38]
                } else {
                    [0.10, 0.14, 0.22]
                };
                // X line
                grid_verts.push(Vertex { position: [-extent, -0.05, pos], normal: col });
                grid_verts.push(Vertex { position: [extent, -0.05, pos], normal: col });
                // Z line
                grid_verts.push(Vertex { position: [pos, -0.05, -extent], normal: col });
                grid_verts.push(Vertex { position: [pos, -0.05, extent], normal: col });
            }

            let grid_vao = gl.create_vertex_array().unwrap();
            let grid_vbo = gl.create_buffer().unwrap();
            gl.bind_vertex_array(Some(grid_vao));
            gl.bind_buffer(glow::ARRAY_BUFFER, Some(grid_vbo));
            gl.buffer_data_u8_slice(
                glow::ARRAY_BUFFER,
                bytemuck::cast_slice(&grid_verts),
                glow::STATIC_DRAW,
            );
            gl.enable_vertex_attrib_array(0);
            gl.vertex_attrib_pointer_f32(0, 3, glow::FLOAT, false, stride, 0);
            gl.enable_vertex_attrib_array(1);
            gl.vertex_attrib_pointer_f32(1, 3, glow::FLOAT, false, stride, 12);
            gl.bind_vertex_array(None);

            // BBox VAO/VBO
            let bbox_vao = gl.create_vertex_array().unwrap();
            let bbox_vbo = gl.create_buffer().unwrap();
            gl.bind_vertex_array(Some(bbox_vao));
            gl.bind_buffer(glow::ARRAY_BUFFER, Some(bbox_vbo));
            gl.enable_vertex_attrib_array(0);
            gl.vertex_attrib_pointer_f32(0, 3, glow::FLOAT, false, stride, 0);
            gl.enable_vertex_attrib_array(1);
            gl.vertex_attrib_pointer_f32(1, 3, glow::FLOAT, false, stride, 12);
            gl.bind_vertex_array(None);

            Self {
                mesh_program,
                line_program,
                mesh_vao,
                mesh_vbo,
                mesh_vertex_count: 0,
                grid_vao,
                grid_vbo,
                grid_vertex_count: grid_verts.len() as i32,
                bbox_vao,
                bbox_vbo,
                bbox_vertex_count: 0,
            }
        }
    }

    pub fn upload_mesh(&mut self, gl: &glow::Context, mesh: &MeshData) {
        unsafe {
            gl.bind_buffer(glow::ARRAY_BUFFER, Some(self.mesh_vbo));
            gl.buffer_data_u8_slice(
                glow::ARRAY_BUFFER,
                bytemuck::cast_slice(&mesh.vertices),
                glow::STATIC_DRAW,
            );
            self.mesh_vertex_count = mesh.vertices.len() as i32;

            // Upload Bounding Box wireframe lines
            let min = mesh.bounds_min;
            let max = mesh.bounds_max;
            let c = [0.22, 0.74, 0.97]; // Cyan #38bdf8
            let corners = [
                [min.x, min.y, min.z],
                [max.x, min.y, min.z],
                [max.x, min.y, max.z],
                [min.x, min.y, max.z],
                [min.x, max.y, min.z],
                [max.x, max.y, min.z],
                [max.x, max.y, max.z],
                [min.x, max.y, max.z],
            ];
            let edges = [
                (0, 1), (1, 2), (2, 3), (3, 0),
                (4, 5), (5, 6), (6, 7), (7, 4),
                (0, 4), (1, 5), (2, 6), (3, 7),
            ];
            let mut bbox_verts = Vec::with_capacity(24);
            for (a, b) in edges {
                bbox_verts.push(Vertex { position: corners[a], normal: c });
                bbox_verts.push(Vertex { position: corners[b], normal: c });
            }
            gl.bind_buffer(glow::ARRAY_BUFFER, Some(self.bbox_vbo));
            gl.buffer_data_u8_slice(
                glow::ARRAY_BUFFER,
                bytemuck::cast_slice(&bbox_verts),
                glow::STATIC_DRAW,
            );
            self.bbox_vertex_count = bbox_verts.len() as i32;
            gl.bind_buffer(glow::ARRAY_BUFFER, None);
        }
    }

    pub fn paint(&self, gl: &glow::Context, info: &egui::PaintCallbackInfo, params: &RenderParams) {
        let vp = info.viewport_in_pixels();
        if vp.width_px <= 0 || vp.height_px <= 0 {
            return;
        }
        let aspect = vp.width_px as f32 / vp.height_px as f32;
        let proj = Mat4::perspective_rh_gl(40.0_f32.to_radians(), aspect, 0.5, 4000.0);
        let view = params.camera.view_matrix();
        let model = Mat4::from_rotation_y(params.rotation_y);
        let mvp_model = proj * view * model;
        let mvp_world = proj * view;
        let eye = params.camera.eye_position();

        unsafe {
            gl.enable(glow::SCISSOR_TEST);
            gl.scissor(vp.left_px, vp.from_bottom_px, vp.width_px, vp.height_px);
            gl.viewport(vp.left_px, vp.from_bottom_px, vp.width_px, vp.height_px);
            gl.enable(glow::DEPTH_TEST);
            gl.depth_func(glow::LESS);

            gl.clear_color(0.039, 0.059, 0.114, 1.0);
            gl.clear(glow::COLOR_BUFFER_BIT | glow::DEPTH_BUFFER_BIT);

            // 1. Draw Grid
            if params.show_grid && self.grid_vertex_count > 0 {
                gl.use_program(Some(self.line_program));
                let loc = gl.get_uniform_location(self.line_program, "u_mvp");
                gl.uniform_matrix_4_f32_slice(loc.as_ref(), false, &mvp_world.to_cols_array());
                gl.bind_vertex_array(Some(self.grid_vao));
                gl.draw_arrays(glow::LINES, 0, self.grid_vertex_count);
            }

            // 2. Draw STL / Procedural 3D Model
            if self.mesh_vertex_count > 0 {
                if params.wireframe {
                    gl.polygon_mode(glow::FRONT_AND_BACK, glow::LINE);
                } else {
                    gl.polygon_mode(glow::FRONT_AND_BACK, glow::FILL);
                }

                gl.use_program(Some(self.mesh_program));
                let u_mvp = gl.get_uniform_location(self.mesh_program, "u_mvp");
                let u_model = gl.get_uniform_location(self.mesh_program, "u_model");
                let u_color = gl.get_uniform_location(self.mesh_program, "u_color");
                let u_eye = gl.get_uniform_location(self.mesh_program, "u_eye");

                gl.uniform_matrix_4_f32_slice(u_mvp.as_ref(), false, &mvp_model.to_cols_array());
                gl.uniform_matrix_4_f32_slice(u_model.as_ref(), false, &model.to_cols_array());
                gl.uniform_3_f32(
                    u_color.as_ref(),
                    params.model_color[0],
                    params.model_color[1],
                    params.model_color[2],
                );
                gl.uniform_3_f32(u_eye.as_ref(), eye.x, eye.y, eye.z);

                gl.bind_vertex_array(Some(self.mesh_vao));
                gl.draw_arrays(glow::TRIANGLES, 0, self.mesh_vertex_count);

                if params.wireframe {
                    gl.polygon_mode(glow::FRONT_AND_BACK, glow::FILL);
                }
            }

            // 3. Draw Bounding Box
            if params.show_bbox && self.bbox_vertex_count > 0 {
                gl.use_program(Some(self.line_program));
                let loc = gl.get_uniform_location(self.line_program, "u_mvp");
                gl.uniform_matrix_4_f32_slice(loc.as_ref(), false, &mvp_model.to_cols_array());
                gl.bind_vertex_array(Some(self.bbox_vao));
                gl.draw_arrays(glow::LINES, 0, self.bbox_vertex_count);
            }

            gl.bind_vertex_array(None);
            gl.use_program(None);
            gl.disable(glow::DEPTH_TEST);
        }
    }

    pub fn destroy(&self, gl: &glow::Context) {
        unsafe {
            gl.delete_program(self.mesh_program);
            gl.delete_program(self.line_program);
            gl.delete_vertex_array(self.mesh_vao);
            gl.delete_buffer(self.mesh_vbo);
            gl.delete_vertex_array(self.grid_vao);
            gl.delete_buffer(self.grid_vbo);
            gl.delete_vertex_array(self.bbox_vao);
            gl.delete_buffer(self.bbox_vbo);
        }
    }
}

unsafe fn compile_program(gl: &glow::Context, vs_src: &str, fs_src: &str) -> glow::Program {
    let program = gl.create_program().expect("Cannot create GL program");
    let vs = gl.create_shader(glow::VERTEX_SHADER).expect("Cannot create VS");
    gl.shader_source(vs, vs_src);
    gl.compile_shader(vs);
    if !gl.get_shader_compile_status(vs) {
        panic!("Vertex shader error: {}", gl.get_shader_info_log(vs));
    }

    let fs = gl.create_shader(glow::FRAGMENT_SHADER).expect("Cannot create FS");
    gl.shader_source(fs, fs_src);
    gl.compile_shader(fs);
    if !gl.get_shader_compile_status(fs) {
        panic!("Fragment shader error: {}", gl.get_shader_info_log(fs));
    }

    gl.attach_shader(program, vs);
    gl.attach_shader(program, fs);
    gl.link_program(program);
    if !gl.get_program_link_status(program) {
        panic!("Program link error: {}", gl.get_program_info_log(program));
    }

    gl.delete_shader(vs);
    gl.delete_shader(fs);
    program
}
