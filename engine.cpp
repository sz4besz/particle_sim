#include <cmath>
#include <cstdlib>
#include <ctime>
#include <vector>

struct Particle {
  float pos_x;
  float pos_y;
  float vel_x;
  float vel_y;
  float color;

public:
  Particle(int c, int width, int height) : color(c) {
    pos_x = std::rand() % width;
    pos_y = std::rand() % height;
    vel_x = 0.0f;
    vel_y = 0.0f;
  }
};

std::vector<Particle> particle_data;

int color_count;
int particle_count;
std::vector<float> matrix;

extern "C" {
Particle *getData() { return particle_data.data(); }
int getParticleCount() { return particle_data.size(); }
float *getMatrix() { return matrix.data(); }

void init_matrix(int c_count) {
  color_count = c_count;
  matrix.resize(color_count * color_count);
  std::srand(std::time(nullptr));
  for (int A = 0; A < color_count; A++) {
    for (int B = 0; B < color_count; B++) {
      matrix[A * color_count + B] =
          (static_cast<float>(std::rand()) / RAND_MAX) * 2.0f - 1.0f;
    }
  }
}

void init_particles(int width, int height, int p_count) {
  particle_count = p_count;
  particle_data.clear();
  for (int i = 0; i < particle_count; i++) {
    particle_data.push_back(Particle(i % color_count, width, height));
  }
}

void step(int width, int height, float speed, float r_min, float r_max, float friction, float repel_force) {
  for (int i = 0; i < particle_count; i++) {
    Particle &A = particle_data[i];
    float force_x = 0.0f;
    float force_y = 0.0f;
    
    for (int j = 0; j < particle_count; j++) {
      Particle &B = particle_data[j];
      if (i == j)
        continue;

      float dx = B.pos_x - A.pos_x;
      float dy = B.pos_y - A.pos_y;

      // Wrap the distance for Toroidal space
      if (dx > width / 2.0f) dx -= width;
      else if (dx < -width / 2.0f) dx += width;

      if (dy > height / 2.0f) dy -= height;
      else if (dy < -height / 2.0f) dy += height;

      float dist_sq = dx * dx + dy * dy;

      if (dist_sq < r_max * r_max && dist_sq > 0) {
        float dist = std::sqrt(dist_sq);

        float norm_x = dx / dist;
        float norm_y = dy / dist;

        int A_color = static_cast<int>(A.color);
        int B_color = static_cast<int>(B.color);

        float rule = matrix[A_color * color_count + B_color];
        float force = 0.0f;

        if (dist < r_min) {
          force = (dist / r_min - 1.0f) * repel_force;
        } else if (dist < r_max) {
          float q = (dist - r_min) / (r_max - r_min);
          float triangle = 1.0f - std::abs(2.0f * q - 1.0f);
          force = rule * triangle;
        }

        force_x += norm_x * force;
        force_y += norm_y * force;
      }
    }
    
    A.vel_x += force_x;
    A.vel_y += force_y;

    A.vel_x *= friction;
    A.vel_y *= friction;

    A.pos_x += A.vel_x * speed;
    A.pos_y += A.vel_y * speed;

    // Wrap X position across boundaries
    if (A.pos_x < 0.0f) {
      A.pos_x += width;
    } else if (A.pos_x >= width) {
      A.pos_x -= width;
    }

    // Wrap Y position across boundaries
    if (A.pos_y < 0.0f) {
      A.pos_y += height;
    } else if (A.pos_y >= height) {
      A.pos_y -= height;
    }
  }
}
}