#!/usr/bin/env python3
"""Launcher for the static jigsaw site.

Actions:
  config  - open config.json with the system default editor
  preview - serve the site on a random free port and open a browser
  deploy  - copy the site into gh-pages (amend) and force-push it
"""

from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"

# Only files the site needs at runtime; dev files stay out of gh-pages.
SITE_ENTRIES = ("index.html", "style.css", "config.json", "js", "images")
SITE_BRANCH = "gh-pages"
DEFAULT_REMOTE = "origin"
PREVIEW_HOST = "127.0.0.1"
SERVER_START_TIMEOUT = 40.0


class LauncherError(RuntimeError):
    pass


def run(cmd, *, cwd=ROOT, check=True, quiet=False):
    """Run a command; quiet captures output so callers can report failures."""
    result = subprocess.run(
        cmd,
        cwd=cwd,
        text=True,
        stdout=subprocess.PIPE if quiet else None,
        stderr=subprocess.PIPE if quiet else None,
    )
    if check and result.returncode != 0:
        detail = ""
        if quiet:
            detail = (result.stderr or result.stdout or "").strip()
        message = f"command failed ({result.returncode}): {' '.join(map(str, cmd))}"
        raise LauncherError(message + (f"\n{detail}" if detail else ""))
    return result


def resolve_command(name):
    """Return an argv prefix for an executable, unwrapping Windows batch shims."""
    path = shutil.which(name)
    if path is None:
        return None
    if os.name == "nt" and Path(path).suffix.lower() in (".cmd", ".bat"):
        return [os.environ.get("COMSPEC", "cmd.exe"), "/c", path]
    return [path]


def free_port():
    # The port is released before the server binds it. The race is harmless
    # for a single-user launcher and avoids fixed-port collisions.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((PREVIEW_HOST, 0))
        return sock.getsockname()[1]


def port_ready(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex((PREVIEW_HOST, port)) == 0


def wait_for_port(port, proc, timeout):
    """Wait for a server to listen; give up early if the process dies."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if port_ready(port):
            return True
        if proc.poll() is not None:
            return False
        time.sleep(0.1)
    return False


def terminate(proc):
    if proc.poll() is not None:
        return
    if os.name == "nt":
        # npx spawns a child node process; taskkill /T stops the whole tree.
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


def open_config():
    """Open config.json with whatever the OS considers the default handler."""
    if not CONFIG_PATH.is_file():
        raise LauncherError(f"config not found: {CONFIG_PATH}")
    if os.name == "nt":
        os.startfile(CONFIG_PATH)  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", "-t", str(CONFIG_PATH)])
    else:
        opener = shutil.which("xdg-open")
        if opener is None:
            raise LauncherError("xdg-open not found; open config.json manually")
        subprocess.Popen([opener, str(CONFIG_PATH)])
    print(f"Opened {CONFIG_PATH}")


def preview(open_browser=True):
    """Start live-server (if npx exists) or python http.server; block until stopped."""
    proc = None
    port = None
    label = ""

    npx = resolve_command("npx")
    if npx is not None:
        port = free_port()
        print("Starting live-server (first run may download it)...")
        proc = subprocess.Popen(
            [
                *npx,
                "--yes",
                "live-server",
                f"--port={port}",
                f"--host={PREVIEW_HOST}",
                "--no-browser",
            ],
            cwd=ROOT,
        )
        if wait_for_port(port, proc, SERVER_START_TIMEOUT):
            label = "live-server"
        else:
            print("live-server did not start; falling back to python -m http.server")
            terminate(proc)
            proc = None
            port = None
    else:
        print("npx not found; using python -m http.server")

    if proc is None:
        port = free_port()
        proc = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "http.server",
                str(port),
                "--bind",
                PREVIEW_HOST,
                "--directory",
                str(ROOT),
            ],
            cwd=ROOT,
        )
        if not wait_for_port(port, proc, SERVER_START_TIMEOUT):
            terminate(proc)
            raise LauncherError("python http.server did not start")
        label = "python http.server"

    url = f"http://{PREVIEW_HOST}:{port}/"
    print(f"{label} serving {ROOT}")
    print(f"  {url}")
    print("Press Ctrl+C to stop.")
    if open_browser:
        webbrowser.open(url)
    try:
        proc.wait()
        print(f"server exited with code {proc.returncode}")
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        terminate(proc)


def git(*args, cwd=ROOT, check=True, quiet=True):
    return run(["git", *args], cwd=cwd, check=check, quiet=quiet)


def git_repo_root():
    return Path(git("rev-parse", "--show-toplevel").stdout.strip()).resolve()


def pick_remote(root):
    remotes = git("remote", cwd=root).stdout.split()
    if DEFAULT_REMOTE in remotes:
        return DEFAULT_REMOTE
    if len(remotes) == 1:
        return remotes[0]
    if not remotes:
        raise LauncherError("no git remote configured; add one with: git remote add origin <url>")
    raise LauncherError(
        f"multiple remotes ({', '.join(remotes)}); configure '{DEFAULT_REMOTE}' or remove the others"
    )


def remote_has_branch(root, remote, branch):
    """True/False when the remote answers; raise when it cannot be queried.

    git ls-remote --exit-code returns 2 for "no matching ref" and other
    non-zero codes for real failures. Treating failures as "branch missing"
    would create an orphan branch and force-push away the remote history.
    """
    result = git(
        "ls-remote", "--exit-code", "--heads", remote, branch, cwd=root, check=False
    )
    if result.returncode == 0:
        return True
    if result.returncode == 2:
        return False
    detail = (result.stderr or result.stdout or "").strip()
    raise LauncherError(f"git ls-remote {remote} failed:\n{detail}")


def reset_worktree(worktree):
    """Remove tracked and untracked files, keeping the worktree's .git file."""
    for entry in worktree.iterdir():
        if entry.name == ".git":
            continue
        if entry.is_dir() and not entry.is_symlink():
            shutil.rmtree(entry)
        else:
            entry.unlink()


def copy_site_files(worktree):
    for name in SITE_ENTRIES:
        source = ROOT / name
        if not source.exists():
            raise LauncherError(f"missing site file: {source}")
        target = worktree / name
        if source.is_dir():
            shutil.copytree(source, target)
        else:
            shutil.copy2(source, target)


def deploy():
    """Rewrite gh-pages from the working tree, amend its tip, and force-push."""
    root = git_repo_root()
    remote = pick_remote(root)
    local_ref = f"refs/heads/{SITE_BRANCH}"
    local_exists = (
        git("show-ref", "--verify", "--quiet", local_ref, cwd=root, check=False).returncode
        == 0
    )
    remote_exists = remote_has_branch(root, remote, SITE_BRANCH)

    worktree = Path(tempfile.mkdtemp(prefix="jigsaw-gh-pages-"))
    try:
        if local_exists:
            git("worktree", "add", str(worktree), SITE_BRANCH, cwd=root)
        elif remote_exists:
            # Start from the deployed history so --amend rewrites that commit.
            git(
                "fetch",
                "--force",
                remote,
                f"+refs/heads/{SITE_BRANCH}:refs/remotes/{remote}/{SITE_BRANCH}",
                cwd=root,
            )
            git(
                "worktree",
                "add",
                "-b",
                SITE_BRANCH,
                str(worktree),
                f"refs/remotes/{remote}/{SITE_BRANCH}",
                cwd=root,
            )
        else:
            # No history yet: build an orphan gh-pages worktree.
            git("worktree", "add", "--detach", str(worktree), cwd=root)
            git("checkout", "--orphan", SITE_BRANCH, cwd=worktree)

        reset_worktree(worktree)
        copy_site_files(worktree)
        git("add", "-A", cwd=worktree)

        has_head = (
            git("rev-parse", "--verify", "--quiet", "HEAD", cwd=worktree, check=False).returncode
            == 0
        )
        if has_head:
            # Site files may be unchanged since the last deploy; amending
            # then yields an empty commit, which git refuses by default.
            git("commit", "--amend", "--no-edit", "--allow-empty", cwd=worktree)
            verb = "amended"
        else:
            git("commit", "-m", "Deploy site", cwd=worktree)
            verb = "created"

        commit = git("rev-parse", "--short", "HEAD", cwd=worktree).stdout.strip()
        print(f"Pushing {SITE_BRANCH} to {remote} (force)...")
        git(
            "push",
            "-f",
            remote,
            f"{SITE_BRANCH}:{SITE_BRANCH}",
            cwd=root,
            quiet=False,
        )
        print(f"{verb} {SITE_BRANCH} at {commit} and force-pushed to {remote}")
    except LauncherError as exc:
        if "already checked out" in str(exc):
            raise LauncherError(
                f"{exc}\nHint: switch the main worktree away from '{SITE_BRANCH}' before deploying."
            ) from exc
        raise
    finally:
        removed = git("worktree", "remove", "--force", str(worktree), cwd=root, check=False)
        if removed.returncode != 0:
            shutil.rmtree(worktree, ignore_errors=True)
            git("worktree", "prune", cwd=root, check=False)


ACTIONS = {
    "config": open_config,
    "preview": preview,
    "deploy": deploy,
}

MENU_ACTIONS = {
    "1": open_config,
    "2": preview,
    "3": deploy,
}


def interactive_menu():
    print("Jigsaw launcher")
    while True:
        print("\n  1) config   open config.json with the default editor")
        print("  2) preview  serve locally and open a browser")
        print("  3) deploy   amend gh-pages from the working tree and force-push")
        print("  q) quit")
        choice = input("Choose: ").strip().lower()
        if choice in ("q", "quit", "exit", ""):
            return 0
        action = MENU_ACTIONS.get(choice)
        if action is None:
            print("Unknown choice.")
            continue
        try:
            action()
        except LauncherError as exc:
            print(f"error: {exc}")
        input("\nPress Enter to continue...")


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    parser = argparse.ArgumentParser(description="Jigsaw site launcher")
    parser.add_argument(
        "action",
        nargs="?",
        choices=sorted(ACTIONS),
        help="action to run; omit for the interactive menu",
    )
    args = parser.parse_args(argv)
    if args.action is None:
        try:
            return interactive_menu()
        except (KeyboardInterrupt, EOFError):
            return 130
    try:
        ACTIONS[args.action]()
    except LauncherError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())