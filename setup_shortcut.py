import os
import sys
import winshell
from win32com.client import Dispatch
from PIL import Image

def create_shortcut():
    desktop = winshell.desktop()
    path = os.path.join(desktop, "Mesher.lnk")
    target = os.path.abspath("start.bat")
    wchem_dir = os.path.dirname(target)
    icon = os.path.abspath("icon.ico")
    
    shell = Dispatch('WScript.Shell')
    shortcut = shell.CreateShortcut(path)
    shortcut.TargetPath = target
    shortcut.WorkingDirectory = wchem_dir
    shortcut.IconLocation = icon
    shortcut.Description = "Mesher - Precision STL Repair"
    shortcut.Save()
    print(f"Shortcut created at: {path}")

def convert_icon():
    img_path = os.path.join("web", "logo.png")
    if os.path.exists(img_path):
        img = Image.open(img_path)
        img.save("icon.ico", format='ICO', sizes=[(256, 256)])
        print("Icon converted to icon.ico")
    else:
        print("Warning: web/logo.png not found, using default icon.")

if __name__ == "__main__":
    try:
        convert_icon()
        create_shortcut()
    except Exception as e:
        print(f"Error creating shortcut: {e}")
