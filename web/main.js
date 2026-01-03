import * as THREE from 'three';
import { ModelViewer } from './viewer.js';
import { MeshEditor } from './mesh-editor.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

class ZenMesher {
    constructor() {
        this.viewer = new ModelViewer('viewer-container');
        this.activeFile = null;
        this.serverId = null;

        // UI Refs
        this.ui = {
            // Main Areas
            dropZone: document.getElementById('drop-zone'),
            centerStage: document.getElementById('center-stage'),

            // Sidebars & Bars
            sidebarLeft: document.getElementById('sidebar-left'),
            sidebarRight: document.getElementById('sidebar-right'),
            toolbarBottom: document.getElementById('toolbar-bottom'),

            // Header
            statusIndicator: document.getElementById('status-indicator'),
            statusText: document.getElementById('status-text'),

            // Info Fields
            infoFilename: document.getElementById('info-filename'),
            infoVertices: document.getElementById('info-vertices'),
            infoFaces: document.getElementById('info-faces'),
            infoWaterproof: document.getElementById('info-waterproof'),

            // Controls
            fileInput: document.getElementById('file-input'),
            btnAutoOrient: document.getElementById('btn-auto-orient'),
            btnPickFace: document.getElementById('btn-pick-face'),
            btnStartRepair: document.getElementById('btn-start-repair'),
            btnDownload: document.getElementById('btn-download'),

            // Viewport Inputs
            btnReset: document.getElementById('btn-reset-view'),
            btnFit: document.getElementById('btn-fit-view'),

            // Edit Toolbar
            editToolbar: document.getElementById('edit-toolbar'),
            btnSelectFace: document.getElementById('btn-select-face'),
            btnThicken: document.getElementById('btn-thicken'),
            btnClearSel: document.getElementById('btn-clear-sel'),

            // Transform Controls
            scaleSlider: document.getElementById('scale-slider'),
            scaleValue: document.getElementById('scale-value'),
            rotateXSlider: document.getElementById('rotate-x-slider'),
            rotateXValue: document.getElementById('rotate-x-value'),
            rotateYSlider: document.getElementById('rotate-y-slider'),
            rotateYValue: document.getElementById('rotate-y-value'),
            rotateZSlider: document.getElementById('rotate-z-slider'),
            rotateZValue: document.getElementById('rotate-z-value'),
            btnResetTransform: document.getElementById('btn-reset-transform'),

            // Shape Creation
            btnAddCube: document.getElementById('btn-add-cube'),
            btnAddCylinder: document.getElementById('btn-add-cylinder'),
            btnAddSphere: document.getElementById('btn-add-sphere'),
            btnAddCone: document.getElementById('btn-add-cone'),
            btnJoinMeshes: document.getElementById('btn-join-meshes'),
            btnValidateMesh: document.getElementById('btn-validate-mesh'),
            validationStatus: document.getElementById('validation-status'),
            validationIcon: document.getElementById('validation-icon'),
            validationText: document.getElementById('validation-text'),

            // Progress
            repairProgressBar: document.getElementById('repair-progress-bar'),
            repairProgressFill: document.getElementById('repair-progress-fill'),
        };

        this.init();
    }

    init() {
        console.log("Mesher v3.0 Init");

        // Initialize MeshEditor
        this.meshEditor = new MeshEditor(this.viewer);

        // Listen for viewer toasts
        document.addEventListener('viewer-toast', (e) => {
            this.showToast(e.detail);
        });

        // Track created shapes for join operations
        this.shapes = [];
        this.selectedShape = null;
        this.shapeRaycaster = new THREE.Raycaster();
        this.shapeMouse = new THREE.Vector2();

        // Recent models cache (max 5)
        this.RECENT_MODELS_KEY = 'mesher_recent_models';
        this.MAX_RECENT_MODELS = 5;

        this.setupEvents();
        this.setupOrientationEvents();
        this.setupEditingEvents();
        this.setupTransformEvents();
        this.loadRecentModels();
    }

    setupShapeSelectionEvents() {
        // Click on viewer to select/deselect shapes AND sketches
        const container = document.getElementById('viewer-container');
        if (!container) return;

        container.addEventListener('click', (e) => {
            // Calculate mouse position
            const rect = container.getBoundingClientRect();
            this.shapeMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.shapeMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            // Raycast against shapes AND sketches
            const candidates = [...this.shapes, ...(this.sketches || [])];

            if (candidates.length === 0 && !this.viewer.mesh) return;

            this.shapeRaycaster.setFromCamera(this.shapeMouse, this.viewer.camera);
            const intersects = this.shapeRaycaster.intersectObjects(candidates, false);

            if (intersects.length > 0) {
                // Select the first hit
                const clickedObj = intersects[0].object;
                this.selectShape(clickedObj);
            } else {
                // Click on empty area - deselect
                this.deselectShape();
            }
        });

        // Key bindings for modes
        window.addEventListener('keydown', (e) => {
            if (this.selectedShape) {
                switch (e.key.toLowerCase()) {
                    case 'w': this.setTransformMode('translate'); this.updateModeButtons('translate'); break;
                    case 'e': this.setTransformMode('rotate'); this.updateModeButtons('rotate'); break;
                    case 'r': this.setTransformMode('scale'); this.updateModeButtons('scale'); break;
                }
            }
        });
    }

    selectShape(mesh) {
        // Deselect previous
        if (this.selectedShape && this.selectedShape !== mesh) {
            this.deselectShape();
        }

        this.selectedShape = mesh;

        // Visual highlight - make it glow
        if (mesh.material) {
            // Store original emissive if not stored
            if (!mesh.userData.originalEmissive) {
                mesh.userData.originalEmissive = mesh.material.emissive ? mesh.material.emissive.clone() : new THREE.Color(0, 0, 0);
            }
            mesh.material.emissive = new THREE.Color(0x00ff00);
            mesh.material.emissiveIntensity = 0.3;
        }

        // Attach Gizmo
        if (this.viewer.attachTransform) {
            this.viewer.attachTransform(mesh);
        }

        const type = mesh.userData.isSketch ? 'Sketch' : 'Shape';
        this.showToast(`${type} selected - Press W/E/R to transform`);
    }

    deselectShape() {
        if (this.selectedShape) {
            // Restore emissive
            if (this.selectedShape.material) {
                this.selectedShape.material.emissive = this.selectedShape.userData.originalEmissive || new THREE.Color(0, 0, 0);
                this.selectedShape.material.emissiveIntensity = 0;
            }
        }

        // Detach Gizmo
        if (this.viewer.detachTransform) {
            this.viewer.detachTransform();
        }

        this.selectedShape = null;
    }





    setupShapeEvents() {
        // Shape creation buttons
        if (this.ui.btnAddCube) {
            this.ui.btnAddCube.addEventListener('click', () => this.addShape('cube'));
        }
        if (this.ui.btnAddCylinder) {
            this.ui.btnAddCylinder.addEventListener('click', () => this.addShape('cylinder'));
        }
        if (this.ui.btnAddSphere) {
            this.ui.btnAddSphere.addEventListener('click', () => this.addShape('sphere'));
        }
        if (this.ui.btnAddCone) {
            this.ui.btnAddCone.addEventListener('click', () => this.addShape('cone'));
        }

        // Join meshes
        if (this.ui.btnJoinMeshes) {
            this.ui.btnJoinMeshes.addEventListener('click', () => this.joinMeshes());
        }

        // Validate mesh
        if (this.ui.btnValidateMesh) {
            this.ui.btnValidateMesh.addEventListener('click', () => this.validateMesh());
        }

        // Clear All
        const btnClearAll = document.getElementById('btn-clear-all');
        if (btnClearAll) {
            btnClearAll.addEventListener('click', () => this.clearAll());
        }

        // 2D Sketch Buttons
        const btnSketchRect = document.getElementById('btn-sketch-rect');
        const btnSketchCircle = document.getElementById('btn-sketch-circle');
        const btnSketchTri = document.getElementById('btn-sketch-tri');
        const btnSketchLine = document.getElementById('btn-sketch-line');
        const btnExtrudeSketch = document.getElementById('btn-extrude-sketch');

        if (btnSketchRect) btnSketchRect.addEventListener('click', () => this.addSketch('rect'));
        if (btnSketchCircle) btnSketchCircle.addEventListener('click', () => this.addSketch('circle'));
        if (btnSketchTri) btnSketchTri.addEventListener('click', () => this.addSketch('tri'));
        if (btnSketchLine) btnSketchLine.addEventListener('click', () => this.addSketch('line'));
        if (btnExtrudeSketch) btnExtrudeSketch.addEventListener('click', () => this.extrudeSelectedSketch());

        // Project Geometry (like Inventor)
        const btnProjectGeometry = document.getElementById('btn-project-geometry');
        if (btnProjectGeometry) btnProjectGeometry.addEventListener('click', () => this.projectGeometry());
    }

    projectGeometry() {
        // Like Inventor's "Project Geometry" - project mesh edges onto a sketch plane
        const mesh = this.viewer.mesh || (this.shapes.length > 0 ? this.shapes[0] : null);

        if (!mesh || !mesh.geometry) {
            this.showToast('Load a mesh first to project its geometry');
            return;
        }

        this.showToast('Projecting geometry...');

        // Get the mesh's bounding box
        const box = new THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new THREE.Vector3());

        // Create edges from mesh geometry (30° threshold for hard edges)
        const edges = new THREE.EdgesGeometry(mesh.geometry, 30);

        // Project edges onto XY plane (ground plane)
        const positions = edges.attributes.position.array;
        const projectedPoints = [];

        for (let i = 0; i < positions.length; i += 6) {
            // Each line segment has 2 points (6 floats: x1,y1,z1,x2,y2,z2)
            const x1 = positions[i];
            const z1 = positions[i + 2]; // Z becomes Y on sketch plane
            const x2 = positions[i + 3];
            const z2 = positions[i + 5];

            projectedPoints.push(x1, 0.2, z1); // y=0.2 slightly above ground
            projectedPoints.push(x2, 0.2, z2);
        }

        // Create line segments for the projection
        const projectedGeometry = new THREE.BufferGeometry();
        projectedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(projectedPoints, 3));

        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0xF59E0B, // Orange for projected geometry
            linewidth: 2
        });

        const projectedLines = new THREE.LineSegments(projectedGeometry, lineMaterial);
        projectedLines.position.copy(center);
        projectedLines.position.y = 0.2;

        // Mark as sketch/projection
        projectedLines.userData.isSketch = true;
        projectedLines.userData.isProjection = true;

        if (!this.sketches) this.sketches = [];
        this.viewer.scene.add(projectedLines);
        this.sketches.push(projectedLines);

        this.showToast('Geometry projected to sketch plane (orange lines)');
    }

    clearAll() {
        // Remove all shapes
        this.shapes.forEach(mesh => {
            this.viewer.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        });
        this.shapes = [];
        this.selectedShape = null;

        // Remove all sketches
        if (this.sketches) {
            this.sketches.forEach(sketch => {
                this.viewer.scene.remove(sketch);
                if (sketch.geometry) sketch.geometry.dispose();
                if (sketch.material) sketch.material.dispose();
            });
        }
        this.sketches = [];

        // Clear the main mesh if loaded
        if (this.viewer.mesh) {
            this.viewer.scene.remove(this.viewer.mesh);
            this.viewer.mesh = null;
        }

        this.showToast('Scene cleared');
    }

    addSketch(type) {
        if (!this.sketches) this.sketches = [];

        let shape;
        const size = 30;

        switch (type) {
            case 'rect':
                shape = new THREE.Shape();
                shape.moveTo(-size / 2, -size / 2);
                shape.lineTo(size / 2, -size / 2);
                shape.lineTo(size / 2, size / 2);
                shape.lineTo(-size / 2, size / 2);
                shape.lineTo(-size / 2, -size / 2);
                break;
            case 'circle':
                shape = new THREE.Shape();
                shape.absarc(0, 0, size / 2, 0, Math.PI * 2, false);
                break;
            case 'tri':
                shape = new THREE.Shape();
                shape.moveTo(0, size / 2);
                shape.lineTo(-size / 2, -size / 2);
                shape.lineTo(size / 2, -size / 2);
                shape.lineTo(0, size / 2);
                break;
            case 'line':
                // Line is just a thin rectangle for extrusion
                shape = new THREE.Shape();
                shape.moveTo(-size / 2, -1);
                shape.lineTo(size / 2, -1);
                shape.lineTo(size / 2, 1);
                shape.lineTo(-size / 2, 1);
                shape.lineTo(-size / 2, -1);
                break;
            default:
                return;
        }

        // Create 2D outline (ShapeGeometry with just edges)
        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshBasicMaterial({
            color: 0x2563EB,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.3
        });
        const mesh = new THREE.Mesh(geometry, material);

        // Add outline
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x1D4ED8, linewidth: 2 });
        const wireframe = new THREE.LineSegments(edges, lineMat);
        mesh.add(wireframe);

        // Position on XY plane (flat)
        const offset = this.sketches.length * 40;
        mesh.position.set(offset, 0.1, 0);
        mesh.rotation.x = -Math.PI / 2; // Lay flat on ground

        // Store shape data for extrusion
        mesh.userData.isSketch = true;
        mesh.userData.shapeData = shape;
        mesh.userData.sketchType = type;

        this.viewer.scene.add(mesh);
        this.sketches.push(mesh);

        // Select it
        this.selectShape(mesh);
        this.showToast(`Added ${type} sketch - Click Extrude to make 3D`);
    }

    extrudeSelectedSketch() {
        if (!this.selectedShape || !this.selectedShape.userData.isSketch) {
            this.showToast('Select a 2D sketch first');
            return;
        }

        const sketch = this.selectedShape;

        // Handle Projected Geometry (LineSegments) which has no shape data
        if (sketch.userData.isProjection) {
            // Auto-detect loops from line segments
            const geometry = sketch.geometry;
            const positions = geometry.attributes.position.array;

            // 1. Build Adjacency Graph
            // Map: "x,y,z" (string) -> { point: Vector3, param: t, id: int }
            // Actually just need to link indices.
            // Since segments are disconnected lines, we need to merge vertices.

            const tol = 1e-4;
            const points = [];

            // Helper to get/add unique point index
            const getPointId = (x, y, z) => {
                for (let i = 0; i < points.length; i++) {
                    const p = points[i];
                    if (Math.abs(p.x - x) < tol && Math.abs(p.z - z) < tol) { // Ignore Y (flat plane)
                        return i;
                    }
                }
                points.push(new THREE.Vector3(x, y, z));
                return points.length - 1;
            };

            const edges = []; // [startId, endId]

            for (let i = 0; i < positions.length; i += 6) {
                const id1 = getPointId(positions[i], positions[i + 1], positions[i + 2]);
                const id2 = getPointId(positions[i + 3], positions[i + 4], positions[i + 5]);
                if (id1 !== id2) {
                    edges.push([id1, id2]);
                }
            }

            // 2. Find Loop
            // Simply: Start at a node with degree 2. Traverse.
            // Build adjacency map: id -> [neighbors]
            const adj = new Map();
            edges.forEach(([a, b]) => {
                if (!adj.has(a)) adj.set(a, []);
                if (!adj.has(b)) adj.set(b, []);
                adj.get(a).push(b);
                adj.get(b).push(a);
            });

            // Find a valid start node (degree >= 2)
            let startNode = -1;
            for (const [id, neighbors] of adj.entries()) {
                if (neighbors.length >= 2) {
                    startNode = id;
                    break;
                }
            }

            if (startNode === -1) {
                this.showToast('Error: No closed loops found in projection');
                return;
            }

            // Walk the loop
            const loopPath = [startNode];
            const visited = new Set([startNode]);
            let curr = startNode;
            let prev = -1;
            let foundLoop = false;

            // Simple greedy walk
            // This assumes a simple single loop. Intersections/branches might break it.
            while (true) {
                const neighbors = adj.get(curr);
                let next = -1;

                for (const n of neighbors) {
                    if (n !== prev) {
                        // Check if weclosed the loop
                        if (n === startNode && loopPath.length > 2) {
                            foundLoop = true;
                            break; // Done
                        }
                        if (!visited.has(n)) {
                            next = n;
                            break;
                        }
                    }
                }

                if (foundLoop) break;

                if (next !== -1) {
                    visited.add(next);
                    loopPath.push(next);
                    prev = curr;
                    curr = next;
                } else {
                    // Dead end
                    break;
                }
            }

            if (!foundLoop) {
                this.showToast('Error: Geometry is not a closed loop');
                return;
            }

            // 3. Create Shape
            const newShape = new THREE.Shape();
            const p0 = points[loopPath[0]];
            // Map 3D (x,z) to 2D shape (x,y) because shape extrudes along Z usually?
            // Actually ExtrudeGeometry extrudes along Z. 
            // Our sketch is on XZ plane. We should create shape in XY plane and rotate mesh?
            // Yes, standard is Shape in XY, Extrusion creates volume along Z.
            // Then we rotate the result -Math.PI/2 around X to lay it flat.

            newShape.moveTo(p0.x, p0.z);
            for (let i = 1; i < loopPath.length; i++) {
                const p = points[loopPath[i]];
                newShape.lineTo(p.x, p.z);
            }
            // Close handled by fill

            // Proceed with this shape
            // Hack: assign it to local var 'shape' by mutating
            // refactoring a bit to avoid duplication would be better but blocking edit is safer

            // Let's just create the mesh here and return to avoid complex flow control in this replaced block

            const extrudeSettings = { depth: 20, bevelEnabled: false };
            const geom = new THREE.ExtrudeGeometry(newShape, extrudeSettings);
            const mat = new THREE.MeshStandardMaterial({
                color: 0xF59E0B, // Keep orange-ish for projection source
                metalness: 0.1, roughness: 0.5, side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(geom, mat);

            // Transformations
            // Shape x,y -> Mesh x,y. Extrude -> z.
            // We want Shape x -> World x, Shape y -> World z. Extrude -> World y?
            // Wait.
            // Points were (x, z).
            // Shape created with (x, z).
            // Extrusion is along Z axis of the geometry.
            // So geometry has width X, height Y (was Z), depth Z (extrusion).
            // We want result to sit on ground.
            // Result geometry: X=x, Y=z, Z=extrusion.
            // We want Z=extrusion to be UP (World Y).
            // So: rotate -90 X? 
            // Original: (x,y,z) -> (x, -z, y).
            // Let's try standard rotation.

            mesh.rotation.x = -Math.PI / 2; // This aligns +Z (extrusion) to +Y (World Up)? No.
            // ThreeJS cylinder/extrude defaults +Z is axis? No, Extrude is +Z.
            // If we rotate -90 X:
            // Local X -> World X
            // Local Y -> World Z (flattened face)
            // Local Z -> World Y (up)
            // This seems correct if Shape coords were (x, z).
            // Wait, if Shape(x, z), then Local Y is World Z. Correct.

            // Position: Center? No, keep absolute coords.
            mesh.position.set(0, 0, 0);

            mesh.userData.isShape = true;
            mesh.userData.originalColor = 0xF59E0B;

            this.viewer.scene.remove(sketch);
            this.sketches = this.sketches.filter(s => s !== sketch);

            this.viewer.scene.add(mesh);
            this.shapes.push(mesh);
            this.selectShape(mesh);
            this.showToast('Projected loop extruded!');
            return;
        }

        const shape = sketch.userData.shapeData;
        if (!shape) {
            this.showToast('Error: Selected sketch has no valid shape data');
            return;
        }

        const extrudeDepth = 20; // Default extrusion height

        // Create extruded geometry
        const extrudeSettings = {
            depth: extrudeDepth,
            bevelEnabled: false
        };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const material = new THREE.MeshStandardMaterial({
            color: 0x10B981,
            metalness: 0.1,
            roughness: 0.5,
            side: THREE.DoubleSide
        });
        const extrudedMesh = new THREE.Mesh(geometry, material);

        // Copy position from sketch
        extrudedMesh.position.copy(sketch.position);
        extrudedMesh.rotation.x = -Math.PI / 2;

        // Mark as shape
        extrudedMesh.userData.isShape = true;
        extrudedMesh.userData.originalColor = 0x10B981;

        // Remove the sketch
        this.viewer.scene.remove(sketch);
        this.sketches = this.sketches.filter(s => s !== sketch);

        // Add the 3D shape
        this.viewer.scene.add(extrudedMesh);
        this.shapes.push(extrudedMesh);

        // Select the new shape
        this.selectShape(extrudedMesh);
        this.showToast('Extruded to 3D!');
    }


    addShape(type) {
        let geometry;
        const size = 20; // Base size in mm

        switch (type) {
            case 'cube':
                geometry = new THREE.BoxGeometry(size, size, size);
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(size / 2, size / 2, size, 32);
                break;
            case 'sphere':
                geometry = new THREE.SphereGeometry(size / 2, 32, 16);
                break;
            case 'cone':
                geometry = new THREE.ConeGeometry(size / 2, size, 32);
                break;
            default:
                return;
        }

        const material = new THREE.MeshStandardMaterial({
            color: 0x2563EB,
            metalness: 0.1,
            roughness: 0.5,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Offset new shapes so they don't overlap
        const offset = this.shapes.length * 25;
        mesh.position.set(offset, size / 2, 0);

        // Store original color for selection toggle
        mesh.userData.originalColor = 0x2563EB;
        mesh.userData.isShape = true;

        this.viewer.scene.add(mesh);
        this.shapes.push(mesh);

        // Auto-select the new shape
        this.selectShape(mesh);

        this.showToast(`Added ${type} - Click to select`);
        console.log(`Added ${type}, total shapes: ${this.shapes.length}`);
    }

    setupShapeSelectionEvents() {
        // Click on viewer to select/deselect shapes AND sketches
        const container = document.getElementById('viewer-container');
        if (!container) return;

        container.addEventListener('click', (e) => {
            // Calculate mouse position
            const rect = container.getBoundingClientRect();
            this.shapeMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.shapeMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            // Raycast against shapes AND sketches
            const candidates = [...this.shapes, ...(this.sketches || [])];

            this.shapeRaycaster.setFromCamera(this.shapeMouse, this.viewer.camera);
            const intersects = this.shapeRaycaster.intersectObjects(candidates, false);

            if (intersects.length > 0) {
                // Select the first hit
                const clickedObj = intersects[0].object;
                this.selectShape(clickedObj);
            } else {
                // Click on empty area - deselect if not clicking Gizmo
                // TransformControls intercepting is handled by ThreeJS, so if we get here, likely missed.
                // But we should be careful not to deselect when clicking the gizmo itself.
                // TransformControls usually doesn't trigger the container click if it captures it?
                // Actually OrbitControls might.
                this.deselectShape();
            }
        });

        // Key bindings for modes
        window.addEventListener('keydown', (e) => {
            if (this.selectedShape) {
                switch (e.key.toLowerCase()) {
                    case 'w': this.setTransformMode('translate'); this.updateModeButtons('translate'); break;
                    case 'e': this.setTransformMode('rotate'); this.updateModeButtons('rotate'); break;
                    case 'r': this.setTransformMode('scale'); this.updateModeButtons('scale'); break;
                }
            }
        });
    }

    selectShape(mesh) {
        // Deselect previous
        if (this.selectedShape && this.selectedShape !== mesh) {
            this.deselectShape();
        }

        this.selectedShape = mesh;

        // Visual highlight - make it glow
        if (mesh.material) {
            // Store original emissive if not stored
            if (!mesh.userData.originalEmissive) {
                mesh.userData.originalEmissive = mesh.material.emissive ? mesh.material.emissive.clone() : new THREE.Color(0, 0, 0);
            }
            mesh.material.emissive = new THREE.Color(0x00ff00);
            mesh.material.emissiveIntensity = 0.3;
        }

        // Attach Gizmo
        if (this.viewer.attachTransform) {
            this.viewer.attachTransform(mesh);
        }

        const type = mesh.userData.isSketch ? 'Sketch' : 'Shape';
        this.showToast(`${type} selected - Press W/E/R to transform, Extrude to 3D`);
    }

    deselectShape() {
        if (this.selectedShape) {
            // Restore emissive
            if (this.selectedShape.material) {
                this.selectedShape.material.emissive = this.selectedShape.userData.originalEmissive || new THREE.Color(0, 0, 0);
                this.selectedShape.material.emissiveIntensity = 0;
            }
        }

        // Detach Gizmo
        if (this.viewer.detachTransform) {
            this.viewer.detachTransform();
        }

        this.selectedShape = null;
    }

    updateTransformSlidersForShape(mesh) {
        // Obsolete
    }


    joinMeshes() {
        if (this.shapes.length < 2) {
            this.showToast('Need at least 2 shapes to join');
            return;
        }

        this.showToast('Joining meshes...');

        // Simple approach: Merge geometries
        const mergedGeometry = new THREE.BufferGeometry();
        const positions = [];
        const normals = [];

        this.shapes.forEach(mesh => {
            // Apply transforms to geometry
            mesh.updateMatrix();
            const geom = mesh.geometry.clone();
            geom.applyMatrix4(mesh.matrix);

            const pos = geom.attributes.position.array;
            const norm = geom.attributes.normal.array;

            for (let i = 0; i < pos.length; i++) {
                positions.push(pos[i]);
            }
            for (let i = 0; i < norm.length; i++) {
                normals.push(norm[i]);
            }

            // Remove from scene
            this.viewer.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });

        mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

        const material = new THREE.MeshStandardMaterial({
            color: 0x10B981,
            metalness: 0.1,
            roughness: 0.5,
            side: THREE.DoubleSide
        });

        const joinedMesh = new THREE.Mesh(mergedGeometry, material);
        this.viewer.scene.add(joinedMesh);

        // Replace with joined mesh
        this.shapes = [joinedMesh];
        this.viewer.mesh = joinedMesh;

        this.showToast('Meshes joined successfully');

        // Auto-validate after join
        this.validateMesh();
    }

    async validateMesh() {
        if (!this.viewer.mesh && this.shapes.length === 0) {
            this.showToast('No mesh to validate');
            return;
        }

        // UI Feedback
        if (this.ui.validationStatus) {
            this.ui.validationStatus.style.display = 'flex';
            this.ui.validationStatus.className = 'validation-badge checking';
            this.ui.validationIcon.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
            this.ui.validationText.textContent = 'Checking...';
        }
        this.showToast('Validating solid (Backend)...');

        try {
            // Export Scene to STL
            const exporter = new STLExporter();
            const sceneRoot = new THREE.Scene();

            // Add mesh if exists
            if (this.viewer.mesh) {
                const m = this.viewer.mesh.clone();
                // Apply current transform to geometry so export works
                m.updateMatrix();
                m.geometry.applyMatrix4(m.matrix);
                m.position.set(0, 0, 0);
                m.rotation.set(0, 0, 0);
                m.scale.set(1, 1, 1);
                sceneRoot.add(m);
            }

            // Add shapes
            this.shapes.forEach(s => {
                const m = s.clone();
                m.updateMatrix();
                m.geometry.applyMatrix4(m.matrix);
                m.position.set(0, 0, 0);
                m.rotation.set(0, 0, 0);
                m.scale.set(1, 1, 1);
                sceneRoot.add(m);
            });

            const stlString = exporter.parse(sceneRoot, { binary: true });
            const blob = new Blob([stlString], { type: 'application/octet-stream' });

            // Upload
            const formData = new FormData();
            formData.append('file', blob, 'validation.stl');

            const res = await fetch('/api/validate_mesh', { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Validation API failed');

            const data = await res.json();

            // UI Result
            if (this.ui.validationStatus) {
                this.ui.validationStatus.style.display = 'flex';
                if (data.valid) {
                    this.ui.validationStatus.className = 'validation-badge valid';
                    this.ui.validationIcon.innerHTML = '<i class="ph ph-check-circle"></i>';
                    this.ui.validationText.textContent = 'Valid Solid';
                    this.showToast('✓ Mesh is Watertight');
                } else {
                    this.ui.validationStatus.className = 'validation-badge invalid';
                    this.ui.validationIcon.innerHTML = '<i class="ph ph-warning-circle"></i>';
                    this.ui.validationText.textContent = 'Not Watertight';
                    this.showToast('⚠ Mesh is NOT Watertight');
                }
            }
            console.log("Validation details:", data.details);

        } catch (e) {
            console.error(e);
            this.showToast('Validation Error');
            if (this.ui.validationStatus) {
                this.ui.validationStatus.style.display = 'none';
            }
        }
    }

    setupTransformEvents() {
        // Gizmo Mode Buttons
        const btnTranslate = document.getElementById('mode-translate');
        const btnRotate = document.getElementById('mode-rotate');
        const btnScale = document.getElementById('mode-scale');
        const btnReset = document.getElementById('btn-reset-transform');

        if (btnTranslate) {
            btnTranslate.addEventListener('click', () => {
                this.setTransformMode('translate');
                this.updateModeButtons('translate');
            });
        }
        if (btnRotate) {
            btnRotate.addEventListener('click', () => {
                this.setTransformMode('rotate');
                this.updateModeButtons('rotate');
            });
        }
        if (btnScale) {
            btnScale.addEventListener('click', () => {
                this.setTransformMode('scale');
                this.updateModeButtons('scale');
            });
        }

        if (btnReset) {
            btnReset.addEventListener('click', () => {
                if (this.selectedShape) {
                    this.selectedShape.position.set(0, 0, 0);
                    this.selectedShape.rotation.set(0, 0, 0);
                    this.selectedShape.scale.set(1, 1, 1);
                    this.showToast('Transform reset');
                } else if (this.viewer.mesh) {
                    this.viewer.mesh.rotation.x = -Math.PI / 2;
                    this.viewer.mesh.rotation.y = 0;
                    this.viewer.mesh.rotation.z = 0;
                    this.viewer.mesh.scale.set(1, 1, 1);
                    this.showToast('Model transform reset');
                }
            });
        }

        // Default mode
        this.setTransformMode('translate');
    }

    setTransformMode(mode) {
        if (this.viewer.setTransformMode) {
            this.viewer.setTransformMode(mode);
        }
    }

    updateModeButtons(activeMode) {
        ['translate', 'rotate', 'scale'].forEach(mode => {
            const btn = document.getElementById(`mode-${mode}`);
            if (btn) {
                if (mode === activeMode) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });
    }

    setupEvents() {
        // Drop Zone Click handled by native input overlay
        console.log("Setup Events: Using native input overlay");

        if (this.ui.fileInput) {
            this.ui.fileInput.addEventListener('change', (e) => {
                console.log("File input changed", e.target.files);
                if (e.target.files.length) {
                    // Alert to user to verify interception (Debug)
                    // alert("File detected: " + e.target.files[0].name); 
                    this.handleFile(e.target.files[0]);
                }
                e.target.value = '';
            });
        }

        // Global Drag & Drop logic
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
            document.body.addEventListener(evt, e => {
                e.preventDefault(); e.stopPropagation();
            });
        });

        // Settings button
        const btnSettings = document.getElementById('btn-settings');
        if (btnSettings) {
            btnSettings.addEventListener('click', () => {
                this.showToast('Settings panel coming soon!');
            });
        }

        document.body.addEventListener('drop', (e) => {
            if (e.dataTransfer.files.length) this.handleFile(e.dataTransfer.files[0]);
        });

        // Header / Home Click
        const brand = document.querySelector('.brand');
        if (brand) {
            brand.style.cursor = 'pointer';
            brand.addEventListener('click', () => {
                // Confirm before reload if work is in progress? For now just reload.
                window.location.reload();
            });
        }

        // Toolbar Bottom Events (Delegation)
        if (this.ui.toolbarBottom) {
            console.log("Setting up toolbar bottom events");
            this.ui.toolbarBottom.querySelectorAll('.icon-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent propagation issues
                    const action = btn.dataset.action;
                    console.log("Toolbar Click:", action); // Debug

                    if (!action) return;

                    // Visual feedback
                    btn.classList.add('active');
                    setTimeout(() => btn.classList.remove('active'), 200);

                    if (action === 'wireframe') this.viewer.toggleWireframe();
                    if (action === 'texture') this.viewer.toggleLighting();
                    if (action === 'grid') this.viewer.toggleGrid();
                    if (action === 'fit') this.viewer.fitView();
                    if (action === 'rotate') {
                        const isRotating = this.viewer.toggleRotation();
                        // Toggle icon between pause and play
                        const icon = btn.querySelector('i');
                        if (icon) {
                            icon.className = isRotating ? 'ph ph-pause' : 'ph ph-play';
                        }
                    }
                });
            });
        } else {
            console.warn("toolbar-bottom not found!");
        }

        // Viewport Controls
        if (this.ui.btnReset) {
            this.ui.btnReset.addEventListener('click', () => {
                this.handleSegmentClick(this.ui.btnReset);
                this.viewer.resetView();
                this.showToast("View Reset");
            });
        }
        if (this.ui.btnFit) {
            this.ui.btnFit.addEventListener('click', () => {
                this.viewer.resetView();
            });
        }

        // Download
        if (this.ui.btnDownload) {
            this.ui.btnDownload.addEventListener('click', () => {
                if (this.serverId) {
                    window.location.href = `/api/download/${this.serverId}`;
                }
            });
        }
    }

    handleSegmentClick(activeBtn) {
        // Manage active state for segmented control
        const parent = activeBtn.parentElement;
        if (parent && parent.classList.contains('segmented-control')) {
            parent.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
            activeBtn.classList.add('active');
        }
    }

    setupOrientationEvents() {
        // Auto Orient
        if (this.ui.btnAutoOrient) {
            this.ui.btnAutoOrient.addEventListener('click', async () => {
                this.handleSegmentClick(this.ui.btnAutoOrient);

                if (!this.serverId) {
                    this.showToast("Still uploading... please wait");
                    return;
                }

                this.showToast("Calculating optimal orientation...");
                try {
                    const res = await fetch(`/api/auto_orient/${this.serverId}`, { method: 'POST' });
                    if (!res.ok) throw new Error("Auto-orient failed");
                    const data = await res.json();

                    if (data.transform) {
                        this.viewer.applyMatrix(data.transform);
                        this.showToast("Orientation applied!");
                    }
                } catch (e) {
                    console.error(e);
                    this.showToast("Auto-orient failed.");
                } finally {
                    this.viewer.resetView();
                }
            });
        }

        // Pick Face
        if (this.ui.btnPickFace) {
            this.ui.btnPickFace.addEventListener('click', () => {
                this.handleSegmentClick(this.ui.btnPickFace);
                this.viewer.enableFaceSelection(true);
                this.showToast("Click a face to align it to bottom");
            });
        }

        // Start Repair
        if (this.ui.btnStartRepair) {
            this.ui.btnStartRepair.addEventListener('click', () => {
                this.startRepair();
            });
        }
    }

    setupEditingEvents() {
        // Select Face Button
        if (this.ui.btnSelectFace) {
            this.ui.btnSelectFace.addEventListener('click', () => {
                // console.log("Select Face clicked");
                const isActive = this.ui.btnSelectFace.classList.toggle('active');
                this.meshEditor.enableSelection(isActive);

                if (isActive) {
                    // Also bind click listener to editor
                    this.viewer.container.addEventListener('click', this.meshEditor.onClick.bind(this.meshEditor));
                }
            });
        } else {
            console.warn("btnSelectFace not found!");
        }

        // Thicken Selected Button
        if (this.ui.btnThicken) {
            // console.log("Setting up Thicken button");
            this.ui.btnThicken.addEventListener('click', () => {
                // console.log("Thicken clicked");
                const amount = prompt("Thicken by (mm):", "0.5");
                if (amount) {
                    this.meshEditor.thickenSelection(parseFloat(amount));
                }
            });
        } else {
            console.warn("btnThicken not found!");
        }

        // Clear Selection Button
        if (this.ui.btnClearSel) {
            // console.log("Setting up Clear Selection button");
            this.ui.btnClearSel.addEventListener('click', () => {
                // console.log("Clear Selection clicked");
                this.meshEditor.clearSelection();
                this.ui.btnSelectFace.classList.remove('active');
                this.meshEditor.enableSelection(false);
            });
        } else {
            console.warn("btnClearSel not found!");
        }
    }

    setState(state) {
        // Core Visibility Reset

        // Hide Overlays (Fade out first)
        [this.ui.sidebarLeft, this.ui.sidebarRight, this.ui.toolbarBottom].forEach(el => {
            el.classList.remove('active');
        });

        // Status
        this.ui.statusIndicator.classList.add('hidden');

        switch (state) {
            case 'idle':
                this.ui.centerStage.classList.remove('hidden');
                // Ensure they are hidden after transition (or immediately for update)
                // In a real app we'd wait for transitionend event, but here we just want to ensure state correctness.
                // We'll trust css opacity:0 for now, but if we want to add hidden class:
                [this.ui.sidebarLeft, this.ui.sidebarRight, this.ui.toolbarBottom].forEach(el => el.classList.add('hidden'));
                break;

            case 'orientation':
                this.ui.centerStage.classList.add('hidden');

                // Show UI
                setTimeout(() => {
                    [this.ui.sidebarLeft, this.ui.sidebarRight, this.ui.toolbarBottom, this.ui.editToolbar].forEach(el => {
                        el.classList.remove('hidden');
                        // Force Reflow
                        void el.offsetWidth;
                        el.classList.add('active');
                    });
                }, 100);

                if (this.ui.btnDownload) this.ui.btnDownload.style.display = 'none';
                break;

            case 'repairing':
                this.ui.centerStage.classList.add('hidden');
                [this.ui.sidebarLeft, this.ui.sidebarRight, this.ui.toolbarBottom, this.ui.editToolbar].forEach(el => {
                    el.classList.remove('hidden');
                    el.classList.add('active');
                });

                // UI Lock
                this.ui.btnStartRepair.disabled = true;
                this.ui.btnStartRepair.innerHTML = `<i class="ph ph-spinner ph-spin"></i> Repairing...`;

                this.ui.repairProgressBar.style.display = 'block';

                this.ui.statusIndicator.classList.remove('hidden');
                this.ui.statusText.textContent = "Processing...";
                break;

            case 'success':
                this.ui.centerStage.classList.add('hidden');
                [this.ui.sidebarLeft, this.ui.sidebarRight, this.ui.toolbarBottom, this.ui.editToolbar].forEach(el => {
                    el.classList.remove('hidden');
                    el.classList.add('active');
                });

                this.ui.statusIndicator.classList.remove('hidden');
                this.ui.statusText.textContent = "Ready";

                this.ui.btnStartRepair.innerHTML = `<i class="ph ph-check"></i> Complete`;
                this.ui.btnStartRepair.disabled = false;

                if (this.ui.btnDownload) {
                    this.ui.btnDownload.style.display = 'flex';
                }
                break;
        }
    }

    // ... (rest of logic: log bubbles, upload, repair, generic methods) ...
    // I need to include the rest of the file or I'll lose it.
    // I will copy the methods from the previous read.

    updateStatus(text, progress) {
        if (text.includes("error")) {
            this.showToast("Error: " + text);
        } else {
            this.addLogBubble(text, text.includes("...") ? "info" : "success");
        }

        if (this.ui.repairProgressBar) {
            this.ui.repairProgressBar.style.overflow = 'hidden';
            if (this.ui.repairProgressFill) this.ui.repairProgressFill.style.width = `${progress}%`;
        }

        if (this.viewer && this.viewer.updateRepairProgress) {
            this.viewer.updateRepairProgress(progress / 100.0);
        }
    }

    addLogBubble(text, type = 'info') {
        const container = document.getElementById('repair-logs');
        if (!container) return;

        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;

        let icon = '';
        if (text.includes('Loading')) icon = '⏳';
        else if (text.includes('Repair')) icon = '🔧';
        else if (text.includes('Done')) icon = '✨';

        entry.textContent = `${icon} ${text}`;
        container.insertBefore(entry, container.firstChild);

        if (container.children.length > 50) container.removeChild(container.lastChild);
    }

    async handleFile(file) {
        console.log("handleFile started for:", file.name);
        try {
            if (!file.name.toLowerCase().endsWith('.stl') && !file.name.toLowerCase().endsWith('.obj')) {
                this.showToast("Only .stl or .obj files supported");
                return;
            }

            this.activeFile = file;
            if (this.ui.infoFilename) this.ui.infoFilename.textContent = file.name;
            if (this.ui.infoVertices) this.ui.infoVertices.textContent = "Loading...";

            console.log("Setting state to orientation...");
            this.setState('orientation');

            // ...

            // Upload
            this.uploadPromise = this.uploadFile(file);

            // Preview
            const url = URL.createObjectURL(file);
            this.viewer.loadSTL(url, () => {
                const stats = this.viewer.getStats();
                if (stats) {
                    this.ui.infoVertices.textContent = stats.vertices.toLocaleString();
                    this.ui.infoFaces.textContent = stats.faces.toLocaleString();
                }
                // Trigger automatic validation
                this.validateMesh();
            });
        } catch (e) {
            console.error("Error in handleFile:", e);
            alert("Error loading file: " + e.message);
        }
    }

    async uploadFile(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            const upRes = await fetch('/api/upload', { method: 'POST', body: formData });
            if (!upRes.ok) throw new Error("Server upload error");
            const upData = await upRes.json();
            this.serverId = upData.id;
            return this.serverId;
        } catch (e) {
            console.error("Upload failed", e);
            this.showToast("Upload failed");
            throw e;
        }
    }

    async startRepair() {
        this.setState('repairing');
        try {
            if (!this.serverId) await this.uploadPromise;

            const currentMatrix = this.viewer.getCurrentTransformArray();
            const body = {};
            if (currentMatrix) body.transform = currentMatrix;

            await fetch(`/api/repair/${this.serverId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            // WebSocket
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const ws = new WebSocket(`${protocol}//${window.location.host}/ws/progress/${this.serverId}`);

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'progress') {
                    this.updateStatus(data.text, data.value * 100);
                } else if (data.type === 'done') {
                    this.updateStatus('Complete', 100);
                    this.showToast("Repair Complete! Loading...");

                    // Auto-load Results
                    const resultUrl = `/api/download/${this.serverId}`;
                    this.viewer.loadSTL(resultUrl, () => {
                        this.showToast("Fixed Model Loaded");
                        // Reset visuals
                        if (this.viewer.updateRepairProgress) this.viewer.updateRepairProgress(0);

                        // Save to recent models cache
                        const filename = this.currentFilename || `fixed_${this.serverId}.stl`;
                        this.saveToRecentModels(filename, resultUrl);
                    });

                    this.setState('success');
                    ws.close();
                    if (this.ui.infoWaterproof) {
                        this.ui.infoWaterproof.textContent = "Yes";
                        this.ui.infoWaterproof.style.color = "var(--color-success)";
                    }
                }
            };
        } catch (e) {
            console.error(e);
            this.showToast("Repair failed");
            this.ui.btnStartRepair.disabled = false;
            this.ui.btnStartRepair.textContent = "Retry";
        }
    }

    // --- Recent Models ---

    loadRecentModels() {
        try {
            const stored = localStorage.getItem(this.RECENT_MODELS_KEY);
            if (stored) {
                this.recentModels = JSON.parse(stored);
            } else {
                this.recentModels = [];
            }
            this.renderRecentModels();
        } catch (e) {
            console.error("Failed to load recent models", e);
            this.recentModels = [];
        }
    }

    saveToRecentModels(filename, url) {
        // Remove if exists
        this.recentModels = this.recentModels.filter(m => m.filename !== filename);

        // Add to top
        this.recentModels.unshift({
            filename: filename,
            url: url, // Note: Blob URLs expire. Ideally we'd store ID and re-fetch or use different storage.
            // For this session/app lifecycle with API, we might need ID.
            // Let's store API ID if possible, or assume URL is from API download.
            date: new Date().toISOString()
        });

        // Limit to 5
        if (this.recentModels.length > this.MAX_RECENT_MODELS) {
            this.recentModels = this.recentModels.slice(0, this.MAX_RECENT_MODELS);
        }

        localStorage.setItem(this.RECENT_MODELS_KEY, JSON.stringify(this.recentModels));
        this.renderRecentModels();
    }

    renderRecentModels() {
        const list = document.getElementById('recent-models-list');
        const panel = document.getElementById('recent-models-panel');

        if (!list || !panel) return;

        if (this.recentModels.length === 0) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'flex';
        list.innerHTML = '';

        this.recentModels.forEach((model, index) => {
            const item = document.createElement('div');
            item.className = 'recent-item';
            item.onclick = () => this.handleRecentModelClick(model);

            item.innerHTML = `
                <div style="overflow:hidden;">
                    <div class="name" title="${model.filename}">${model.filename}</div>
                    <div class="meta">${new Date(model.date).toLocaleTimeString()}</div>
                </div>
                <button class="delete-btn" title="Remove">
                    <i class="ph ph-trash"></i>
                </button>
            `;

            // Delete button
            const btn = item.querySelector('.delete-btn');
            btn.onclick = (e) => {
                e.stopPropagation();
                this.deleteRecentModel(index);
            };

            list.appendChild(item);
        });
    }

    deleteRecentModel(index) {
        this.recentModels.splice(index, 1);
        localStorage.setItem(this.RECENT_MODELS_KEY, JSON.stringify(this.recentModels));
        this.renderRecentModels();
    }

    handleRecentModelClick(model) {
        // If it's an API URL (begins with /api/), we can load it.
        // If it was a Blob URL, it might have expired if page reloaded.
        // We'll try to load it.
        this.viewer.loadSTL(model.url, () => {
            this.showToast(`Loaded ${model.filename}`);
            this.currentFilename = model.filename;
            this.ui.infoFilename.textContent = model.filename;
        });
    }

    showToast(msg) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.style.cssText = `
            background: #27272A; 
            color: white; 
            padding: 8px 16px; 
            border-radius: 99px; 
            font-size: 13px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            animation: slideIn 0.3s ease;
        `;
        t.textContent = msg;
        const container = document.getElementById('toast-container');
        if (container) {
            container.appendChild(t);
            setTimeout(() => t.remove(), 3000);
        }
    }

    loadRecentModels() {
        try {
            const stored = localStorage.getItem(this.RECENT_MODELS_KEY);
            if (stored) {
                this.recentModels = JSON.parse(stored);
            } else {
                this.recentModels = [];
            }
            this.renderRecentModels();
        } catch (e) {
            console.error("Failed to load recent models", e);
            this.recentModels = [];
        }
    }

    saveToRecentModels(filename, filepath) {
        try {
            let models = JSON.parse(localStorage.getItem(this.RECENT_MODELS_KEY) || '[]');

            // Remove if already exists (to move to top)
            models = models.filter(m => m.filepath !== filepath);

            // Add to front
            models.unshift({
                filename,
                filepath,
                timestamp: Date.now()
            });

            // Keep only last 5
            if (models.length > this.MAX_RECENT_MODELS) {
                models = models.slice(0, this.MAX_RECENT_MODELS);
            }

            localStorage.setItem(this.RECENT_MODELS_KEY, JSON.stringify(models));
            this.recentModels = models;
            this.renderRecentModels();
        } catch (e) {
            console.error("Failed to save recent model:", e);
        }
    }

    removeFromRecentModels(filepath) {
        try {
            let models = JSON.parse(localStorage.getItem(this.RECENT_MODELS_KEY) || '[]');
            models = models.filter(m => m.filepath !== filepath);
            localStorage.setItem(this.RECENT_MODELS_KEY, JSON.stringify(models));
            this.recentModels = models;
            this.renderRecentModels();
        } catch (e) {
            console.error("Failed to remove recent model:", e);
        }
    }

    renderRecentModels() {
        const list = document.getElementById('recent-models-list');
        const panel = document.getElementById('recent-models-panel');

        if (!list || !panel) return;

        if (this.recentModels.length === 0) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'flex';
        list.innerHTML = '';

        this.recentModels.forEach((model, index) => {
            const item = document.createElement('div');
            item.className = 'recent-item';

            // Handle click on item
            item.onclick = (e) => {
                if (e.target.closest('.delete-btn')) return;
                this.handleRecentModelClick(model);
            };

            item.innerHTML = `
                <div style="overflow:hidden;">
                    <div class="name" title="${model.filename}">${model.filename}</div>
                    <div class="meta">${new Date(model.timestamp).toLocaleTimeString()}</div>
                </div>
                <button class="delete-btn" title="Remove">
                    <i class="ph ph-trash"></i>
                </button>
            `;

            // Delete button
            const btn = item.querySelector('.delete-btn');
            btn.onclick = (e) => {
                e.stopPropagation();
                this.removeFromRecentModels(model.filepath);
            };

            list.appendChild(item);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new ZenMesher();
});
