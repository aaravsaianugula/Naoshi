import * as THREE from 'three';

/**
 * MeshEditor - Handle 3D mesh selection and editing operations
 */
export class MeshEditor {
    constructor(viewer) {
        this.viewer = viewer;
        this.selectionMode = false;
        this.selectedFaces = new Set(); // Set of face indices
        this.highlightMesh = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Tool State
        this.activeTool = null; // 'select', 'thicken', 'extrude', null
    }

    /**
     * Enable/Disable Selection Mode
     */
    enableSelection(enabled) {
        this.selectionMode = enabled;

        if (enabled) {
            this.viewer.container.style.cursor = 'crosshair';
            this.viewer.showToast("Selection Mode: Click faces to select");
        } else {
            this.viewer.container.style.cursor = 'default';
            this.clearSelection();
        }
    }

    /**
     * Handle Click for Face Selection
     */
    onClick(event) {
        if (!this.selectionMode || !this.viewer.mesh) return;

        const rect = this.viewer.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.viewer.camera);
        const intersects = this.raycaster.intersectObject(this.viewer.mesh, true);

        if (intersects.length > 0 && intersects[0].face) {
            const faceIndex = intersects[0].faceIndex;

            // Toggle selection
            if (this.selectedFaces.has(faceIndex)) {
                this.selectedFaces.delete(faceIndex);
            } else {
                this.selectedFaces.add(faceIndex);
            }

            this.updateHighlight();
            this.viewer.showToast(`${this.selectedFaces.size} faces selected`);
        }
    }

    /**
     * Select Connected Region (Flood Fill)
     */
    selectConnectedRegion(seedFaceIndex) {
        if (!this.viewer.mesh) return;

        const geometry = this.viewer.mesh.geometry;
        const index = geometry.index;
        const position = geometry.attributes.position;

        if (!index) {
            console.warn("Geometry must be indexed for region selection");
            return;
        }

        // Build adjacency map (face -> neighboring faces)
        const adjacency = this.buildFaceAdjacency(geometry);

        // Flood fill
        const queue = [seedFaceIndex];
        const visited = new Set([seedFaceIndex]);

        while (queue.length > 0) {
            const currentFace = queue.shift();
            this.selectedFaces.add(currentFace);

            const neighbors = adjacency.get(currentFace) || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }

        this.updateHighlight();
        this.viewer.showToast(`Region selected: ${this.selectedFaces.size} faces`);
    }

    /**
     * Build Face Adjacency Map
     */
    buildFaceAdjacency(geometry) {
        const index = geometry.index.array;
        const faceCount = index.length / 3;
        const adjacency = new Map();

        // Map: edge key -> [face indices using this edge]
        const edgeToFaces = new Map();

        for (let i = 0; i < faceCount; i++) {
            const i0 = index[i * 3];
            const i1 = index[i * 3 + 1];
            const i2 = index[i * 3 + 2];

            // Three edges per face
            const edges = [
                [i0, i1].sort().join(','),
                [i1, i2].sort().join(','),
                [i2, i0].sort().join(',')
            ];

            edges.forEach(edge => {
                if (!edgeToFaces.has(edge)) edgeToFaces.set(edge, []);
                edgeToFaces.get(edge).push(i);
            });
        }

        // Build adjacency from shared edges
        for (let i = 0; i < faceCount; i++) {
            const i0 = index[i * 3];
            const i1 = index[i * 3 + 1];
            const i2 = index[i * 3 + 2];

            const edges = [
                [i0, i1].sort().join(','),
                [i1, i2].sort().join(','),
                [i2, i0].sort().join(',')
            ];

            const neighbors = new Set();
            edges.forEach(edge => {
                const facesOnEdge = edgeToFaces.get(edge);
                facesOnEdge.forEach(f => {
                    if (f !== i) neighbors.add(f);
                });
            });

            adjacency.set(i, Array.from(neighbors));
        }

        return adjacency;
    }

    /**
     * Update Visual Highlight for Selected Faces
     */
    updateHighlight() {
        // Remove old highlight
        if (this.highlightMesh) {
            this.viewer.scene.remove(this.highlightMesh);
            this.highlightMesh.geometry.dispose();
            this.highlightMesh.material.dispose();
            this.highlightMesh = null;
        }

        if (this.selectedFaces.size === 0) return;

        const geometry = this.viewer.mesh.geometry;
        const index = geometry.index.array;
        const position = geometry.attributes.position.array;

        // Extract selected faces
        const highlightPositions = [];

        this.selectedFaces.forEach(faceIndex => {
            const i0 = index[faceIndex * 3];
            const i1 = index[faceIndex * 3 + 1];
            const i2 = index[faceIndex * 3 + 2];

            // Triangle vertices
            highlightPositions.push(
                position[i0 * 3], position[i0 * 3 + 1], position[i0 * 3 + 2],
                position[i1 * 3], position[i1 * 3 + 1], position[i1 * 3 + 2],
                position[i2 * 3], position[i2 * 3 + 1], position[i2 * 3 + 2]
            );
        });

        const highlightGeom = new THREE.BufferGeometry();
        highlightGeom.setAttribute('position', new THREE.Float32BufferAttribute(highlightPositions, 3));
        highlightGeom.computeVertexNormals();

        const highlightMat = new THREE.MeshBasicMaterial({
            color: 0xff3366,
            opacity: 0.5,
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false
        });

        this.highlightMesh = new THREE.Mesh(highlightGeom, highlightMat);
        this.highlightMesh.position.copy(this.viewer.mesh.position);
        this.highlightMesh.rotation.copy(this.viewer.mesh.rotation);
        this.highlightMesh.scale.copy(this.viewer.mesh.scale);

        this.viewer.scene.add(this.highlightMesh);
    }

    /**
     * Clear Selection
     */
    clearSelection() {
        this.selectedFaces.clear();
        this.updateHighlight();
    }

    /**
     * Thicken Selected Faces
     */
    thickenSelection(amount = 0.5) {
        if (this.selectedFaces.size === 0) {
            this.viewer.showToast("No faces selected");
            return;
        }

        const geometry = this.viewer.mesh.geometry.clone();
        const position = geometry.attributes.position;
        const normal = geometry.attributes.normal;
        const index = geometry.index.array;

        // Get unique vertices from selected faces
        const affectedVertices = new Set();
        this.selectedFaces.forEach(faceIndex => {
            affectedVertices.add(index[faceIndex * 3]);
            affectedVertices.add(index[faceIndex * 3 + 1]);
            affectedVertices.add(index[faceIndex * 3 + 2]);
        });

        // Offset vertices along normals
        affectedVertices.forEach(vertexIndex => {
            const nx = normal.getX(vertexIndex);
            const ny = normal.getY(vertexIndex);
            const nz = normal.getZ(vertexIndex);

            position.setX(vertexIndex, position.getX(vertexIndex) + nx * amount);
            position.setY(vertexIndex, position.getY(vertexIndex) + ny * amount);
            position.setZ(vertexIndex, position.getZ(vertexIndex) + nz * amount);
        });

        position.needsUpdate = true;
        geometry.computeVertexNormals();

        this.viewer.mesh.geometry.dispose();
        this.viewer.mesh.geometry = geometry;

        this.clearSelection();
        this.viewer.showToast(`Thickened by ${amount} units`);
    }

    /**
     * Extrude Selected Faces
     */
    extrudeSelection(depth = 1.0) {
        if (this.selectedFaces.size === 0) {
            this.viewer.showToast("No faces selected");
            return;
        }

        // This is complex - requires creating new geometry
        // For MVP, we'll use thicken as a placeholder
        this.thickenSelection(depth);
        this.viewer.showToast(`Extruded ${depth} units (simplified)`);
    }
}
