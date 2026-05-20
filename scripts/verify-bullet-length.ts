const MAX_LENGTH = 200;

export interface BulletResult {
  index: number;
  text: string;
  length: number;
  ok: boolean;
}

export function checkBullets(bullets: string[]): {
  results: BulletResult[];
  allPassed: boolean;
  output: string;
} {
  const lines: string[] = [];
  const results: BulletResult[] = [];
  let failed = false;

  lines.push(`=== Bullet length check (max ${MAX_LENGTH} chars) ===`);

  bullets.forEach((bullet, i) => {
    const bulletNum = i + 1;
    const len = new TextEncoder().encode(bullet).length;
    const ok = len <= MAX_LENGTH;
    results.push({ index: bulletNum, text: bullet, length: len, ok });

    if (ok) {
      lines.push(`OK:   Bullet ${bulletNum} — ${len} chars`);
    } else {
      lines.push(
        `FAIL: Bullet ${bulletNum} is ${len} chars (max ${MAX_LENGTH})`,
      );
      lines.push(`  ${bullet}`);
      failed = true;
    }
  });

  if (failed) {
    lines.push("");
    lines.push(
      `One or more bullets exceed ${MAX_LENGTH} characters. Please shorten them.`,
    );
  } else {
    lines.push(
      `All ${bullets.length} bullets within ${MAX_LENGTH} char limit.`,
    );
  }

  return { results, allPassed: !failed, output: lines.join("\n") };
}

function main(): void {
  const bullets = process.argv.slice(2);
  const { allPassed, output } = checkBullets(bullets);
  console.log(output);
  process.exit(allPassed ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
