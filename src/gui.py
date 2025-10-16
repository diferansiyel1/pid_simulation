from __future__ import annotations

import threading
import traceback
from pathlib import Path
import os
import shutil
from tkinter import BOTH, BOTTOM, DISABLED, END, LEFT, NORMAL, RIGHT, TOP, Button, E, Frame, Label, OptionMenu, StringVar, Text, Tk, filedialog

from manim import config, tempconfig
from typing import Optional

try:
    from pydub import AudioSegment
except Exception:  # pydub optional at runtime
    AudioSegment = None  # type: ignore

from src.animations import (
    CascadeControlScene,
    FeedforwardControlScene,
    NegativeFeedbackScene,
    PIDScene,
)


QUALITY_PRESETS = {
    "Low (preview)": {"pixel_width": 854, "pixel_height": 480, "frame_rate": 30},
    "Medium": {"pixel_width": 1280, "pixel_height": 720, "frame_rate": 30},
    "High (1080p)": {"pixel_width": 1920, "pixel_height": 1080, "frame_rate": 30},
}


SCENES = {
    "Negative Feedback": (NegativeFeedbackScene, "NegativeFeedbackScene.mp4"),
    "PID Control": (PIDScene, "PIDScene.mp4"),
    "Cascade Control": (CascadeControlScene, "CascadeControlScene.mp4"),
    "Feedforward Control": (FeedforwardControlScene, "FeedforwardScene.mp4"),
}


class RenderGUI:
    def __init__(self, root: Tk):
        self.root = root
        root.title("Bioprocess Control Animations - Renderer")
        root.minsize(720, 480)

        # Top controls
        top = Frame(root)
        top.pack(side=TOP, fill=BOTH, padx=10, pady=10)

        Label(top, text="Quality:").pack(side=LEFT)
        self.quality_var = StringVar(value="Low (preview)")
        OptionMenu(top, self.quality_var, *QUALITY_PRESETS.keys()).pack(side=LEFT, padx=6)

        Label(top, text="Output folder:").pack(side=LEFT, padx=(16, 4))
        self.output_dir = StringVar(value=str(Path.cwd() / "media" / "gui"))
        Label(top, textvariable=self.output_dir).pack(side=LEFT)
        Button(top, text="Browse", command=self._choose_output).pack(side=LEFT, padx=8)

        Button(top, text="Render ALL", command=self.render_all).pack(side=RIGHT)
        Button(top, text="FFmpeg...", command=self._pick_ffmpeg).pack(side=RIGHT, padx=6)

        # Scene buttons
        mid = Frame(root)
        mid.pack(side=TOP, fill=BOTH, padx=10, pady=10)

        for name in SCENES.keys():
            Button(mid, text=name, command=lambda n=name: self.render_one(n)).pack(side=LEFT, padx=6)

        # Log area
        bottom = Frame(root)
        bottom.pack(side=TOP, fill=BOTH, expand=True, padx=10, pady=10)
        Label(bottom, text="Logs:").pack(anchor="w")
        self.log = Text(bottom, height=16)
        self.log.pack(fill=BOTH, expand=True)

        # Footer
        footer = Frame(root)
        footer.pack(side=BOTTOM, fill=BOTH, padx=10, pady=6)
        self.status = StringVar(value="Ready")
        Label(footer, textvariable=self.status, anchor=E).pack(side=RIGHT)

        # Startup checks
        self._ensure_ffmpeg()

    # UI helpers
    def _choose_output(self):
        chosen = filedialog.askdirectory()
        if chosen:
            self.output_dir.set(chosen)

    def _append_log(self, text: str):
        self.log.insert(END, text + "\n")
        self.log.see(END)

    def _disable(self):
        for child in self.root.winfo_children():
            self._set_state_recursive(child, DISABLED)

    def _enable(self):
        for child in self.root.winfo_children():
            self._set_state_recursive(child, NORMAL)

    def _set_state_recursive(self, widget, state):
        try:
            widget.configure(state=state)
        except Exception:
            pass
        for child in getattr(widget, "winfo_children", lambda: [])():
            self._set_state_recursive(child, state)

    # Rendering
    def render_all(self):
        self._run_async(lambda: self._render_many(list(SCENES.keys())))

    def render_one(self, scene_name: str):
        self._run_async(lambda: self._render_many([scene_name]))

    def _run_async(self, func):
        t = threading.Thread(target=self._with_ui_lock, args=(func,), daemon=True)
        t.start()

    def _with_ui_lock(self, func):
        self._disable()
        try:
            func()
        finally:
            self._enable()

    def _render_many(self, scene_names: list[str]):
        out_dir = Path(self.output_dir.get())
        out_dir.mkdir(parents=True, exist_ok=True)

        preset = QUALITY_PRESETS[self.quality_var.get()]
        self._append_log(f"Quality: {self.quality_var.get()}  →  {preset['pixel_width']}x{preset['pixel_height']} @ {preset['frame_rate']}fps")

        for name in scene_names:
            try:
                SceneClass, filename = SCENES[name]
                outfile = out_dir / filename
                self._append_log(f"Rendering: {name} → {outfile}")

                with tempconfig({
                    "write_to_movie": True,
                    "format": "mp4",
                    "pixel_width": preset["pixel_width"],
                    "pixel_height": preset["pixel_height"],
                    "frame_rate": preset["frame_rate"],
                    "output_file": str(outfile),
                    "media_dir": str(out_dir),
                    # Disable interactive preview window
                    "preview": False,
                }):
                    scene = SceneClass()
                    scene.render()

                self._append_log(f"✔ Done: {outfile}")
                self.status.set(f"Done: {outfile.name}")
            except Exception as exc:
                self._append_log("✖ Error while rendering: " + name)
                self._append_log(str(exc))
                self._append_log(traceback.format_exc())
                self.status.set("Error")

    # FFmpeg handling
    def _ffmpeg_in_path(self) -> Optional[str]:
        """Return ffmpeg.exe path if discoverable, else None."""
        # 1) Check pydub's configured converter
        if AudioSegment is not None:
            ff = getattr(AudioSegment, "converter", None)
            if ff and Path(ff).exists():
                return str(Path(ff))
        # 2) Check environment override
        env_ff = os.environ.get("FFMPEG_BINARY")
        if env_ff and Path(env_ff).exists():
            return env_ff
        # 3) Check PATH
        found = shutil.which("ffmpeg")
        if found:
            return found
        return None

    def _ensure_ffmpeg(self):
        path = self._ffmpeg_in_path()
        if path:
            self._append_log(f"FFmpeg found: {path}")
            # Ensure pydub uses it
            if AudioSegment is not None:
                AudioSegment.converter = path
            os.environ["FFMPEG_BINARY"] = path
            return
        self._append_log("FFmpeg not found. Click 'FFmpeg...' to locate ffmpeg.exe or install FFmpeg.")
        self.status.set("FFmpeg missing")

    def _pick_ffmpeg(self):
        file_path = filedialog.askopenfilename(
            title="Select ffmpeg.exe",
            filetypes=[("ffmpeg.exe", "ffmpeg.exe"), ("Executable", "*.exe"), ("All", "*.*")],
        )
        if not file_path:
            return
        p = Path(file_path)
        if not p.exists() or p.name.lower() != "ffmpeg.exe":
            self._append_log("Selected file is not ffmpeg.exe")
            return
        # Set for current process and pydub
        if AudioSegment is not None:
            AudioSegment.converter = str(p)
        os.environ["FFMPEG_BINARY"] = str(p)
        # Prepend its folder to PATH to help child processes if any
        os.environ["PATH"] = str(p.parent) + os.pathsep + os.environ.get("PATH", "")
        self._append_log(f"FFmpeg set: {p}")
        self.status.set("FFmpeg ready")


def main():
    root = Tk()
    app = RenderGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()


