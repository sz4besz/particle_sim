const canvas = document.getElementById('simCanvas');

function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
}
window.addEventListener('resize', resize);
resize();

// UI Toggle
const gearBtn = document.getElementById('gearBtn');
const panel = document.getElementById('panel');
gearBtn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

const PRESETS = {
    'cells': (N) => {
        let m = new Float32Array(N * N);
        for(let i=0; i<N; i++) {
            for(let j=0; j<N; j++) m[i*N + j] = (i === j) ? 1.0 : -1.0;
        }
        return { speed: 0.5, rmin: 15, rmax: 80, fric: 0.20, repel: 5.0, matrix: m };
    },
    'chains': (N) => {
        let m = new Float32Array(N * N);
        for(let i=0; i<N; i++) {
            for(let j=0; j<N; j++) {
                let dist = Math.min((i - j + N) % N, (j - i + N) % N);
                if (dist === 1) m[i*N + j] = 1.0; 
                else if (dist === 0) m[i*N + j] = -0.5; 
                else m[i*N + j] = -0.2; 
            }
        }
        return { speed: 0.5, rmin: 20, rmax: 55, fric: 0.15, repel: 3.5, matrix: m };
    },
    'ecosystem': (N) => {
        let m = new Float32Array(N * N);
        for(let i=0; i<N; i++) {
            for(let j=0; j<N; j++) {
                if (i === j) m[i*N + j] = 1.0; 
                else {
                    let val = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
                    m[i*N + j] = (val - Math.floor(val)) * 2.0 - 1.0; 
                }
            }
        }
        return { speed: 0.5, rmin: 15, rmax: 85, fric: 0.25, repel: 5.0, matrix: m };
    }
};

function bindSlider(inputId, valId) {
    const input = document.getElementById(inputId);
    const val = document.getElementById(valId);
    input.addEventListener('input', () => val.innerText = input.value);
}

// Helper to convert HSL to RGB floats for the WebGPU shader
function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) r = g = b = l;
    else {
        const hue2rgb = (p, q, t) => {
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [r, g, b, 1.0];
}

// Module initialization must be async to await WebGPU requests
Module.onRuntimeInitialized = async function() {
    if (!navigator.gpu) {
        alert("WebGPU is not supported by your browser. Update to a modern browser.");
        return;
    }

    // --- WEBGPU SETUP ---
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        alert("No compatible WebGPU adapter was found.");
        return;
    }
    const device = await adapter.requestDevice({
        requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : [],
    });
    const context = canvas.getContext('webgpu');
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    
    context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
    });

    const wgslShader = `
    struct Uniforms {
        res: vec2f,
        radius: f32,
    };
    // Reading flat f32 array directly matches C++ memory stride perfectly
    @group(0) @binding(0) var<storage, read> pData: array<f32>;
    @group(0) @binding(1) var<storage, read> palette: array<vec4f>;
    @group(0) @binding(2) var<uniform> unif: Uniforms;

    struct VertexOutput {
        @builtin(position) pos: vec4f,
        @location(0) color: vec4f,
        @location(1) localPos: vec2f,
    };

    @vertex
    fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VertexOutput {
        var out: VertexOutput;
        let base = ii * 5u; // 5 floats per particle in C++ struct
        let px = pData[base + 0u];
        let py = pData[base + 1u];
        let cIdx = u32(pData[base + 4u]);

        // 6 vertices form a quad (square) for each particle
        var corners = array<vec2f, 6>(
            vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
            vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0)
        );
        let offset = corners[vi];
        out.localPos = offset;

        let pixelPos = vec2f(px, py) + offset * unif.radius;
        let clipX = (pixelPos.x / unif.res.x) * 2.0 - 1.0;
        let clipY = 1.0 - (pixelPos.y / unif.res.y) * 2.0;

        out.pos = vec4f(clipX, clipY, 0.0, 1.0);
        out.color = palette[cIdx];
        return out;
    }

    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
        // Discard pixels outside the radius to make a perfect circle
        if (length(in.localPos) > 1.0) {
            discard;
        }
        return in.color;
    }
    `;

    const module = device.createShaderModule({ code: wgslShader });
    const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs_main' },
        fragment: { module, entryPoint: 'fs_main', targets: [{ format: presentationFormat }] },
        primitive: { topology: 'triangle-list' }
    });

    // Create GPU Buffers
    const maxParticles = 25000;
    const particleBuffer = device.createBuffer({
        size: maxParticles * 5 * 4, // 5 floats per particle * 4 bytes
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const paletteBuffer = device.createBuffer({
        size: 20 * 4 * 4, // Max 20 colors * vec4f * 4 bytes
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const uniformBuffer = device.createBuffer({
        size: 16, // resX, resY, radius, padding (4 floats)
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: particleBuffer } },
            { binding: 1, resource: { buffer: paletteBuffer } },
            { binding: 2, resource: { buffer: uniformBuffer } },
        ],
    });

    const hasGpuTimestamps = device.features.has('timestamp-query');
    const gpuQuerySet = hasGpuTimestamps ? device.createQuerySet({ type: 'timestamp', count: 2 }) : null;
    const gpuResolveBuffer = hasGpuTimestamps ? device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    }) : null;
    const gpuReadbackBuffer = hasGpuTimestamps ? device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    }) : null;

    // --- APP LOGIC ---
    let count = 0;
    let currentColors = 0;
    let particleDataPointer = 0;
    let lastTime = performance.now();
    let frames = 0;
    let lastFps = 0;
    let accumPhys = 0;
    let accumRender = 0;
    let previousFrameTime = performance.now();
    let frameTimes = [];
    let missedFrames = 0;
    let gpuTimeMs = null;
    let gpuTimeSum = 0;
    let gpuSamples = 0;
    let gpuReadbackPending = false;
    const metricsDiv = document.getElementById('metrics');
    let metricsContent = 'FPS: 0 | 1%: 0<br>Frame: 0.00ms | Missed: 0<br>' +
        'Phys: 0.00ms | CPU Render: 0.00ms<br>GPU: N/A<br>Particles: 0 | DPR: 1.00';

    const gearBtn = document.getElementById('gearBtn');
    const panel = document.getElementById('panel');
    const metricsBtn = document.getElementById('metricsBtn');
    const applySizesBtn = document.getElementById('applySizesBtn');
    const randomBtn = document.getElementById('randomBtn');
    const speedInput = document.getElementById('speedInput');
    const colorInput = document.getElementById('colorInput');
    const particleInput = document.getElementById('particleInput');
    const rminInput = document.getElementById('rminInput');
    const rmaxInput = document.getElementById('rmaxInput');
    const fricInput = document.getElementById('fricInput');
    const repelInput = document.getElementById('repelInput');

    bindSlider('speedInput', 'speedVal');
    bindSlider('rminInput', 'rminVal');
    bindSlider('rmaxInput', 'rmaxVal');
    bindSlider('fricInput', 'fricVal');
    bindSlider('repelInput', 'repelVal');

    gearBtn.addEventListener('click', () => {
        const opening = panel.style.display === 'none';
        panel.style.display = opening ? 'block' : 'none';
        if (opening) {
            metricsDiv.style.display = 'none';
        }
    });

    metricsBtn.addEventListener('click', () => {
        const opening = metricsDiv.style.display === 'none';
        if (opening) {
            metricsDiv.innerHTML = metricsContent;
        }
        metricsDiv.style.display = opening ? 'block' : 'none';
    });

    document.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() !== 'm') {
            return;
        }

        const isVisible = metricsBtn.style.display !== 'none';
        metricsBtn.style.display = isVisible ? 'none' : 'flex';
        if (isVisible) {
            metricsDiv.style.display = 'none';
        }
    });

    function renderMatrixUI(numColors, colorsHSL) {
        const container = document.getElementById('matrixContainer');
        container.style.gridTemplateColumns = `20px repeat(${numColors}, 1fr)`;
        container.innerHTML = '<div></div>'; 
        
        for (let c = 0; c < numColors; c++) {
            const header = document.createElement('div');
            header.className = 'matrix-header';
            header.style.backgroundColor = colorsHSL[c];
            container.appendChild(header);
        }

        const matrixPtr = Module._getMatrix();
        const matrixData = Module.HEAPF32.subarray(matrixPtr / 4, (matrixPtr / 4) + (numColors * numColors));

        for (let row = 0; row < numColors; row++) {
            const rowHeader = document.createElement('div');
            rowHeader.className = 'matrix-header';
            rowHeader.style.backgroundColor = colorsHSL[row];
            container.appendChild(rowHeader);

            for (let col = 0; col < numColors; col++) {
                const rule = matrixData[row * numColors + col];
                const cell = document.createElement('div');
                cell.style.width = '100%';
                cell.style.aspectRatio = '1';
                cell.style.display = 'flex';
                cell.style.alignItems = 'center';
                cell.style.justifyContent = 'center';
                cell.style.fontSize = '11px';
                cell.style.borderRadius = '4px';
                
                const intensity = Math.abs(rule);
                cell.style.backgroundColor = rule < 0 
                    ? `rgba(239, 68, 68, ${intensity})` 
                    : `rgba(34, 197, 94, ${intensity})`;
                
                cell.style.color = intensity > 0.5 ? '#fff' : 'rgba(255,255,255,0.5)';
                cell.innerText = rule.toFixed(1);
                container.appendChild(cell);
            }
        }
    }

    function restartEngine() {
        currentColors = parseInt(colorInput.value);
        count = parseInt(particleInput.value);
        if (count > maxParticles) count = maxParticles;

        let colorsHSL = [];
        let paletteRaw = new Float32Array(currentColors * 4);

        for (let i = 0; i < currentColors; i++) {
            let hue = (i * 360) / currentColors;
            colorsHSL.push(`hsl(${hue}, 100%, 60%)`);
            let rgb = hslToRgb(hue, 100, 60);
            paletteRaw.set(rgb, i * 4);
        }

        // Upload palette to GPU
        device.queue.writeBuffer(paletteBuffer, 0, paletteRaw);

        Module._init_matrix(currentColors);
        Module._init_particles(canvas.width, canvas.height, count);
        particleDataPointer = Module._getData();

        renderMatrixUI(currentColors, colorsHSL);
    }

    function applyRules(type) {
        const matrixPtr = Module._getMatrix();
        const matrixData = Module.HEAPF32.subarray(matrixPtr / 4, (matrixPtr / 4) + (currentColors * currentColors));

        if (type === 'random') {
            for(let i = 0; i < matrixData.length; i++) matrixData[i] = Math.random() * 2.0 - 1.0;
        } else if (PRESETS[type]) {
            const p = PRESETS[type](currentColors);
            speedInput.value = p.speed;     document.getElementById('speedVal').innerText = p.speed;
            rminInput.value = p.rmin;       document.getElementById('rminVal').innerText = p.rmin;
            rmaxInput.value = p.rmax;       document.getElementById('rmaxVal').innerText = p.rmax;
            fricInput.value = p.fric;       document.getElementById('fricVal').innerText = p.fric;
            repelInput.value = p.repel;     document.getElementById('repelVal').innerText = p.repel;
            for(let i = 0; i < matrixData.length; i++) matrixData[i] = p.matrix[i];
        }
        
        // Re-render UI colors based on current HSL array
        let colorsHSL = [];
        for (let i = 0; i < currentColors; i++) colorsHSL.push(`hsl(${(i * 360) / currentColors}, 100%, 60%)`);
        renderMatrixUI(currentColors, colorsHSL);
    }

    applySizesBtn.addEventListener('click', restartEngine);
    randomBtn.addEventListener('click', () => applyRules('random'));
    document.getElementById('btnCells').addEventListener('click', () => applyRules('cells'));
    document.getElementById('btnChains').addEventListener('click', () => applyRules('chains'));
    document.getElementById('btnEcosystem').addEventListener('click', () => applyRules('ecosystem'));

    function draw() {
        const t0 = performance.now();
        const speed = parseFloat(speedInput.value);
        const r_min = parseFloat(rminInput.value);
        const r_max = parseFloat(rmaxInput.value);
        const repel = parseFloat(repelInput.value);
        const cFriction = 1.0 - parseFloat(fricInput.value); 

        // 1. Calculate Physics on CPU/WASM
        Module._step(canvas.width, canvas.height, speed, r_min, r_max, cFriction, repel);
        const t1 = performance.now();
        
        // 2. Upload WASM memory directly to GPU Storage Buffer
        const wasmMemory = Module.HEAPF32.buffer;
        device.queue.writeBuffer(
            particleBuffer, 
            0, 
            wasmMemory, 
            particleDataPointer, // byteOffset where particle data starts
            count * 5 * 4      // total bytes to copy
        );

        // 3. Upload screen resolution and radius
        device.queue.writeBuffer(
            uniformBuffer, 
            0, 
            new Float32Array([canvas.width, canvas.height, 3.0, 0.0])
        );

        // 4. Render
        const commandEncoder = device.createCommandEncoder();
        const renderPassDescriptor = {
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                clearValue: { r: 0.05, g: 0.05, b: 0.07, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }]
        };
        if (gpuQuerySet) {
            renderPassDescriptor.timestampWrites = {
                querySet: gpuQuerySet,
                beginningOfPassWriteIndex: 0,
                endOfPassWriteIndex: 1,
            };
        }
        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        // Draw 6 vertices per particle (quad), 'count' instances
        passEncoder.draw(6, count, 0, 0);
        passEncoder.end();

        if (gpuQuerySet) {
            commandEncoder.resolveQuerySet(gpuQuerySet, 0, 2, gpuResolveBuffer, 0);
            if (!gpuReadbackPending) {
                commandEncoder.copyBufferToBuffer(gpuResolveBuffer, 0, gpuReadbackBuffer, 0, 16);
                gpuReadbackPending = true;
            }
        }
        device.queue.submit([commandEncoder.finish()]);
        const t2 = performance.now();
        if (gpuReadbackPending && gpuReadbackBuffer.mapState === 'unmapped') {
            gpuReadbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
                const timestamps = new BigUint64Array(gpuReadbackBuffer.getMappedRange());
                const elapsedNanoseconds = Number(timestamps[1] - timestamps[0]);
                gpuTimeMs = elapsedNanoseconds / 1000000;
                gpuTimeSum += gpuTimeMs;
                gpuSamples++;
                gpuReadbackBuffer.unmap();
                gpuReadbackPending = false;
            }).catch((error) => {
                console.error('Unable to read GPU timestamp query:', error);
                gpuReadbackPending = false;
            });
        }
        const frameTime = t2 - previousFrameTime;
        previousFrameTime = t2;
        accumPhys += (t1 - t0);
        accumRender += (t2 - t1);
        frameTimes.push(frameTime);
        if (frameTime > (1000 / 60) * 1.1) {
            missedFrames++;
        }
        frames++;

        if (t2 - lastTime >= 1000) {
            const avgPhys = (accumPhys / frames).toFixed(2);
            const avgRender = (accumRender / frames).toFixed(2);
            const avgFrame = (frameTimes.reduce((sum, time) => sum + time, 0) / frameTimes.length).toFixed(2);
            const sortedFrameTimes = [...frameTimes].sort((a, b) => b - a);
            const slowestCount = Math.max(1, Math.ceil(sortedFrameTimes.length * 0.01));
            const onePercentLow = (1000 / (sortedFrameTimes
                .slice(0, slowestCount)
                .reduce((sum, time) => sum + time, 0) / slowestCount)).toFixed(0);
            const averageGpu = gpuSamples > 0 ? `${(gpuTimeSum / gpuSamples).toFixed(2)}ms` : 'N/A';
            const dpr = window.devicePixelRatio || 1;
            metricsContent = `FPS: ${frames} | 1%: ${onePercentLow}<br>` +
                `Frame: ${avgFrame}ms | Missed: ${missedFrames}<br>` +
                `Phys: ${avgPhys}ms | CPU Render: ${avgRender}ms<br>` +
                `GPU: ${averageGpu}<br>` +
                `Particles: ${count} | DPR: ${dpr.toFixed(2)}`;
            if (metricsDiv.style.display !== 'none') {
                metricsDiv.innerHTML = metricsContent;
            }
            frames = 0;
            accumPhys = 0;
            accumRender = 0;
            frameTimes = [];
            missedFrames = 0;
            gpuTimeSum = 0;
            gpuSamples = 0;
            lastTime = t2;
        }
        
        requestAnimationFrame(draw);
    }
    
    restartEngine();
    applyRules('chains');
    draw();
};