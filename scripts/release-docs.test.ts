import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = process.cwd();
const version = String(JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version);

const REQUIRED_DOCS = [
  'README.md',
  'CHANGELOG.md',
  'AGENTS.md',
  '.agents/README.md',
  'docs/README.md',
  'docs/AGENTS.md',
  'docs/architecture.md',
  'docs/release-process.md',
  'docs/privacy.md',
  'store/README.md',
];

const SKILLS_DIR = resolve(ROOT, '.agents/skills');
const skillFiles = existsSync(SKILLS_DIR)
  ? readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `.agents/skills/${entry.name}/SKILL.md`)
  : [];

function pngInfo(file: string) {
  const buffer = readFileSync(resolve(ROOT, file));
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25],
  };
}

function stripCodeFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '');
}

function relativeLinks(text: string): string[] {
  const links: string[] = [];
  for (const match of stripCodeFences(text).matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = match[1];
    if (!href) continue;
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    links.push(href.split('#')[0] ?? '');
  }
  return links.filter(Boolean);
}

describe('release docs, store assets, and agent context', () => {
  it('keeps the store kit to one document', () => {
    const storeDocs = readdirSync(resolve(ROOT, 'store')).filter((name) => name.endsWith('.md'));
    expect(storeDocs).toEqual(['README.md']);
  });

  it('has every required document', () => {
    const missing = REQUIRED_DOCS.filter((file) => !existsSync(resolve(ROOT, file)));
    expect(missing).toEqual([]);
  });

  it('has valid agent skill frontmatter', () => {
    const errors: string[] = [];
    for (const file of skillFiles) {
      const text = readFileSync(resolve(ROOT, file), 'utf8');
      const frontmatter = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
      if (!frontmatter) {
        errors.push(`${file}: missing YAML frontmatter`);
        continue;
      }
      const [, yaml = '', body = ''] = frontmatter;
      const expectedName = file.split('/')[2];
      const name = /^name:\s*([a-z0-9-]+)\s*$/m.exec(yaml)?.[1];
      if (name !== expectedName) errors.push(`${file}: name must be "${expectedName}"`);
      if (!/^description:\s*\S.+$/m.test(yaml)) errors.push(`${file}: description is missing`);
      if (!body.trim()) errors.push(`${file}: body is empty`);
    }
    expect(errors).toEqual([]);
  });

  it('routes every existing agent skill', () => {
    const agents = readFileSync(resolve(ROOT, 'AGENTS.md'), 'utf8');
    const section = agents.split('## Agent skills')[1]?.split(/\n## /)[0] ?? '';
    const routed = new Set(
      [...section.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gm)]
        .map((match) => match[1])
        .filter((name): name is string => Boolean(name)),
    );
    const skills = skillFiles
      .map((file) => file.split('/')[2])
      .filter((name): name is string => Boolean(name));
    const missing = [...routed].filter(
      (name) => !existsSync(resolve(ROOT, `.agents/skills/${name}/SKILL.md`)),
    );
    const unrouted = skills.filter((name) => !routed.has(name));
    expect({ missing, unrouted }).toEqual({ missing: [], unrouted: [] });
  });

  it('marks the docs with the package version', () => {
    const marker = `<!-- release: ${version} -->`;
    const stale = ['docs/architecture.md', 'docs/release-process.md', 'store/README.md'].filter(
      (file) => !readFileSync(resolve(ROOT, file), 'utf8').includes(marker),
    );
    expect(stale).toEqual([]);
  });

  it('has a changelog entry for the package version', () => {
    const changelog = readFileSync(resolve(ROOT, 'CHANGELOG.md'), 'utf8');
    const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(changelog).toMatch(new RegExp(`^##\\s+\\[?v?${escaped}\\]?`, 'm'));
  });

  it('has three opaque 1280x800 store screenshots', () => {
    const errors: string[] = [];
    for (const name of ['messages', 'payload', 'popup']) {
      const file = `store/assets/screenshot-${['messages', 'payload', 'popup'].indexOf(name) + 1}-${name}.png`;
      const info = pngInfo(file);
      if (!info) errors.push(`${file}: missing or not a PNG`);
      else if (info.width !== 1280 || info.height !== 800) {
        errors.push(`${file}: ${info.width}x${info.height}, expected 1280x800`);
      } else if (info.colorType !== 2) {
        errors.push(`${file}: has an alpha channel (color type ${info.colorType})`);
      }
    }
    expect(errors).toEqual([]);
  });

  it('has exact-size promo, marquee and icon assets', () => {
    const expected: Array<[string, number, number]> = [
      ['store/assets/small-promo-440x280.png', 440, 280],
      ['store/assets/marquee-1400x560.png', 1400, 560],
      ['store/assets/store-icon-128.png', 128, 128],
    ];
    const errors: string[] = [];
    for (const [file, width, height] of expected) {
      const info = pngInfo(file);
      if (!info) errors.push(`${file}: missing or not a PNG`);
      else if (info.width !== width || info.height !== height) {
        errors.push(`${file}: ${info.width}x${info.height}, expected ${width}x${height}`);
      }
    }
    expect(errors).toEqual([]);
  });

  it('keeps relative links resolvable', () => {
    const files = [
      'README.md',
      'docs/README.md',
      'docs/architecture.md',
      'docs/release-process.md',
      'store/README.md',
    ];
    const broken: string[] = [];
    for (const file of files) {
      const text = readFileSync(resolve(ROOT, file), 'utf8');
      for (const link of relativeLinks(text)) {
        const target = resolve(ROOT, dirname(file), link);
        if (!existsSync(target)) broken.push(`${file} → ${link}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
