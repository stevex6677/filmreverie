"""Call the locally installed Blender MCP server over its stdio transport."""
import argparse
import json
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tool", nargs="?")
    parser.add_argument("--arguments", help="JSON arguments file")
    parser.add_argument("--script", help="Blender script to launch through MCP")
    parser.add_argument("--output", help="Shared generated run directory")
    parser.add_argument("--blend", help="Optional existing Blender master")
    parser.add_argument("--prompt", help="Task-specific Blender MCP instruction")
    args = parser.parse_args()
    process = subprocess.Popen(["blender-mcp"], stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, text=True)
    def send(message):
        process.stdin.write(json.dumps(message) + "\n")
        process.stdin.flush()
    def request(number, method, params):
        send({"jsonrpc": "2.0", "id": number, "method": method, "params": params})
        for line in process.stdout:
            response = json.loads(line)
            if response.get("id") == number:
                if "error" in response:
                    raise RuntimeError(response["error"])
                return response["result"]
        raise RuntimeError("Blender MCP exited before answering")
    try:
        request(1, "initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                                  "clientInfo": {"name": "autocord-refinement", "version": "1"}})
        send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        if args.tool:
            if args.script:
                from pathlib import Path
                script = str(Path(args.script).resolve())
                output = str(Path(args.output).resolve())
                command = ["--background", "--threads", "8", "--python-exit-code", "1"]
                if args.blend:
                    command.append(str(Path(args.blend).resolve()))
                command.extend(["--python", script])
                code = (
                    "import bpy, subprocess, os\n"
                    "from pathlib import Path\n"
                    f"out=Path({output!r}); out.mkdir(parents=True, exist_ok=True)\n"
                    "env=os.environ.copy(); env['FILM_PHOTO_OUTPUT_DIR']=str(out)\n"
                    f"log=open(out/{(Path(script).stem + '.log')!r},'w')\n"
                    f"p=subprocess.Popen([bpy.app.binary_path]+{command!r}, stdout=log, stderr=subprocess.STDOUT, env=env)\n"
                    "print({'pid':p.pid,'output':str(out)})"
                )
                arguments = {"code": code, "user_prompt": args.prompt or "Refine only the requested Autocord areas from supplied photos: strap and inscriptions, uniform winding-side enamel panel, and missing underside details. Preserve the rest of the model. Render evidence and export for the existing standalone/model-viewer. Keep code under blender and durable outputs under shared ignored_generated."}
            else:
                with open(args.arguments) as stream:
                    arguments = json.load(stream)
            result = request(2, "tools/call", {"name": args.tool, "arguments": arguments})
        else:
            result = request(2, "tools/list", {})
        print(json.dumps(result, indent=2))
        if result.get("isError"):
            sys.exit(1)
    finally:
        process.terminate()
        process.wait(timeout=10)


if __name__ == "__main__":
    main()
