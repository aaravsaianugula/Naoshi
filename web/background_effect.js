import * as THREE from 'three';

export class BackgroundEffect {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.uniforms = null;
        this.rafId = null;

        this.init();
    }

    init() {
        // Setup separate scene for background
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: false,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // optimize
        this.container.appendChild(this.renderer.domElement);

        // Fluid Shader
        const geometry = new THREE.PlaneGeometry(2, 2);

        this.uniforms = {
            uTime: { value: 0 },
            uMouse: { value: new THREE.Vector2(0.5, 0.5) },
            uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            uColor1: { value: new THREE.Color(0xdce5f2) }, // Zinc 100
            uColor2: { value: new THREE.Color(0xeff6ff) }, // Blue 50
            uColorAccent: { value: new THREE.Color(0x2563EB) } // Brand Blue
        };

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform vec2 uMouse;
                uniform vec2 uResolution;
                uniform vec3 uColor1;
                uniform vec3 uColor2;
                uniform vec3 uColorAccent;
                
                varying vec2 vUv;

                // Noise functions
                vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

                float snoise(vec2 v) {
                    const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                                      0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                                     -0.577350269189626,  // -1.0 + 2.0 * C.x
                                      0.024390243902439); // 1.0 / 41.0
                    vec2 i  = floor(v + dot(v, C.yy) );
                    vec2 x0 = v -   i + dot(i, C.xx);
                    vec2 i1;
                    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
                    vec4 x12 = x0.xyxy + C.xxzz;
                    x12.xy -= i1;
                    i = mod289(i); // Avoid truncation effects in permutation
                    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
                        + i.x + vec3(0.0, i1.x, 1.0 ));
                    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
                    m = m*m ;
                    m = m*m ;
                    vec3 x = 2.0 * fract(p * C.www) - 1.0;
                    vec3 h = abs(x) - 0.5;
                    vec3 ox = floor(x + 0.5);
                    vec3 a0 = x - ox;
                    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
                    vec3 g;
                    g.x  = a0.x  * x0.x  + h.x  * x0.y;
                    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
                    return 130.0 * dot(m, g);
                }

                void main() {
                    vec2 st = gl_FragCoord.xy / uResolution.xy;
                    float aspect = uResolution.x / uResolution.y;
                    st.x *= aspect;

                    // Mouse influence
                    vec2 mousePos = uMouse;
                    mousePos.x *= aspect;
                    float dist = distance(st, mousePos);
                    float mouseInfluence = smoothstep(0.5, 0.0, dist) * 0.5;

                    // Liquid Noise Flow Needs 2 layers
                    float time = uTime * 0.2;
                    
                    // Warping
                    vec2 q = vec2(0.);
                    q.x = snoise(st + time * 0.1);
                    q.y = snoise(st + vec2(1.0));

                    vec2 r = vec2(0.);
                    r.x = snoise(st + 1.0 * q + vec2(1.7, 9.2) + 0.15 * time);
                    r.y = snoise(st + 1.0 * q + vec2(8.3, 2.8) + 0.126 * time);

                    float f = snoise(st + r + mouseInfluence);

                    // Color Mixing
                    vec3 color = mix(uColor1, uColor2, f);
                    
                    // Add subtle iridescence/accent
                    float accentShape = smoothstep(0.4, 0.6, snoise(st * 2.0 - time));
                    color = mix(color, uColorAccent, accentShape * 0.05);

                    // Vignette to fade edges
                    float vignette = 1.0 - length(vUv - 0.5) * 0.5;
                    color *= vignette;

                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });

        const mesh = new THREE.Mesh(geometry, material);
        this.scene.add(mesh);

        // Listeners
        window.addEventListener('resize', this.onResize.bind(this));
        window.addEventListener('mousemove', this.onMouseMove.bind(this));

        this.animate();
    }

    onMouseMove(e) {
        // Normalized 0-1
        this.uniforms.uMouse.value.x = e.clientX / window.innerWidth;
        this.uniforms.uMouse.value.y = 1.0 - (e.clientY / window.innerHeight);
    }

    onResize() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.uniforms.uResolution.value.x = window.innerWidth;
        this.uniforms.uResolution.value.y = window.innerHeight;
    }

    animate() {
        this.rafId = requestAnimationFrame(this.animate.bind(this));
        this.uniforms.uTime.value += 0.01;
        this.renderer.render(this.scene, this.camera);
    }

    destroy() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        window.removeEventListener('resize', this.onResize.bind(this));
        window.removeEventListener('mousemove', this.onMouseMove.bind(this));
        if (this.container && this.renderer) {
            this.container.removeChild(this.renderer.domElement);
        }
    }
}
