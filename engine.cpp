#include <cmath>
#include <cstdlib>
#include <ctime>
#include <vector>

struct Particle {
  float pos_x, pos_y, vel_x, vel_y, color;

  Particle(int c, int w, int h) : color(c), vel_x(0.0f), vel_y(0.0f) {
    pos_x = std::rand() % w;
    pos_y = std::rand() % h;
  }
};

std::vector<Particle> particles;
std::vector<float> matrix;
int color_count;

// Spatial Grid Data
std::vector<std::vector<int>> grid;
int grid_cols = 0;
int grid_rows = 0;

extern "C" {
Particle *getData() { return particles.data(); }
int getParticleCount() { return particles.size(); }
float *getMatrix() { return matrix.data(); }

void init_matrix(int c_count) {
  color_count = c_count;
  matrix.resize(color_count * color_count);
  std::srand(std::time(nullptr));
  for (float& rule : matrix) {
    rule = (static_cast<float>(std::rand()) / RAND_MAX) * 2.0f - 1.0f;
  }
}

void init_particles(int width, int height, int p_count) {
  particles.clear();
  for (int i = 0; i < p_count; i++) {
    particles.emplace_back(i % color_count, width, height);
  }
}

void step(int width, int height, float speed, float r_min, float r_max, float friction, float repel_force) {
  float half_w = width / 2.0f;
  float half_h = height / 2.0f;
  float r_max_sq = r_max * r_max;

  // 1. Configure the Spatial Grid
  float cell_size = r_max;
  
  // Safety: Ensure at least a 3x3 grid so wrap-around doesn't double-count cells
  if (width / cell_size < 3.0f) cell_size = width / 3.0f;
  if (height / cell_size < 3.0f) cell_size = height / 3.0f;
  
  int cols = static_cast<int>(std::ceil(width / cell_size));
  int rows = static_cast<int>(std::ceil(height / cell_size));

  // Only resize memory if the grid dimensions actually change
  if (cols != grid_cols || rows != grid_rows) {
    grid.resize(cols * rows);
    grid_cols = cols;
    grid_rows = rows;
  }

  // Clear old grid assignments (clear() is extremely fast because it keeps capacity)
  for (int i = 0; i < cols * rows; i++) {
    grid[i].clear();
  }

  // 2. Assign particles to grid cells
  for (int i = 0; i < particles.size(); i++) {
    int cx = static_cast<int>(particles[i].pos_x / cell_size);
    int cy = static_cast<int>(particles[i].pos_y / cell_size);
    
    // Clamp to prevent out-of-bounds array access
    if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
    if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
    
    grid[cy * cols + cx].push_back(i);
  }

  // 3. Calculate Forces using the Grid
  for (int i = 0; i < particles.size(); i++) {
    Particle &A = particles[i];
    float force_x = 0.0f;
    float force_y = 0.0f;
    int A_offset = static_cast<int>(A.color) * color_count;
    
    int cx = static_cast<int>(A.pos_x / cell_size);
    int cy = static_cast<int>(A.pos_y / cell_size);
    if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
    if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;

    // Check the 9 neighboring cells (including own cell)
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        // Toroidal grid wrap
        int nx = (cx + x + cols) % cols;
        int ny = (cy + y + rows) % rows;
        int cell_idx = ny * cols + nx;

        // Only loop through particles in this specific cell
        for (int j : grid[cell_idx]) {
          if (i == j) continue;
          
          Particle &B = particles[j];
          float dx = B.pos_x - A.pos_x;
          float dy = B.pos_y - A.pos_y;

          // Toroidal distance wrap
          if (dx > half_w) dx -= width; else if (dx < -half_w) dx += width;
          if (dy > half_h) dy -= height; else if (dy < -half_h) dy += height;

          float dist_sq = dx * dx + dy * dy;

          if (dist_sq > 0 && dist_sq < r_max_sq) {
            float dist = std::sqrt(dist_sq);
            float force = 0.0f;

            if (dist < r_min) {
              force = (dist / r_min - 1.0f) * repel_force;
            } else {
              float rule = matrix[A_offset + static_cast<int>(B.color)];
              float q = (dist - r_min) / (r_max - r_min);
              force = rule * (1.0f - std::abs(2.0f * q - 1.0f));
            }

            float f_over_d = force / dist;
            force_x += dx * f_over_d;
            force_y += dy * f_over_d;
          }
        }
      }
    }
    
    // Store velocity updates (do not move positions yet to maintain physics symmetry)
    A.vel_x = (A.vel_x + force_x) * friction;
    A.vel_y = (A.vel_y + force_y) * friction;
  }

  // 4. Update Positions & Wrap
  for (auto& A : particles) {
    A.pos_x += A.vel_x * speed;
    A.pos_y += A.vel_y * speed;

    if (A.pos_x < 0.0f) A.pos_x += width; else if (A.pos_x >= width) A.pos_x -= width;
    if (A.pos_y < 0.0f) A.pos_y += height; else if (A.pos_y >= height) A.pos_y -= height;
  }
}
}