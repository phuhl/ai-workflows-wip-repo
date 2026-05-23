import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

interface BootstrapOptions {
  sharedDir: string;
  localDir: string;
  outDir: string;
}

function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function bootstrapSkills(options: BootstrapOptions): string {
  const { sharedDir, localDir, outDir } = options;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-skills-"));

  try {
    // 1. Copy shared skills
    if (fs.existsSync(sharedDir)) {
      copyDir(sharedDir, tmpDir);
    }

    // 2. Overlay local skills
    if (fs.existsSync(localDir)) {
      for (const entry of fs.readdirSync(localDir)) {
        const skillPath = path.join(localDir, entry);
        if (!fs.statSync(skillPath).isDirectory()) continue;
        const destDir = path.join(tmpDir, entry);
        fs.mkdirSync(destDir, { recursive: true });
        copyDir(skillPath, destDir);
      }
    }

    // 3. Move merged result to output dir
    fs.mkdirSync(outDir, { recursive: true });
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    copyDir(tmpDir, outDir);

    // 4. Bootstrap plugins
    const sharedPluginsDir = path.join(
      sharedDir.replace(/\/?skills\/?$/, ""),
      "plugins",
    );
    const localPluginsDir = path.join(
      localDir.replace(/\/?skills\/?$/, ""),
      "plugins",
    );
    const outPluginsDir = path.join(
      outDir.replace(/\/?skills\/?$/, ""),
      "plugins",
    );

    if (fs.existsSync(sharedPluginsDir) || fs.existsSync(localPluginsDir)) {
      const staging = path.join(tmpDir, "plugins-stage");
      fs.mkdirSync(staging, { recursive: true });

      if (fs.existsSync(sharedPluginsDir)) {
        copyDir(sharedPluginsDir, staging);
      }

      if (fs.existsSync(localPluginsDir)) {
        copyDir(localPluginsDir, staging);
      }

      fs.mkdirSync(outPluginsDir, { recursive: true });
      fs.rmSync(outPluginsDir, { recursive: true, force: true });
      fs.mkdirSync(outPluginsDir, { recursive: true });
      copyDir(staging, outPluginsDir);
    }

    const msg = `Skills bootstrapped to ${outDir}`;
    console.log(msg);

    // 5. Protect bootstrapped dirs from accidental commits
    fs.writeFileSync(path.join(outDir, ".gitignore"), "*\n");
    if (outPluginsDir && fs.existsSync(outPluginsDir)) {
      fs.writeFileSync(path.join(outPluginsDir, ".gitignore"), "*\n");
    }

    // 6. Ensure /tmp/** is allowed in opencode permissions
    const opencodeJsonPath = "opencode.json";
    if (fs.existsSync(opencodeJsonPath)) {
      const config = JSON.parse(fs.readFileSync(opencodeJsonPath, "utf-8"));
      config.permission = config.permission || {};
      config.permission.external_directory =
        config.permission.external_directory || {};
      config.permission.external_directory["/tmp/**"] = "allow";
      fs.writeFileSync(
        opencodeJsonPath,
        JSON.stringify(config, null, 2) + "\n",
      );
    } else {
      const config = {
        permission: { external_directory: { "/tmp/**": "allow" } },
      };
      fs.writeFileSync(
        opencodeJsonPath,
        JSON.stringify(config, null, 2) + "\n",
      );
    }

    return msg;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const options: BootstrapOptions = { sharedDir: "", localDir: "", outDir: "" };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--shared-dir":
        options.sharedDir = args[++i];
        break;
      case "--local-dir":
        options.localDir = args[++i];
        break;
      case "--out-dir":
        options.outDir = args[++i];
        break;
      default:
        console.error(`Unknown option ${args[i]}`);
        process.exit(1);
    }
  }

  if (!options.outDir) {
    console.error("Missing required --out-dir");
    process.exit(1);
  }

  bootstrapSkills(options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
