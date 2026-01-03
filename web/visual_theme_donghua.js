import * as THREE from 'three';

/**
 * THEME: DONGHUA (Ghibli / Shinkai Opening)
 * Concept: "Romantic Sky" / Emotional Anime Movie.
 * Colors: Pastel Blue, Soft Cloud White, Sunset Pink.
 * Vibe: Nostalgic, Cinematic, Soft, High-Quality.
 */

// 1. Soft Anime Toon Shader (The Object)
// Mimics high-quality 2D animation (Ghibli style)
export function createToonMaterial(color = 0xffffff) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uBaseColor: { value: new THREE.Color(0xfffdf5) }, // Creamy White (Not harsh white)
            uShadowColor: { value: new THREE.Color(0xaeb4c8) }, // Periwinkle Shadow (Not grey)
            uHighlight: { value: new THREE.Color(0xffe4bc) }, // Peach Sunlight Rim
            uOutlineColor: { value: new THREE.Color(0x8a6c58) }, // Brownish Line (Pencil)
            uProgress: { value: 0 },
            uTime: { value: 0 },
            uMinY: { value: 0 },
            uMaxY: { value: 100 }
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vPosition;
            
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uBaseColor;
            uniform vec3 uShadowColor;
            uniform vec3 uHighlight;
            uniform float uProgress;
            uniform float uMinY;
            uniform float uMaxY;
            
            varying vec3 vNormal;
            varying vec3 vPosition;
            
            void main() {
                vec3 viewDir = normalize(cameraPosition - vPosition);
                vec3 lightDir = normalize(vec3(0.5, 0.8, 1.0)); // Soft Daylight
                
                // --- SOFT ANIME SHADING ---
                // Flip normal if backfacing (for DoubleSide)
                vec3 normal = gl_FrontFacing ? vNormal : -vNormal;
                
                float NdotL = dot(normal, lightDir);
                
                // 1. Shadow Ramp (Soft Cel)
                float shadow = smoothstep(-0.2, 0.2, NdotL);
                vec3 albedo = mix(uShadowColor, uBaseColor, shadow);
                
                // 2. Rim Light (Sunlight)
                float NdotV = dot(normal, viewDir);
                float rim = 1.0 - max(0.0, NdotV);
                rim = smoothstep(0.6, 1.0, rim);
                
                vec3 finalColor = mix(albedo, uHighlight, rim * 0.5); // 50% Sun rim
                
                // --- PROGRESSION ---
                // h = 0 at bottom, 1 at top
                // We want repair to sweep from BOTTOM to TOP
                // So "repaired" means h <= uProgress (bottom portion)
                float h = (vPosition.y - uMinY) / (uMaxY - uMinY);
                float dist = uProgress - h; // Inverted so band moves UP
                
                // Magic Band (The "Repair Ray")
                float band = 1.0 - smoothstep(0.0, 0.15, abs(dist)); // Wider band
                vec3 magicColor = vec3(0.4, 0.95, 1.0); // Bright Cyan glow
                
                if (h > uProgress) {
                    // UNREPAIRED: Above the progress line = "Sketch / Memory"
                    // Soft grey/blue tint with pencil edges
                    
                    // Paper noise (Simulated with World Position)
                    float paper = fract(sin(dot(vPosition.xy, vec2(12.9898, 78.233))) * 43758.5453);
                    
                    // Sketch look: desaturated with pencil lines
                    vec3 sketch = vec3(0.6, 0.6, 0.65); // Light grey-blue
                    
                    // Edge detection logic (Fake via normal)
                    float edge = 1.0 - abs(dot(normal, viewDir));
                    edge = smoothstep(0.0, 0.4, edge);
                    
                    // Mix paper and "pencil" lines
                    vec3 pencil = vec3(0.3, 0.25, 0.25); // Dark brown pencil
                    finalColor = mix(sketch, pencil, edge * 0.5);
                } else {
                    // REPAIRED: Below the progress line = "Living Anime Character"
                    // Keep the beautiful Ghibli shading calculated above
                    float upFace = dot(normal, vec3(0,1,0));
                    if(upFace > 0.8) finalColor = mix(finalColor, vec3(1.0, 0.85, 0.85), 0.15); // Top surfaces slightly pink
                }

                // Apply Magic Band
                finalColor += magicColor * band * 0.6;
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `,
        side: THREE.DoubleSide
    });
}

// 2. Rising Spirit Motes (Particles)
// Soft, glowing orbs rising slowly like in a Ghibli forest spirit scene
export class SpiritWisps {
    constructor(scene, count = 150) {
        this.scene = scene;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const randoms = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 200;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 300; // Taller spread
            positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
            randoms[i * 3] = Math.random();
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 3));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0xfffeed) } // Warm White
            },
            vertexShader: `
                attribute vec3 aRandom;
                uniform float uTime;
                varying float vAlpha;
                
                void main() {
                    float t = uTime * 0.1 + aRandom.y * 10.0;
                    vec3 pos = position;
                    
                    // Slow Rise
                    pos.y += t * 10.0;
                    pos.y = mod(pos.y + 150.0, 300.0) - 150.0;
                    
                    // Meander
                    pos.x += sin(t + pos.y * 0.05) * 5.0;
                    pos.z += cos(t * 0.8 + pos.x * 0.05) * 5.0;
                    
                    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mv;
                    
                    gl_PointSize = (6.0 * aRandom.x + 2.0) * (200.0 / -mv.z);
                    vAlpha = 0.6 * sin(t + aRandom.z * 10.0) + 0.2; // Pulse
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                varying float vAlpha;
                void main() {
                    vec2 uv = gl_PointCoord - 0.5;
                    float d = length(uv);
                    
                    // Soft Glow
                    float glow = 1.0 - smoothstep(0.0, 0.5, d);
                    
                    if(glow < 0.01) discard;
                    gl_FragColor = vec4(uColor, glow * vAlpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.points = new THREE.Points(geometry, material);
        this.scene.add(this.points);
    }

    update(time) {
        this.points.material.uniforms.uTime.value = time;
    }

    dispose() {
        this.scene.remove(this.points);
        this.points.geometry.dispose();
        this.points.material.dispose();
    }
}

// 3. Shinkai Watercolor Sky (Background)
// The "Money Shot". Pastel gradient with soft cloud wisps.
export class InkWashBackground {
    constructor(scene) {
        this.scene = scene;
        const geometry = new THREE.SphereGeometry(800, 32, 32);
        geometry.scale(-1, 1, 1);

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uTop: { value: new THREE.Color(0x6a0abc) }, // Deep Sky
                uBot: { value: new THREE.Color(0xff9a9e) }  // Peach/Pink
            },
            vertexShader: `
                varying vec3 vWorldPos;
                varying vec2 vUv;
                void main() {
                    vWorldPos = position;
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                varying vec3 vWorldPos;
                varying vec2 vUv;

                void main() {
                    vec3 norm = normalize(vWorldPos);
                    float y = norm.y * 0.5 + 0.5;

                    // 1. SIMPLE GRADIENT (Safe & Pastel)
                    vec3 topColor = vec3(0.53, 0.81, 0.98); // Light Sky Blue
                    vec3 botColor = vec3(1.0, 0.8, 0.8);    // Soft Pink

                    vec3 finalColor = mix(botColor, topColor, smoothstep(0.3, 0.7, y));

                    // Subtle Vignette
                    float dist = length(vUv - 0.5);
                    finalColor *= (1.0 - dist * 0.4);

                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            side: THREE.BackSide
        });

        this.mesh = new THREE.Mesh(geometry, material);
    }

    getMesh() { return this.mesh; }
}

// 4. Scanning Laser (The "Repair Plane")
// A horizontal plane of light that moves up with the repair progress.
export class ScanningLaser {
    constructor(scene) {
        this.scene = scene;
        const geometry = new THREE.PlaneGeometry(200, 200);
        geometry.rotateX(-Math.PI / 2); // Horizontal

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0x00ffff) }, // Cyan Laser
                uProgress: { value: 0 },
                uMinY: { value: 0 },
                uMaxY: { value: 100 }
            },
            vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
            fragmentShader: `
                    uniform vec3 uColor;
                    uniform float uTime;
                    varying vec2 vUv;

                    void main() {
                        // Circular fade
                        float dist = length(vUv - 0.5) * 2.0; // 0 to 1
                        float alpha = 1.0 - smoothstep(0.8, 1.0, dist);

                        // Grid / Laser pattern
                        float grid = abs(sin(vUv.x * 50.0 + uTime)) * abs(sin(vUv.y * 50.0 - uTime));
                        alpha *= (0.5 + 0.5 * grid);

                        // Bright core
                        alpha += 0.5 * (1.0 - smoothstep(0.0, 0.9, dist));

                        if (alpha < 0.01) discard;
                        gl_FragColor = vec4(uColor, alpha * 0.8);
                    }
                `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.visible = false;
        this.scene.add(this.mesh);
    }

    update(time, progress, minY, maxY) {
        if (!this.mesh.visible) return;

        // Move mesh to current progress height
        const height = minY + (maxY - minY) * progress;
        this.mesh.position.y = height;

        this.mesh.material.uniforms.uTime.value = time;
        this.mesh.material.uniforms.uProgress.value = progress;
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
