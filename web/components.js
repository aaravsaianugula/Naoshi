export class FileListManager {
    constructor(listElementId, emptyStateId) {
        this.listElement = document.getElementById(listElementId);
        this.emptyStateElement = document.getElementById(emptyStateId);
        this.files = new Map(); // id -> fileObj
    }

    addFile(file) {
        const fileId = Math.random().toString(36).substr(2, 9);
        const fileObj = {
            id: fileId,
            file: file,
            status: 'queued',
            progress: 0
        };

        this.files.set(fileId, fileObj);
        this.renderFileCard(fileObj);
        this.toggleEmptyState();
        return fileId;
    }

    removeFile(fileId) {
        const card = document.getElementById(`card-${fileId}`);
        if (card) {
            // Animate removal first (via CSS/GSAP externally handled ideally, but simple here)
            card.remove();
        }
        this.files.delete(fileId);
        this.toggleEmptyState();
    }

    triggerRepair() {
        // Return files to process
        return Array.from(this.files.values());
    }

    renderFileCard(fileObj) {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.id = `card-${fileObj.id}`;

        card.innerHTML = `
            <div class="file-icon">
                📄
            </div>
            <div class="file-info">
                <div class="file-name" title="${fileObj.file.name}">${fileObj.file.name}</div>
                <div class="file-status">Ready to repair</div>
                <div class="progress-bar-container" style="display:none; height: 4px; background: #eee; border-radius: 2px; margin-top: 4px;">
                    <div class="progress-fill" style="width: 0%; height: 100%; background: var(--accent-primary); border-radius: 2px; transition: width 0.3s;"></div>
                </div>
            </div>
            <button class="remove-btn" onclick="document.dispatchEvent(new CustomEvent('remove-file', {detail: '${fileObj.id}'}))">
                ✕
            </button>
        `;

        // Insert into list
        this.listElement.appendChild(card);
    }

    toggleEmptyState() {
        if (this.files.size > 0) {
            // this.emptyStateElement.style.display = 'none'; // Keep upload button visible always for "Add more"
            this.emptyStateElement.querySelector('h3').textContent = "Add more files";
        } else {
            this.emptyStateElement.querySelector('h3').textContent = "Drop STL files";
        }
    }
}
