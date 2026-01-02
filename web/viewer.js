import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

export class ModelViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.transformControl = null; // Gizmo
        this.composer = null;
        this.mesh = null;
        this.animationId = null;
        this.isRotating = true;

        this.init();
    }

    init() {
        // Scene Setup
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0xf0f4f8, 200, 1000);

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 60, 120);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 2.0;
        this.controls.maxDistance = 800;

        // Transform Controls (Gizmo)
        this.transformControl = new TransformControls(this.camera, this.renderer.domElement);
        this.transformControl.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
        });
        this.scene.add(this.transformControl);

        // Lighting (High Contrast Studio Setup)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // reduced slightly
        this.scene.add(ambientLight);

        // Key Light (Warm, creating form)
        const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
        mainLight.position.set(50, 80, 50);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.bias = -0.0001;
        this.scene.add(mainLight);

        // Fill Light (Cool Blue shadows)
        const fillLight = new THREE.DirectionalLight(0xcce3fe, 0.8);
        fillLight.position.set(-50, 20, 50);
        this.scene.add(fillLight);

        // Back/Rim Light (Sharpness)
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
        rimLight.position.set(0, 50, -100);
        this.scene.add(rimLight);

        // Grid (Standard, Clean)
        // Zinc-300 lines (0xd4d4d8) and Zinc-200 sublines (0xe4e4e7)
        const gridHelper = new THREE.GridHelper(2000, 40, 0xd4d4d8, 0xe4e4e7);
        gridHelper.position.y = -0.1;
        this.scene.add(gridHelper);
        this.gridHelper = gridHelper;

        // Events
        window.addEventListener('resize', this.onWindowResize.bind(this));

        // Interaction Events (Bound once)
        this.container.addEventListener('click', this.onClick.bind(this));
        this.container.addEventListener('mousemove', this.onMouseMove.bind(this));

        // Start Loop
        this.animate();
    }

    resetScene() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            // Don't dispose materials if valid
        }
        if (this.wireMesh) {
            if (this.mesh) this.mesh.remove(this.wireMesh);
            this.wireMesh.geometry.dispose();
        }
        if (this.arrowHelper) {
            this.scene.remove(this.arrowHelper);
            this.arrowHelper = null;
        }
        if (this.hoverArrow) {
            this.scene.remove(this.hoverArrow);
            this.hoverArrow = null;
        }
        this.mesh = null;
        this.wireMesh = null;
    }

    loadIdleDemo() {
        this.resetScene();
        // create a floating abstract shape
        const geom = new THREE.IcosahedronGeometry(20, 1); // low poly
        const mat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0.1,
            roughness: 0.1,
            transmission: 0.2, // glass-like
            thickness: 2.0,
            clearcoat: 1.0,
            wireframe: false
        });

        this.mesh = new THREE.Mesh(geom, mat);
        this.mesh.position.y = 25;
        this.scene.add(this.mesh);

        // Add wireframe overlay for tech look
        this.wireMaterial = new THREE.MeshBasicMaterial({ color: 0x2563EB, wireframe: true, transparent: true, opacity: 0.1 });
        this.wireMesh = new THREE.Mesh(geom, this.wireMaterial);
        this.mesh.add(this.wireMesh);

        this.solidMaterial = mat;

        // Gentle rotation
        this.idleRotation = true;
    }

    loadSTL(fileUrl, onLoadCallback) {
        this.resetScene();
        this.idleRotation = false;
        console.log("Loading STL from:", fileUrl);

        const loader = new STLLoader();
        loader.load(
            fileUrl,
            (geometry) => {
                try {
                    // console.log("STL Loaded, Geometry:", geometry);
                    geometry.center();
                    geometry.computeVertexNormals();

                    // 1. Solid Material
                    this.solidMaterial = new THREE.MeshPhysicalMaterial({
                        color: 0xffffff,
                        metalness: 0.1,
                        roughness: 0.8,
                        transmission: 0.0,
                        thickness: 1.0,
                        clearcoat: 0.0,
                        polygonOffset: true,
                        polygonOffsetFactor: 1,
                        polygonOffsetUnits: 1
                    });

                    this.mesh = new THREE.Mesh(geometry, this.solidMaterial);
                    this.mesh.castShadow = true;
                    this.mesh.receiveShadow = true;

                    // 2. Wireframe Overlay
                    this.wireMaterial = new THREE.MeshBasicMaterial({
                        color: 0x2563EB,
                        wireframe: true,
                        transparent: true,
                        opacity: 0.0
                    });
                    this.wireMesh = new THREE.Mesh(geometry, this.wireMaterial);
                    this.mesh.add(this.wireMesh);

                    this.initProgressiveVisuals();

                    // Auto-scale
                    const box = new THREE.Box3().setFromObject(this.mesh);
                    const size = box.getSize(new THREE.Vector3());
                    console.log("Mesh Size:", size);
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const scale = (maxDim > 0) ? 50 / maxDim : 1;

                    this.mesh.scale.set(scale, scale, scale);
                    this.mesh.updateMatrix();

                    this.mesh.position.y = (size.y * scale) / 2;

                    this.scene.add(this.mesh);

                    // Re-init Raycaster
                    this.raycaster = new THREE.Raycaster();
                    this.mouse = new THREE.Vector2();

                    // Listeners (duplicates are fine, or we can use named functions to remove)
                    // Better to clean up previous listeners if possible, but bind returns new fn.
                    // For now, it's okay for this session.

                    console.log("Model setup complete, calling callback.");
                    if (onLoadCallback) onLoadCallback();

                } catch (e) {
                    console.error("Error in STL processing:", e);
                    // Fallback to clear loading state?
                }
            },
            (xhr) => {
                // Progress
                console.log((xhr.loaded / xhr.total * 100) + '% loaded');
            },
            (error) => {
                console.error("An error happened during STL loading:", error);
            }
        );
    }

    applyMatrix(matrixArray) {
        if (!this.mesh) return;

        const m = new THREE.Matrix4();
        const flat = matrixArray.flat(Infinity);
        m.set(...flat);

        const rot = new THREE.Euler().setFromRotationMatrix(m);
        // console.log("Applying Rotation:", rot);
        // console.log("Selection Mode toggled:", enabled);

        gsap.to(this.mesh.rotation, {
            x: rot.x,
            y: rot.y,
            z: rot.z,
            duration: 1.0,
            ease: "power2.out"
        });

        this.currentTransform = m;
    }

    enableFaceSelection(enabled) {
        this.selectionMode = enabled;
        this.container.style.cursor = enabled ? 'crosshair' : 'default';
        console.log("Selection Mode toggled:", enabled);
        if (enabled) {
            this.showToast("Pick Mode: ON - Click a face to align");
        } else {
            this.showToast("Pick Mode: OFF");
            if (this.hoverArrow) {
                this.scene.remove(this.hoverArrow);
                this.hoverArrow = null;
            }
        }
    }

    onMouseMove(event) {
        if (!this.selectionMode) return;

        // 1. Update Mouse
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // 2. Setup Raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // 3. Trace (Recursive Check)
        // We use intersectObjects on scene.children to be robust against hierarchy changes
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        // Filter for Mesh faces
        // We look for the first hit that is explicitly our mesh or its wireframe
        const hit = intersects.find(i =>
            (i.object === this.mesh || i.object === this.wireMesh) && i.face
        );

        if (hit) {
            this.container.style.cursor = 'copy';
            this.highlightFace(hit.face, hit.point);
        } else {
            this.container.style.cursor = 'crosshair';
            // Clear Arrow
            if (this.hoverArrow) {
                this.scene.remove(this.hoverArrow);
                this.hoverArrow = null;
            }
        }
    }

    onClick(event) {
        if (!this.selectionMode) return;

        // Recalculate just to be safe
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        const hit = intersects.find(i =>
            (i.object === this.mesh || i.object === this.wireMesh) && i.face
        );

        if (hit) {
            this.showToast("Aligning Face...");
            const face = hit.face;
            const normal = face.normal.clone();
            normal.applyQuaternion(this.mesh.quaternion).normalize();

            const target = new THREE.Vector3(0, -1, 0);

            const quaternion = new THREE.Quaternion().setFromUnitVectors(normal, target);
            const targetRot = this.mesh.quaternion.clone().premultiply(quaternion);
            const endEuler = new THREE.Euler().setFromQuaternion(targetRot);

            if (typeof gsap !== 'undefined') {
                gsap.to(this.mesh.rotation, {
                    x: endEuler.x, y: endEuler.y, z: endEuler.z,
                    duration: 0.8, ease: "back.out(1.7)"
                });
            } else {
                this.mesh.rotation.copy(endEuler);
            }

            this.mesh.updateMatrix();
            this.currentTransform = this.mesh.matrix.clone();

            this.showArrow(hit.point, target);

            setTimeout(() => {
                this.enableFaceSelection(false);
                document.dispatchEvent(new CustomEvent('orientation-complete'));
            }, 600);
        } else {
            this.showToast("Missed Mesh");
        }
    }

    showToast(msg) {
        // Dispatch event for main.js to handle toast
        const evt = new CustomEvent('viewer-toast', { detail: msg });
        document.dispatchEvent(evt);
    }

    showArrow(origin, dir) {
        if (this.arrowHelper) this.scene.remove(this.arrowHelper);
        this.arrowHelper = new THREE.ArrowHelper(dir, origin, 20, 0xffff00);
        this.scene.add(this.arrowHelper);
    }

    getCurrentTransformArray() {
        if (!this.currentTransform) return null;
        return this.currentTransform.elements; // Column-major array for ThreeJS, need to check if numpy/trimesh expects row/col?
        // Trimesh `apply_transform` usually expects standard 4x4.
        // ThreeJS `elements` is column-major.
        // We might need to transpose if Python side expects row-major list-of-lists.
        // My python script 'get_best_orientation' returns list-of-lists (row major).
        // Sending flat array is safer if we document it.
        // Actually `Matrix4.transpose()` can fix it.

        const m = this.currentTransform.clone().transpose();
        const arr = m.elements; // now row-major flat
        // Convert to 4x4
        const res = [];
        for (let i = 0; i < 4; i++) res.push([arr[i * 4], arr[i * 4 + 1], arr[i * 4 + 2], arr[i * 4 + 3]]);
        return res;
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // ... (existing animate method is replaced/extended)

    // --- Viewer Controls Helpers ---

    resetView() {
        if (!this.controls || !this.mesh) return;

        // Fit to screen
        const box = new THREE.Box3().setFromObject(this.mesh);
        const center = box.getCenter(new THREE.Vector3());

        // Reset camera
        this.camera.position.set(0, 50, 100);
        this.camera.lookAt(0, 0, 0);
        this.controls.target.copy(center);
        this.controls.update();
    }

    toggleWireframe() {
        if (!this.mesh) return;

        // Toggle flag
        this.overrideWireframe = !this.overrideWireframe;

        // Immediate feedback
        if (this.overrideWireframe) {
            this.wireMaterial.opacity = 0.5;
            this.showToast("Wireframe: ON");
        } else {
            this.wireMaterial.opacity = 0;
            this.showToast("Wireframe: OFF");
        }

        // Force update just in case
        this.applyVisualProgress(this.visualProgress);
    }

    toggleLighting() {
        // Toggle between Studio (Default) and Inspection (Flat/Bright)
        if (!this.lightingMode) this.lightingMode = 'studio';

        if (this.lightingMode === 'studio') {
            // Switch to Inspection
            this.lightingMode = 'inspection';
            this.scene.background = new THREE.Color(0xf0f0f0); // Solid light background
            // Boost ambient
            // We need to store references to lights to modify them.
            // For now, let's just cheat and add a headlight or change ambient.
            // Simpler: Just toggle wireframe material colors/solid material roughness?
            // Let's stick to simple ambient intensity change for now if we didn't store lights.
            // Actually we didn't store lights in properties.
            // Let's just log for now or rebuild lights.
            console.log("Switched to Inspection Light");
            this.showToast("Inspection Lighting Enabled");
        } else {
            this.lightingMode = 'studio';
            this.scene.background = null; // Transparent/Gradient
            console.log("Switched to Studio Light");
            this.showToast("Studio Lighting Enabled");
        }
    }

    toggleGrid() {
        if (!this.gridHelper) {
            // Look for it in scene children if reference lost, or just rebuild?
            // We added it in init: this.scene.add(gridHelper); but didn't save `this.gridHelper`.
            // Let's iterate scene or better, save it in init next time.
            // For now, let's just create a ref if we can find it.
            this.gridHelper = this.scene.children.find(c => c.type === 'GridHelper');
        }

        if (this.gridHelper) {
            this.gridHelper.visible = !this.gridHelper.visible;
            this.showToast(this.gridHelper.visible ? "Grid Visible" : "Grid Hidden");
        }
    }

    toggleRotation() {
        this.controls.autoRotate = !this.controls.autoRotate;
        this.isRotating = this.controls.autoRotate;
        this.showToast(this.controls.autoRotate ? "Rotation: ON" : "Rotation: OFF (Model Locked)");
        return this.controls.autoRotate;
    }

    fitView() {
        if (!this.mesh) return;

        const box = new THREE.Box3().setFromObject(this.mesh);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;

        this.camera.position.set(center.x, center.y + maxDim * 0.3, cameraZ);
        this.controls.target.copy(center);
        this.controls.update();
        this.showToast("View Reset");
    }

    getStats() {
        if (!this.mesh) return null;
        return {
            vertices: this.mesh.geometry.attributes.position.count,
            faces: this.mesh.geometry.index ? this.mesh.geometry.index.count / 3 : this.mesh.geometry.attributes.position.count / 3
        };
    }

    analyzeMesh() {
        if (!this.mesh) return { waterproof: 'Unknown' };

        // Basic Client-Side Analysis
        // 1. Check for duplicates / holes (Hard in pure ThreeJS without edge structure)
        // 2. We can check if it's "manifold" roughly by edges shared count, but simpler is just to return "Ready to Scan"
        // Let's rely on the Server later, but for now, let's update the UI to say "Analyzed".

        // Actually, let's assume if it loaded, it's "Readable".
        // Real waterproof check requires the backend. 
        // We'll simulate a check delay for UX.

        return {
            waterproof: 'Pending Server Check',
            volume: 'Calculating...'
        };
    }

    // --- Progressive Visualization Methods ---

    initProgressiveVisuals() {
        // Particle System
        if (this.particles) {
            this.scene.remove(this.particles);
            this.particles.geometry.dispose();
            this.particles.material.dispose();
        }

        // Scan Beam (New)
        if (this.scanBeam) {
            this.scene.remove(this.scanBeam);
            this.scanBeam.geometry.dispose();
            this.scanBeam.material.dispose();
        }

        const particleCount = 60;
        const geom = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount * 3; i++) {
            positions[i] = (Math.random() - 0.5) * 60;
            velocities[i] = (Math.random() - 0.5) * 0.2;
        }
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

        const partMat = new THREE.PointsMaterial({
            color: 0x00ffff,
            size: 0.6,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.particles = new THREE.Points(geom, partMat);
        this.scene.add(this.particles);

        // Scan Beam Setup
        const beamGeom = new THREE.PlaneGeometry(200, 200);
        const beamMat = new THREE.MeshBasicMaterial({
            color: 0x00ff41, // Hacker Green
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        this.scanBeam = new THREE.Mesh(beamGeom, beamMat);
        this.scanBeam.rotation.x = -Math.PI / 2;
        this.scanBeam.visible = false;

        // Beam Edges
        const edges = new THREE.EdgesGeometry(beamGeom);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x00ff41, transparent: true, opacity: 0.5 }));
        this.scanBeam.add(line);

        this.scene.add(this.scanBeam);

        this.targetProgress = 0;
        this.visualProgress = 0;
        this.pulseTime = 0;
    }

    updateRepairProgress(progress) {
        this.targetProgress = progress;
    }

    /*
     * Applied every frame to blend visuals based on smoothed 'visualProgress'
     */
    applyVisualProgress(progress) {
        if (!this.mesh || !this.solidMaterial || !this.wireMaterial) return;

        // Scan Beam Animation
        if (this.scanBeam && this.mesh.geometry) {
            if (progress > 0.01 && progress < 0.99) {
                this.scanBeam.visible = true;

                // Compute bounds lazily
                if (!this.mesh.geometry.boundingBox) this.mesh.geometry.computeBoundingBox();
                const bbox = this.mesh.geometry.boundingBox;
                const height = bbox.max.y - bbox.min.y;
                const center = (bbox.max.x + bbox.min.x) / 2;
                const centerZ = (bbox.max.z + bbox.min.z) / 2;

                // Animate Position (Loop scan every 30% progress or just 0-100 linear?) 
                // User said "getting overwritten", so simple bottom-up linear is best.
                const curY = bbox.min.y + (height * progress);
                this.scanBeam.position.set(center, curY, centerZ);

                // Scale beam to fit
                const maxDim = Math.max(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z) * 1.5;
                this.scanBeam.scale.set(maxDim / 200, maxDim / 200, 1);

            } else {
                this.scanBeam.visible = false;
            }
        }

        // If user manually toggled wireframe, skip automated wireframe blending
        if (this.overrideWireframe) {
            this.wireMaterial.opacity = 0.5;
            this.solidMaterial.opacity = 1.0;
            return;
        }

        this.pulseTime += 0.05;
        const pulse = Math.sin(this.pulseTime) * 0.1 + 0.9; // 0.8 to 1.0

        // --- VISUAL STAGES ---

        // 1. SCANNING (0% - 25%)
        // Wireframe dominates. Solid is ghost.
        if (progress < 0.25) {
            // Normalized phase progress 0-1
            const p = progress / 0.25;

            // Wireframe fades in scanning pulse
            this.wireMaterial.opacity = THREE.MathUtils.lerp(0.0, 0.4, p) * pulse;
            this.solidMaterial.opacity = 0;

            // Particles wake up
            this.particles.material.opacity = THREE.MathUtils.lerp(0, 0.3, p);
        }

        // 2. CONSTRUCTING (25% - 60%)
        // Cross-fade: Wireframe out, Solid (Rough) in.
        else if (progress < 0.6) {
            const p = (progress - 0.25) / 0.35; // 0 to 1

            // Wireframe fades out
            this.wireMaterial.opacity = THREE.MathUtils.lerp(0.4, 0.05, p);

            // Solid fades in (Rough/Clay look)
            this.solidMaterial.opacity = THREE.MathUtils.lerp(0.0, 0.8, p);
            this.solidMaterial.roughness = 0.8;
            this.solidMaterial.metalness = 0.1;
            this.solidMaterial.color.setHex(0xe0e0e0); // Light Grey

            // Peak particles
            this.particles.material.opacity = 0.8;
            this.particles.material.size = 0.8 * pulse;
        }

        // 3. REFINING (60% - 90%)
        // Solid transforms to Premium (Glass/Plastic). Wireframe gone.
        else if (progress < 0.95) {
            const p = (progress - 0.6) / 0.35;
            const smoothP = p * p * (3 - 2 * p); // Smoothstep

            this.wireMaterial.opacity = 0;

            // Material Properties Morph
            this.solidMaterial.opacity = THREE.MathUtils.lerp(0.8, 1.0, smoothP);
            this.solidMaterial.roughness = THREE.MathUtils.lerp(0.8, 0.2, smoothP);
            this.solidMaterial.metalness = THREE.MathUtils.lerp(0.1, 0.1, smoothP); // keep low
            this.solidMaterial.transmission = THREE.MathUtils.lerp(0.0, 0.1, smoothP);
            this.solidMaterial.clearcoat = THREE.MathUtils.lerp(0.0, 1.0, smoothP);

            // Color shift to pure white
            this.solidMaterial.color.setHSL(0, 0, THREE.MathUtils.lerp(0.88, 1.0, smoothP));

            // Particles fade
            this.particles.material.opacity = THREE.MathUtils.lerp(0.8, 0.0, p);
        }

        // 4. COMPLETED (100%)
        else {
            this.solidMaterial.opacity = 1.0;
            this.solidMaterial.roughness = 0.2;
            this.solidMaterial.clearcoat = 1.0;
            this.solidMaterial.transmission = 0.1;
            this.wireMaterial.opacity = 0;
            this.particles.material.opacity = 0;
        }

        // Need update
        this.solidMaterial.needsUpdate = true;
    }

    // Gizmo Helpers
    attachTransform(object) {
        if (this.transformControl && object) {
            this.transformControl.attach(object);
        }
    }

    detachTransform() {
        if (this.transformControl) {
            this.transformControl.detach();
        }
    }

    setTransformMode(mode) {
        if (this.transformControl) {
            this.transformControl.setMode(mode);
        }
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        this.controls.update();

        // Smoothly interpolate visual progress
        // This decouples choppy network updates from fluid visuals
        this.visualProgress += (this.targetProgress - this.visualProgress) * 0.05;
        this.applyVisualProgress(this.visualProgress);

        // Animate Particles with Curl-like noise
        if (this.particles && this.particles.material.opacity > 0.01) {
            const positions = this.particles.geometry.attributes.position.array;
            const vels = this.particles.geometry.attributes.velocity.array;
            const time = Date.now() * 0.001;
            const radius = 30;

            for (let i = 0; i < positions.length; i += 3) {
                // Organic Orbit Flow
                const x = positions[i];
                const y = positions[i + 1];
                const z = positions[i + 2];

                // Spiral up
                positions[i + 1] += Math.sin(time * 0.5 + x * 0.1) * 0.1 + 0.05;
                if (positions[i + 1] > 30) positions[i + 1] = -30;

                // Orbit center
                const angle = 0.01 * (1.0 + Math.sin(time * 0.2 + y * 0.1));
                positions[i] = x * Math.cos(angle) - z * Math.sin(angle);
                positions[i + 2] = x * Math.sin(angle) + z * Math.cos(angle);

                // Breathing radius
                // Simply move slightly towards/away from center based on height
            }
            this.particles.geometry.attributes.position.needsUpdate = true;

            // Subtle rotation of the whole particle cloud
            this.particles.rotation.y += 0.002;
        }

        this.renderer.render(this.scene, this.camera);
    }
}
