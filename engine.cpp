#include <vector>
#include <cstdlib>

struct Particle {
  float pos_x;
  float pos_y;
  float vel_x;
  float vel_y;
  float color;

  public:
  // Add width and height as arguments
  Particle(int c, int width, int height) : color(c) {
    pos_x = std::rand() % width;
    pos_y = std::rand() % height;
    vel_x = 0.0f;
    vel_y = 0.0f;
  }
};

std::vector<Particle> particle_data;

int color_count = 3;
std::vector<float> matrix;
int particle_count = 1000;

extern "C" {
    Particle *getData() { return particle_data.data(); }
    int getParticleCount() { return particle_data.size(); }

    void init_matrix() {
      matrix.resize(color_count * color_count);
      for (int A = 0; A < color_count; A++) {
        for (int B = 0; B < color_count; B++) {
          matrix[A * color_count + B] = (A == B) ? 1.0f : -1.0f;
        }
      }
    }

    // Accept width and height from JavaScript
    void init_particles(int width, int height) {
      particle_data.clear();
      for (int i = 0; i < particle_count; i++) {
        particle_data.push_back(Particle(i % color_count, width, height));
      }
    }
}