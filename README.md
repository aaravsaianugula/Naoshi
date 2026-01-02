# Mesher - Precision STL Repair

A powerful, local-first 3D mesh repair and editing studio. Designed to fix broken meshes from AI generators (Rodin, Meshy) and prepare them for 3D printing.

![Mesher UI](web/logo.png)

## Quick Start (Windows)

1.  **Get the App**:
    -   Clone this repository: `git clone https://github.com/your-username/mesher.git`
    -   *Or* Download and extract the ZIP.

2.  **Install & Run**:
    -   Double-click **`install.bat`** (Run once to setup).
    -   A **Mesher** shortcut will appear on your Desktop.
    -   Double-click the Desktop Shortcut (or **`start.bat`**) to launch.

## Features

-   **Deep Mesh Repair**: Uses advanced algorithms (including Alpha Wrap) to fix non-manifold geometry, holes, and flipped normals.
-   **CAD-Style Editing**:
    -   **Gizmo Controls**: Move (W), Rotate (E), and Scale (R) objects naturally.
    -   **Face Extrusion**: Select mesh faces and extrude them with solid side geometry.
    -   **Smart Sketches**: Auto-detects closed loops in projected geometry for extrusion.
-   **Auto-Validation**: Instant background checks for watertightness upon file load.
-   **Local & Secure**: All processing happens locally on your machine.
-   **Project History**: Remembers your last 5 working files for quick access.

## Requirements

-   Windows 10/11
-   Python 3.10 or higher
-   Modern Web Browser (Chrome, Edge, Firefox)

