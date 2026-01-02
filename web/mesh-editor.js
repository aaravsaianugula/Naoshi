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
    extrudeSelection(depth = 5.0) {
        if (this.selectedFaces.size === 0) {
            this.viewer.showToast("No faces selected");
            return;
        }

        const geometry = this.viewer.mesh.geometry;
        const indexAttribute = geometry.index;
        const posAttribute = geometry.attributes.position;
        const normalAttribute = geometry.attributes.normal;

        // 1. Identify Boundary Edges of the selection
        // Edge key -> count. If count == 1 within selection, it's a boundary.
        // But we need to check if the edge is shared with a NON-selected face to be a true boundary of the patch?
        // Actually, if we just consider the set of selected faces:
        // An edge is internal if it's shared by 2 selected faces.
        // An edge is boundary if it's used by 1 selected face (and presumably 1 unselected face, or 0 if mesh border).
        const edgeCounts = new Map(); // "min,max" -> count

        const selectedFaceArray = Array.from(this.selectedFaces);

        // Calculate average normal for direction
        const avgNormal = new THREE.Vector3();

        selectedFaceArray.forEach(faceIdx => {
            const a = indexAttribute.getX(faceIdx * 3);
            const b = indexAttribute.getY(faceIdx * 3);
            const c = indexAttribute.getZ(faceIdx * 3);

            // Add normals
            const n = new THREE.Vector3();
            n.fromBufferAttribute(normalAttribute, a);
            avgNormal.add(n);
            n.fromBufferAttribute(normalAttribute, b);
            avgNormal.add(n);
            n.fromBufferAttribute(normalAttribute, c);
            avgNormal.add(n);

            // Edges
            const edges = [
                [a, b].sort((x, y) => x - y).join(','),
                [b, c].sort((x, y) => x - y).join(','),
                [c, a].sort((x, y) => x - y).join(',')
            ];

            edges.forEach(e => {
                edgeCounts.set(e, (edgeCounts.get(e) || 0) + 1);
            });
        });

        avgNormal.normalize();

        // Find boundary edges (count === 1)
        const boundaryEdges = [];
        for (const [key, count] of edgeCounts.entries()) {
            if (count === 1) {
                boundaryEdges.push(key.split(',').map(Number));
            }
        }

        // 2. We need to duplicate the vertices of the selected faces to create the "Cap".
        // However, ThreeJS geometry is indexed. 
        // Strategy:
        // - Create new vertices for the "Cap" (duplicate of vertices used by selected faces).
        // - Update the selected faces to point to these NEW vertices.
        // - Move the NEW vertices by (normal * depth).
        // - Create SIDE faces connecting the OLD boundary vertices to the NEW boundary vertices.

        // Map old_vertex_index -> new_vertex_index (for those in selection)
        const vertexMap = new Map();
        const oldIndices = []; // To reconstruct geometry

        // Collect all unique vertices involved in selection
        selectedFaceArray.forEach(faceIdx => {
            oldIndices.push(indexAttribute.getX(faceIdx * 3));
            oldIndices.push(indexAttribute.getY(faceIdx * 3));
            oldIndices.push(indexAttribute.getZ(faceIdx * 3));
        });

        // Create new vertices
        const uniqueVerts = new Set(oldIndices);
        let nextIndex = posAttribute.count;

        // Resize attributes to hold new vertices
        // Note: BufferAttribute resize is not direct, usually we create new buffer.
        // For simplicity/performance in this MVP, let's rebuild the attribute array.
        const currentPosArray = Array.from(posAttribute.array);
        const currentNormArray = Array.from(normalAttribute.array);

        uniqueVerts.forEach(oldIdx => {
            // Copy Position
            currentPosArray.push(posAttribute.getX(oldIdx));
            currentPosArray.push(posAttribute.getY(oldIdx));
            currentPosArray.push(posAttribute.getZ(oldIdx));

            // Copy Normal
            currentNormArray.push(normalAttribute.getX(oldIdx));
            currentNormArray.push(normalAttribute.getY(oldIdx));
            currentNormArray.push(normalAttribute.getZ(oldIdx));

            vertexMap.set(oldIdx, nextIndex);
            nextIndex++;
        });

        // 3. Move the NEW vertices
        // We move them along the calculated average normal. 
        // (Or we could move them along their individual normals for "inflate", but "extrude" usually means linear shift).
        // Let's stick to "Extrude" = move along Common Normal.
        vertexMap.forEach((newIdx, oldIdx) => {
            const x = currentPosArray[newIdx * 3];
            const y = currentPosArray[newIdx * 3 + 1];
            const z = currentPosArray[newIdx * 3 + 2];

            currentPosArray[newIdx * 3] = x + avgNormal.x * depth;
            currentPosArray[newIdx * 3 + 1] = y + avgNormal.y * depth;
            currentPosArray[newIdx * 3 + 2] = z + avgNormal.z * depth;
        });

        // 4. Update the Selected Faces to use the new vertices
        // We'll rebuild the index array.
        const currentIndexArray = Array.from(indexAttribute.array);

        selectedFaceArray.forEach(faceIdx => {
            const a = currentIndexArray[faceIdx * 3];
            const b = currentIndexArray[faceIdx * 3 + 1];
            const c = currentIndexArray[faceIdx * 3 + 2];

            currentIndexArray[faceIdx * 3] = vertexMap.get(a);
            currentIndexArray[faceIdx * 3 + 1] = vertexMap.get(b);
            currentIndexArray[faceIdx * 3 + 2] = vertexMap.get(c);
        });

        // 5. Create Side Faces (Quads -> 2 Tris) for boundary edges
        // Check winding order!
        // Boundary edge [u, v] (original indices)
        // We need sides [u, v, newV, newU]
        // Tri 1: u, v, newV
        // Tri 2: u, newV, newU
        // But we must respect original winding.
        // The boundary edges list (lines 142) doesn't preserve direction relative to the face.
        // We need to check which face used this edge.

        const newIndices = [];

        boundaryEdges.forEach(edge => {
            const [u, v] = edge;

            // Find the face in selection that uses this edge to determine winding
            // We need the edge to be (u->v) or (v->u) such that it follows the face CCW.
            let orderedU = u;
            let orderedV = v;

            const faceIdx = selectedFaceArray.find(f => {
                const a = indexAttribute.getX(f * 3);
                const b = indexAttribute.getY(f * 3);
                const c = indexAttribute.getZ(f * 3);

                // Check if u,v are sequential in a,b,c
                if ((a === u && b === v) || (b === u && c === v) || (c === u && a === v)) return true; // u->v
                if ((a === v && b === u) || (b === v && c === u) || (c === v && a === u)) {
                    // Swap for finding, but we need to record that it was reversed?
                    return true;
                }
                return false;
            });

            // Check winding on that found face
            const a = indexAttribute.getX(faceIdx * 3);
            const b = indexAttribute.getY(faceIdx * 3);
            const c = indexAttribute.getZ(faceIdx * 3);

            if ((a === u && b === v) || (b === u && c === v) || (c === u && a === v)) {
                orderedU = u; orderedV = v;
            } else {
                orderedU = v; orderedV = u;
            }

            const newU = vertexMap.get(orderedU);
            const newV = vertexMap.get(orderedV);

            // Create 2 triangles for the side
            // 1: orderedU, orderedV, newV
            newIndices.push(orderedU, orderedV, newV);
            // 2: orderedU, newV, newU
            newIndices.push(orderedU, newV, newU);
        });

        // Combine indices
        const finalIndices = currentIndexArray.concat(newIndices);

        // 6. Update Geometry
        const newGeom = new THREE.BufferGeometry();
        newGeom.setAttribute('position', new THREE.Float32BufferAttribute(currentPosArray, 3));
        newGeom.setAttribute('normal', new THREE.Float32BufferAttribute(currentNormArray, 3));
        newGeom.setIndex(finalIndices);

        // Recalculate normals for correct shading
        newGeom.computeVertexNormals();

        this.viewer.mesh.geometry.dispose();
        this.viewer.mesh.geometry = newGeom;

        this.clearSelection();
        this.viewer.showToast(`Extruded ${depth} units`);
    }
}
