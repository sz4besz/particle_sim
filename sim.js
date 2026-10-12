const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Map C++ color integers to actual CSS colors (Red, Green, Blue)
const colors = ['#ff4444', '#44ff44', '#4444ff'];

// Emscripten hook: Wait for Wasm to be ready
Module.onRuntimeInitialized = function() {
    // 1. Initialize C++ data
    Module._init_matrix();
    Module._init_particles(canvas.width, canvas.height);

    // 2. Get pointers and sizes from C++
    const pointer = Module._getData();
    const count = Module._getParticleCount();

    // 3. Create a Float32Array view directly over the Wasm memory.
    // Emscripten's HEAPF32 is indexed in 4-byte float chunks, so divide the pointer by 4.
    const particleData = Module.HEAPF32.subarray(pointer / 4, (pointer / 4) + (count * 5));

    // 4. Draw the initial state
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let i = 0; i < count; i++) {
        let base = i * 5;
        let x = particleData[base];
        let y = particleData[base + 1];
        let colorIndex = particleData[base + 4];

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = colors[colorIndex];
        ctx.fill();
        ctx.closePath();
    }
};