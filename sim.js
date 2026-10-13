const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- DYNAMIC PRESET GENERATORS ---
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

Module.onRuntimeInitialized = function() {
    let count = 0;
    let particleData;
    let colors = [];
    let currentColors = 0;

    const gearBtn = document.getElementById('gearBtn');
    const panel = document.getElementById('panel');
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
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    function renderMatrixUI(numColors) {
        const container = document.getElementById('matrixContainer');
        container.style.gridTemplateColumns = `20px repeat(${numColors}, 1fr)`;
        container.innerHTML = '<div></div>'; 
        
        for (let c = 0; c < numColors; c++) {
            const header = document.createElement('div');
            header.className = 'matrix-header';
            header.style.backgroundColor = colors[c];
            container.appendChild(header);
        }

        const matrixPtr = Module._getMatrix();
        const matrixData = Module.HEAPF32.subarray(matrixPtr / 4, (matrixPtr / 4) + (numColors * numColors));

        for (let row = 0; row < numColors; row++) {
            const rowHeader = document.createElement('div');
            rowHeader.className = 'matrix-header';
            rowHeader.style.backgroundColor = colors[row];
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
        const numParticles = parseInt(particleInput.value);

        colors = [];
        for (let i = 0; i < currentColors; i++) {
            colors.push(`hsl(${(i * 360) / currentColors}, 100%, 60%)`);
        }

        Module._init_matrix(currentColors);
        Module._init_particles(canvas.width, canvas.height, numParticles);

        const pointer = Module._getData();
        count = Module._getParticleCount();
        particleData = Module.HEAPF32.subarray(pointer / 4, (pointer / 4) + (count * 5));

        renderMatrixUI(currentColors);
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
        
        renderMatrixUI(currentColors);
    }

    applySizesBtn.addEventListener('click', restartEngine);
    randomBtn.addEventListener('click', () => applyRules('random'));
    document.getElementById('btnCells').addEventListener('click', () => applyRules('cells'));
    document.getElementById('btnChains').addEventListener('click', () => applyRules('chains'));
    document.getElementById('btnEcosystem').addEventListener('click', () => applyRules('ecosystem'));

    function draw() {
        const speed = parseFloat(speedInput.value);
        const r_min = parseFloat(rminInput.value);
        const r_max = parseFloat(rmaxInput.value);
        const repel = parseFloat(repelInput.value);
        const cFriction = 1.0 - parseFloat(fricInput.value); 

        // Advance Physics
        Module._step(canvas.width, canvas.height, speed, r_min, r_max, cFriction, repel);
        
        // Clear screen with a solid dark color
        ctx.fillStyle = '#0d0d12';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // --- HIGH PERFORMANCE BATCH RENDERING ---
        // Loop through each color palette ONCE
        for (let c = 0; c < currentColors; c++) {
            ctx.fillStyle = colors[c];
            ctx.beginPath();
            
            // Draw all particles of this color in a single path
            for (let i = 0; i < count; i++) {
                let base = i * 5;
                let colorIndex = particleData[base + 4];

                if (colorIndex === c) {
                    let x = particleData[base];
                    let y = particleData[base + 1];
                    // Rectangles draw much faster than round arcs on CPU
                    ctx.rect(x - 1.5, y - 1.5, 3, 3);
                }
            }
            // Execute the batch draw
            ctx.fill();
        }
        
        requestAnimationFrame(draw);
    }
    
    restartEngine();
    applyRules('chains'); 
    draw();
};