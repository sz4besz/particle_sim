const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- PRESETS ---
// These specific matrices create known emergent behaviors
const PRESETS = {
    'cells': {
        colors: 3, particles: 2000, speed: 0.5, rmin: 15, rmax: 80, fric: 0.15, repel: 3.0,
        matrix: [ // Like colors attract strongly, opposites repel
             1.0, -0.5, -0.5,
            -0.5,  1.0, -0.5,
            -0.5, -0.5,  1.0
        ]
    },
    'snakes': {
        colors: 4, particles: 1800, speed: 0.8, rmin: 10, rmax: 55, fric: 0.10, repel: 2.0,
        matrix: [ // Asymmetric hunting: A chases B, B chases C, etc.
             0.2,  1.0, -1.0, -1.0,
            -1.0,  0.2,  1.0, -1.0,
            -1.0, -1.0,  0.2,  1.0,
             1.0, -1.0, -1.0,  0.2
        ]
    },
    'ecosystem': {
        colors: 5, particles: 2500, speed: 0.5, rmin: 12, rmax: 90, fric: 0.20, repel: 4.0,
        matrix: [ // Complex chains of attraction and repulsion
             0.8, -0.2,  0.5, -0.5,  0.0,
            -0.5,  0.7, -0.2,  0.5,  0.0,
             0.0, -0.5,  0.9, -0.2,  0.5,
             0.5,  0.0, -0.5,  0.8, -0.2,
            -0.2,  0.5,  0.0, -0.5,  0.7
        ]
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

    const gearBtn = document.getElementById('gearBtn');
    const panel = document.getElementById('panel');
    const restartBtn = document.getElementById('restartBtn');
    
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
                if (rule < 0) {
                    cell.style.backgroundColor = `rgba(239, 68, 68, ${intensity})`; 
                } else {
                    cell.style.backgroundColor = `rgba(34, 197, 94, ${intensity})`; 
                }
                
                cell.style.color = intensity > 0.5 ? '#fff' : 'rgba(255,255,255,0.5)';
                cell.innerText = rule.toFixed(1);
                container.appendChild(cell);
            }
        }
    }

    function initSim(presetName = null) {
        // If a preset was clicked, override the UI sliders
        if (presetName && PRESETS[presetName]) {
            const p = PRESETS[presetName];
            colorInput.value = p.colors;
            particleInput.value = p.particles;
            speedInput.value = p.speed;     document.getElementById('speedVal').innerText = p.speed;
            rminInput.value = p.rmin;       document.getElementById('rminVal').innerText = p.rmin;
            rmaxInput.value = p.rmax;       document.getElementById('rmaxVal').innerText = p.rmax;
            fricInput.value = p.fric;       document.getElementById('fricVal').innerText = p.fric;
            repelInput.value = p.repel;     document.getElementById('repelVal').innerText = p.repel;
        }

        const numColors = parseInt(colorInput.value);
        const numParticles = parseInt(particleInput.value);

        colors = [];
        for (let i = 0; i < numColors; i++) {
            colors.push(`hsl(${(i * 360) / numColors}, 100%, 60%)`);
        }

        // Initialize C++ (This normally randomizes the rules)
        Module._init_matrix(numColors);
        Module._init_particles(canvas.width, canvas.height, numParticles);

        // If using a preset, manually overwrite the C++ memory array with our exact rules
        if (presetName && PRESETS[presetName]) {
            const p = PRESETS[presetName];
            const matrixPtr = Module._getMatrix();
            const matrixData = Module.HEAPF32.subarray(matrixPtr / 4, (matrixPtr / 4) + (p.colors * p.colors));
            for(let i = 0; i < p.matrix.length; i++) {
                matrixData[i] = p.matrix[i];
            }
        }

        const pointer = Module._getData();
        count = Module._getParticleCount();
        particleData = Module.HEAPF32.subarray(pointer / 4, (pointer / 4) + (count * 5));

        renderMatrixUI(numColors);
    }

    // Hook up buttons
    restartBtn.addEventListener('click', () => initSim(null)); // Random
    document.getElementById('btnCells').addEventListener('click', () => initSim('cells'));
    document.getElementById('btnSnakes').addEventListener('click', () => initSim('snakes'));
    document.getElementById('btnEcosystem').addEventListener('click', () => initSim('ecosystem'));

    function draw() {
        const speed = parseFloat(speedInput.value);
        const r_min = parseFloat(rminInput.value);
        const r_max = parseFloat(rmaxInput.value);
        const repel = parseFloat(repelInput.value);
        
        // Invert friction for C++
        const rawFrictionValue = parseFloat(fricInput.value);
        const cFriction = 1.0 - rawFrictionValue; 

        Module._step(canvas.width, canvas.height, speed, r_min, r_max, cFriction, repel);
        
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
        
        requestAnimationFrame(draw);
    }
    
    initSim('cells'); // Start with the Cells preset loaded
    draw();
};