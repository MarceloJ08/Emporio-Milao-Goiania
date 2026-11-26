"""Instala no projeto as revisões registradas em skills.lock.json."""

import json
import os
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / ".agents" / "skills"
CODEX = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")
INSTALLER = CODEX / "skills/.system/skill-installer/scripts/install-skill-from-github.py"
ALIASES = {
    ("danpeg/visual-research", "."): "visual-research",
    ("nextlevelbuilder/ui-ux-pro-max-skill", ".claude/skills/design-system"):
        "ui-ux-pro-max-design-system",
}


def main():
    collections = json.loads((ROOT / "skills.lock.json").read_text(encoding="utf-8"))
    for collection in collections:
        repo = collection["repo"]
        args = [sys.executable, str(INSTALLER), "--repo", repo, "--ref",
                collection["revision"], "--dest", str(DEST)]
        pending = []
        for path in collection["paths"]:
            alias = ALIASES.get((repo, path))
            name = alias or Path(path).name
            if (DEST / name / "SKILL.md").is_file():
                continue
            if alias:
                subprocess.run([*args, "--path", path, "--name", alias], check=True)
            else:
                pending.append(path)
        if pending:
            subprocess.run([*args, "--path", *pending], check=True)
    print(f"Skills disponíveis em {DEST}")


if __name__ == "__main__":
    main()
