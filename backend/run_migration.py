#!/usr/bin/env python3
"""Script to run the meeting migration"""
import subprocess
import sys
import os

if __name__ == "__main__":
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    try:
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            cwd=script_dir,
            check=True,
            capture_output=True,
            text=True
        )
        print("Migration successful!")
        print(result.stdout)
    except subprocess.CalledProcessError as e:
        print("Migration failed!")
        print(e.stderr)
        sys.exit(1)
    except FileNotFoundError:
        print("Alembic not found. Please activate your virtual environment first.")
        print("Run: cd backend && .venv\\Scripts\\activate (Windows)")
        print("Or: cd backend && source .venv/bin/activate (Linux/Mac)")
        sys.exit(1)
