import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
// Post Processing imports
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { createToonMaterial, SpiritWisps, InkWashBackground, ScanningLaser } from './visual_theme_donghua.js';

// alert("Viewer Module Loaded"); // Debug

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
        this.scene.background = new THREE.Color(0xf5f7fa); // STUDIO MODE: Light Grey
        // this.scene.fog = new THREE.Fog(0xf5f7fa, 500, 2000); // DISABLED: Was causing "Ghosting" washout

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 60, 120);

        // Renderer (Standard Opaque)
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setClearColor(0xf5f7fa, 1); // FORCE LIGHT GREY
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

        // Lighting (Anime Studio Setup) - REDUCED for Light Mode
        // High intensity led to washout. Now balanced for 0xf5f7fa background.
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Was 0.8
        this.scene.add(ambientLight);

        // Rim Light (Strong back light for toon edges)
        const mainLight = new THREE.DirectionalLight(0xffffff, 0.8); // Was 1.5
        mainLight.position.set(50, 80, 50);
        mainLight.castShadow = true;
        this.scene.add(mainLight);

        // Post-Processing (Bloom)
        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Unreal Bloom: Resolution, Strength, Radius, Threshold
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.0, 0.4, 0.85 // Strength 0 initially
        );
        this.bloomPass.strength = 0.0;
        this.bloomPass.radius = 0.5;
        this.bloomPass.threshold = 0; // Bloom everything bright
        this.composer.addPass(this.bloomPass);
        const fillLight = new THREE.DirectionalLight(0xcce3fe, 0.5); // Was 0.8
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

    loadSTL(url, onLoadCallback = null, keepCamera = false) {
        // Reset Repair State
        this.isRepairing = false;
        this.resetScene();
        this.idleRotation = false;
        console.log("Loading STL from:", url);

        const loader = new STLLoader();
        loader.load(
            url,
            (geometry) => {
                try {
                    // console.log("STL Loaded, Geometry:", geometry);
                    geometry.center();
                    geometry.computeVertexNormals();

                    // SAFE MATERIAL: Lambert "Matte Clay" (Professional CAD Look)
                    // High Contrast Dark Grey against Light Background
                    const material = new THREE.MeshLambertMaterial({
                        color: 0x333333, // Charcoal
                        emissive: 0x000000
                    });

                    this.mesh = new THREE.Mesh(geometry, material);
                    this.solidMaterial = material;
                    this.mesh.castShadow = true;
                    this.mesh.receiveShadow = true;
                    this.mesh.visible = true;

                    // 2. Wireframe Overlay (Subtle Tech)
                    this.wireMaterial = new THREE.MeshBasicMaterial({
                        color: 0x4f46e5, // Indigo
                        wireframe: true,
                        transparent: true,
                        opacity: 0.0
                    });
                    this.wireMesh = new THREE.Mesh(geometry, this.wireMaterial);
                    this.mesh.add(this.wireMesh);

                    // NUCLEAR OPTION: DO NOT CREATE ANIME MESHES HERE.
                    this.holoMesh = null;
                    this.sparkles = null;
                    this.bgMesh = null;
                    this.magicCircle = null;

                    this.scene.add(this.mesh);

                    // Auto-Fit Camera (Non-destructive)
                    if (!keepCamera) {
                        this.fitCameraToMesh();
                    }

                    // Re-init Raycaster
                    this.raycaster = new THREE.Raycaster();
                    this.mouse = new THREE.Vector2();

                    // VISIBILITY FIX: Ensure model starts clean
                    this.targetProgress = 0.0;
                    this.visualProgress = 0.0;

                    // Force Background
                    this.scene.background = new THREE.Color(0xf5f7fa);
                    if (this.renderer) this.renderer.setClearColor(0xf5f7fa, 1);

                    console.log("Model setup complete (CAD Mode), calling callback.");
                    if (onLoadCallback) onLoadCallback();

                } catch (e) {
                    console.error("Error in STL processing:", e);
                    // Still call callback on error so UI can reset
                    if (onLoadCallback) onLoadCallback();
                }
            },
            (xhr) => {
                // Progress
                // console.log((xhr.loaded / xhr.total * 100) + '% loaded');
            },
            (error) => {
                console.error("An error happened during STL loading:", error);
                // Call callback on error so UI can reset
                if (onLoadCallback) onLoadCallback();
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

    highlightFace(face, point) {
        if (!this.mesh) return;
        const normal = face.normal.clone();
        normal.applyQuaternion(this.mesh.quaternion).normalize();

        if (this.hoverArrow) this.scene.remove(this.hoverArrow);
        this.hoverArrow = new THREE.ArrowHelper(normal, point, 20, 0xffff00);
        this.scene.add(this.hoverArrow);
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
                    duration: 0.8,
                    ease: "back.out(1.7)",
                    onUpdate: () => {
                        this.mesh.updateMatrix();
                    },
                    onComplete: () => {
                        // Snap to Floor
                        this.mesh.updateMatrixWorld(true);
                        this.mesh.geometry.computeBoundingBox();
                        const bbox = new THREE.Box3().setFromObject(this.mesh);
                        const minY = bbox.min.y;

                        // Shift up
                        const targetY = this.mesh.position.y - minY;

                        gsap.to(this.mesh.position, {
                            y: targetY,
                            duration: 0.5,
                            ease: "power2.out"
                        });

                        this.showToast("Aligned & Snapped to Floor");

                        // CLEAR ARROW
                        if (this.currentArrow) {
                            this.scene.remove(this.currentArrow);
                            this.currentArrow = null;
                        }

                        // Don't auto-reattach gizmo. User wants clean view.
                        // if (this.transformControl) this.transformControl.attach(this.mesh);

                        // Final transform update
                        this.currentTransform = this.mesh.matrix.clone();
                    }
                });
            } else {
                this.mesh.rotation.copy(endEuler);

                // Snap immediately
                this.mesh.updateMatrixWorld(true);
                const bbox = new THREE.Box3().setFromObject(this.mesh);
                this.mesh.position.y -= bbox.min.y;

                this.showToast("Aligned & Snapped to Floor");
            }

            this.showArrow(hit.point, target);

            setTimeout(() => {
                this.enableFaceSelection(false);
                document.dispatchEvent(new CustomEvent('orientation-complete'));
            }, 1000);
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
        if (this.currentArrow) this.scene.remove(this.currentArrow);
        this.currentArrow = new THREE.ArrowHelper(dir, origin, 20, 0xffff00); // Using dir for direction, and hardcoded length/hex
        this.scene.add(this.currentArrow);
        return this.currentArrow;
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

        // NUCLEAR CLEANUP: Destroy Anime Assets
        if (this.holoMesh) {
            this.scene.remove(this.holoMesh); // Removed from SCENE now
            this.holoMesh.geometry.dispose();
            this.holoMesh = null;
        }
        if (this.sparkles) {
            this.sparkles.dispose();
            this.sparkles = null;
        }
        if (this.bgMesh) {
            this.scene.remove(this.bgMesh);
            this.bgMesh.geometry.dispose();
            this.bgMesh = null;
        }
        if (this.magicCircle && this.magicCircle.dispose) {
            this.magicCircle.dispose();
            this.magicCircle = null;
        }

        if (this.arrowHelper) {
            this.scene.remove(this.arrowHelper);
            this.arrowHelper = null;
        }
        if (this.hoverArrow) {
            this.scene.remove(this.hoverArrow);
            this.hoverArrow = null;
        }

        // RESTORE STUDIO STATE
        this.scene.background = new THREE.Color(0xf5f7fa);
        if (this.renderer) this.renderer.setClearColor(0xf5f7fa, 1);
        if (this.gridHelper) this.gridHelper.visible = true;

        this.mesh = null;
        this.wireMesh = null;
    }

    // Deprecated: No longer auto-inited
    initProgressiveVisuals() {
        // Logic moved to startRepair
    }




    startRepair() {
        console.log("=== startRepair() BEGIN ===");

        this.isRepairing = true;
        this.targetProgress = 0.0;
        this.visualProgress = 0.0;

        if (!this.mesh) {
            console.error("FATAL: No mesh exists! Cannot start repair.");
            return;
        }

        // ===== PHASE 1: TOON SHADER SETUP =====

        // 1. Create Toon Material
        this.toonMaterial = createToonMaterial();

        // 2. Create holoMesh (decoupled from original mesh) using Toon shader
        if (this.holoMesh) {
            this.scene.remove(this.holoMesh);
            this.holoMesh.geometry.dispose();
        }
        this.holoMesh = new THREE.Mesh(this.mesh.geometry.clone(), this.toonMaterial);
        this.holoMesh.position.copy(this.mesh.position);
        this.holoMesh.rotation.copy(this.mesh.rotation);
        this.holoMesh.scale.copy(this.mesh.scale);
        this.holoMesh.updateMatrixWorld(true);
        this.scene.add(this.holoMesh);
        this.holoMesh.visible = true;

        // 3. Hide the original CAD mesh
        this.mesh.visible = false;

        // 4. Calculate WORLD SPACE bounds for shader uniforms
        const box = new THREE.Box3().setFromObject(this.holoMesh);
        const minY = box.min.y;
        const maxY = box.max.y;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        console.log("DEBUG: World bounds - minY:", minY, "maxY:", maxY, "center:", center);

        // Set initial uniforms
        this.toonMaterial.uniforms.uMinY.value = minY;
        this.toonMaterial.uniforms.uMaxY.value = maxY;
        this.toonMaterial.uniforms.uProgress.value = 0.0;

        // ===== PHASE 2: SCENE SETUP =====

        // 5. Hide grid for cinematic look
        if (this.gridHelper) this.gridHelper.visible = false;

        // 6. Anime sky background
        this.scene.background = new THREE.Color(0xe6f3ff); // Pale Anime Blue
        this.renderer.setClearColor(0xe6f3ff, 1);

        // 7. Enhanced lighting for anime style
        if (!this.repairLight) {
            this.repairLight = new THREE.DirectionalLight(0xffffff, 2.0);
            this.repairLight.position.set(50, 100, 50);
            this.scene.add(this.repairLight);
        }

        // 8. Camera setup (looking at center)
        const fov = this.camera.fov * (Math.PI / 180);
        const cameraZ = Math.abs(maxDim / Math.tan(fov / 2)) * 1.5;

        this.camera.position.set(center.x + maxDim * 0.3, center.y + maxDim * 0.3, center.z + cameraZ);
        this.camera.lookAt(center);
        this.camera.updateProjectionMatrix();

        this.controls.target.copy(center);
        this.controls.autoRotate = true; // Slow cinematic orbit
        this.controls.autoRotateSpeed = 0.5; // Very slow
        this.controls.update();

        // 9. Disable broken cinematic camera
        this.isCinematic = false;

        // 10. Cleanup gizmos
        this.detachTransform();
        if (this.currentArrow) {
            this.scene.remove(this.currentArrow);
            this.currentArrow = null;
        }

        // 11. Force immediate render
        this.renderer.render(this.scene, this.camera);

        console.log("=== startRepair() END - Toon Shader Active ===");
    }

    updateRepairProgress(progress) {
        this.targetProgress = progress;
        console.log("updateRepairProgress called with:", progress);
    }

    // Called when repair is complete - cleans up anime state
    finishRepair() {
        console.log("finishRepair() called - cleaning up anime state");
        this.isRepairing = false;

        // Remove holoMesh
        if (this.holoMesh) {
            this.scene.remove(this.holoMesh);
            if (this.holoMesh.geometry) this.holoMesh.geometry.dispose();
            if (this.holoMesh.material) this.holoMesh.material.dispose();
            this.holoMesh = null;
        }

        // Remove anime assets
        this.toonMaterial = null;
        if (this.sparkles) this.sparkles = null;
        if (this.bgMesh) {
            this.scene.remove(this.bgMesh);
            this.bgMesh = null;
        }
        if (this.magicCircle) {
            if (this.magicCircle.mesh) this.scene.remove(this.magicCircle.mesh);
            this.magicCircle = null;
        }

        // Restore CAD mesh visibility
        if (this.mesh) {
            this.mesh.visible = true;
            if (this.solidMaterial) this.mesh.material = this.solidMaterial;
        }

        // Restore grid
        if (this.gridHelper) this.gridHelper.visible = true;

        // Reset background to studio grey
        this.scene.background = new THREE.Color(0xf5f7fa);
        if (this.renderer) this.renderer.setClearColor(0xf5f7fa, 1);

        // Stop auto-rotate
        this.controls.autoRotate = false;

        // Reset progress
        this.targetProgress = 0;
        this.visualProgress = 0;

        console.log("finishRepair() complete - back to CAD mode");
    }

    /*
     * Applied every frame to blend visuals based on smoothed 'visualProgress'
     */
    applyVisualProgress(progress) {
        if (!this.mesh) return;

        // Check if we have core anime assets (holoMesh + toonMaterial)
        // Sparkles and other effects are optional
        const hasAnimeAssets = this.holoMesh && this.toonMaterial;

        if (!hasAnimeAssets) {
            // Fallback: Just keep mesh visible
            if (this.mesh) {
                this.mesh.visible = true;
            }
            return;
        }

        // ===== ACTIVE REPAIR: Update Toon Shader =====

        // 1. Update shader uniforms
        if (this.toonMaterial.uniforms) {
            this.toonMaterial.uniforms.uProgress.value = progress;
            this.toonMaterial.uniforms.uTime.value = performance.now() * 0.001;
        }

        // 2. Ensure holoMesh is visible
        this.holoMesh.visible = true;

        // 3. Hide CAD mesh
        this.mesh.visible = false;

        // 4. Handle optional effects
        if (this.sparkles && this.sparkles.points) {
            this.sparkles.points.visible = true;
        }
        if (this.magicCircle && this.magicCircle.mesh) {
            this.magicCircle.mesh.visible = true;
        }
        if (this.bgMesh) {
            this.bgMesh.visible = true;
        }
    }

    triggerFlash() {
        // Dispatch event for Main.js to handle DOM overlay flash
        document.dispatchEvent(new CustomEvent('viewer-flash'));

        // Success Bloom Burst (Ethereal)
        if (this.bloomPass) {
            const originalStrength = this.bloomPass.strength;
            this.bloomPass.strength = 2.0; // Flash!

            // Decay back to normal
            let f = 2.0;
            const decay = () => {
                f *= 0.9;
                if (f > 0.4) {
                    this.bloomPass.strength = f;
                    requestAnimationFrame(decay);
                } else {
                    this.bloomPass.strength = 0.4; // Return to gentle pulse
                }
            };
            decay();
        }
        if (this.bloomPass) {
            this.bloomPass.strength = 1.5; // Soft burst

            // Decay
            const decay = () => {
                this.bloomPass.strength *= 0.95; // Slower decay
                if (this.bloomPass.strength > 0.1) {
                    requestAnimationFrame(decay);
                } else {
                    this.bloomPass.strength = 0.0;
                }
            };
            requestAnimationFrame(decay);
        }
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
        this.animationId = requestAnimationFrame(this.animate.bind(this));

        // Update Camera Controls
        if (this.controls && this.controls.enabled) {
            this.controls.update();
        }

        const time = performance.now();

        // 1. UPDATE VISUALS
        if (this.isRepairing) {
            // 1a. Update Progress
            const smoothing = (this.targetProgress > 0.95) ? 0.05 : 0.02;
            this.visualProgress += (this.targetProgress - this.visualProgress) * smoothing;

            // Snap
            if (Math.abs(this.targetProgress - this.visualProgress) < 0.001) {
                this.visualProgress = this.targetProgress;
            }

            // 1b. Update Anime Shaders
            this.applyVisualProgress(this.visualProgress);

        } else {
            // 2. IDLE STATE (CAD Mode)
            // Ensure CAD mesh is visible and Anime is GONE
            if (this.mesh) {
                // FIX: Ensure the mesh object itself is visible
                if (!this.mesh.visible) this.mesh.visible = true;

                // CRITICAL FIX: Ensure the MATERIAL is the solid charcoal material
                // (It might be the 'invisible cloak' from the repair state)
                if (this.solidMaterial && this.mesh.material !== this.solidMaterial) {
                    this.mesh.material = this.solidMaterial;
                }

                // Ensure Anime Ghosts are hidden
                if (this.holoMesh) this.holoMesh.visible = false;
                if (this.bgMesh) this.bgMesh.visible = false;
                if (this.magicCircle && this.magicCircle.mesh) this.magicCircle.mesh.visible = false;
                if (this.sparkles && this.sparkles.points) this.sparkles.points.visible = false;

                // Reset Background to Studio Grey (SAFE - no getHex/setHex which crash)
                // The old code called scene.background.getHex() which crashes if background is not a Color
                // Just always set it to ensure it's a valid Color object
                this.scene.background = new THREE.Color(0xf5f7fa);
                if (this.renderer) this.renderer.setClearColor(0xf5f7fa, 1);
            }
        }

        // Update Animated Components
        if (this.magicCircle) this.magicCircle.update(time * 0.001, this.visualProgress, 0, 100);
        if (this.sparkles) this.sparkles.update(time * 0.001);

        // CINEMATIC CAMERA (DISABLED - The hardcoded lookAt was breaking visibility)
        /*
        if (this.isCinematic && this.cinematicStartPos && this.cinematicEndPos) {
            const el = (performance.now() - this.cinematicStartTime) * 0.0001;
            const t = Math.min(el, 1.0);
            const ease = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    
            if (this.camera && this.camera.position) {
                this.camera.position.lerpVectors(this.cinematicStartPos, this.cinematicEndPos, ease * 0.05);
                this.camera.lookAt(0, 40, 0); // THIS WAS THE BUG - hardcoded position!
            }
        }
        */

        // RENDER: DIRECT (No Composer/Bloom to prevent Black Screen)
        // This is the NUCLEAR FIX for reliability
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }


    fitCameraToMesh() {
        console.log("fitCameraToMesh executing...");
        if (!this.mesh) return;

        // 1. Get Bounding Box
        const box = new THREE.Box3().setFromObject(this.mesh);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // 2. Calculate distance to fit
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);

        // Correct formula: distance = size / (2 * tan(fov / 2))
        let cameraZ = Math.abs(maxDim / (2 * Math.tan(fov / 2)));

        // Add padding (1.2x)
        cameraZ *= 1.2;

        // 3. Move Camera (ISO View)
        const isoVector = new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(cameraZ);
        this.camera.position.copy(center).add(isoVector);

        // 4. Update Controls
        this.controls.target.copy(center);
        this.controls.update();

        // Adjust near/far planes to avoid clipping on huge/tiny objects
        this.camera.near = maxDim / 1000;
        this.camera.far = maxDim * 100;
        this.camera.updateProjectionMatrix();

        console.log("Auto-fitted camera to mesh of size:", maxDim);
    }
}
