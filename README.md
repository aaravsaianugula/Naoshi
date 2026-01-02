# Mesher - Precision STL Repair

A powerful, local-first 3D mesh repair and editing studio. Designed to fix broken meshes from AI generators (Rodin, Meshy) and prepare them for 3D printing.

![Mesher UI](web/logo.png)

## Quick Start (Windows)

1.  **Get the App**:
    -   Clone this repository: `git clone https://github.com/your-username/mesher.git`
    -   *Or* Download and extract the ZIP.

2.  **Run**:
    Double-click **`start.bat`**. 
    
    That's it! This script will automatically:
    -   Create an isolated virtual environment (`venv`).
    -   Install all dependencies.
    -   Launch the backend server.
    -   Open the app in your browser at `http://localhost:8000`.

## Features

-   **Deep Mesh Repair**: Uses advanced algorithms (including Alpha Wrap) to fix non-manifold geometry, holes, and flipped normals.
-   **CAD-Style Editing**:
    -   **Gizmo Controls**: Move (W), Rotate (E), and Scale (R) objects naturally.
    -   **2D Sketch**: Create rectangles, circles, and project geometry to create new shapes.
    -   **Extrude**: Turn sketches into solid 3D volumes.
-   **Validation**: Real-time checking for watertightness and printability.
-   **Local & Secure**: All processing happens locally on your machine.
-   **Project History**: Remembers your last 5 working files for quick access.

## Requirements

-   Windows 10/11
-   Python 3.10 or higher
-   Modern Web Browser (Chrome, Edge, Firefox)

