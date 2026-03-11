#!/usr/bin/env node

/**
 * SEO Build-Check Script
 * Validates SEO requirements in the built HTML files (dist/).
 * Run after `npm run build` to catch SEO regressions.
 *
 * Usage: node scripts/seo-check.mjs
 */

import { readdir, readFile } from 'fs/promises';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const errors = [];
const warnings = [];

async function getHtmlFiles(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getHtmlFiles(full));
    } else if (entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

function check(file, condition, message, level = 'error') {
  if (!condition) {
    const rel = relative(DIST, file);
    if (level === 'error') errors.push(`  ERROR  ${rel}: ${message}`);
    else warnings.push(`  WARN   ${rel}: ${message}`);
  }
}

async function auditFile(file) {
  const html = await readFile(file, 'utf-8');
  const rel = relative(DIST, file);

  // Skip 404 page for some checks
  const is404 = rel.includes('404');

  // Title tag
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  check(file, titleMatch, 'Missing <title> tag');
  if (titleMatch) {
    const title = titleMatch[1];
    check(file, title.length >= 20, `Title too short (${title.length} chars): "${title}"`, 'warn');
    check(file, title.length <= 90, `Title too long (${title.length} chars): "${title}"`, 'warn');
  }

  // Meta description
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
  check(file, descMatch, 'Missing meta description');
  if (descMatch) {
    const desc = descMatch[1];
    check(file, desc.length >= 50, `Meta description too short (${desc.length} chars)`, 'warn');
    check(file, desc.length <= 170, `Meta description too long (${desc.length} chars)`, 'warn');
  }

  // H1 tag
  const h1Matches = html.match(/<h1[\s>]/g);
  check(file, h1Matches, 'Missing H1 tag');
  if (h1Matches) {
    check(file, h1Matches.length === 1, `Multiple H1 tags found (${h1Matches.length})`);
  }

  // Canonical or OG URL
  const hasCanonical = html.includes('rel="canonical"');
  const hasOgUrl = html.includes('property="og:url"');
  check(file, hasCanonical || hasOgUrl, 'Missing canonical URL or og:url', 'warn');

  // OG tags
  check(file, html.includes('property="og:title"'), 'Missing og:title', 'warn');
  check(file, html.includes('property="og:description"'), 'Missing og:description', 'warn');

  // Images without alt text
  const imgMatches = html.matchAll(/<img\s[^>]*>/g);
  for (const m of imgMatches) {
    const tag = m[0];
    const hasAlt = /alt="[^"]*"/.test(tag) || /alt='[^']*'/.test(tag);
    check(file, hasAlt, `Image missing alt text: ${tag.substring(0, 80)}...`);
  }

  // Schema.org JSON-LD
  if (!is404) {
    check(file, html.includes('application/ld+json'), 'Missing Schema.org JSON-LD', 'warn');
  }

  // Lang attribute
  check(file, html.includes('lang="en"'), 'Missing lang="en" on <html>');

  // Viewport meta
  check(file, html.includes('viewport'), 'Missing viewport meta tag');
}

async function main() {
  console.log('\n  SEO Build Check\n  ================\n');

  let htmlFiles;
  try {
    htmlFiles = await getHtmlFiles(DIST);
  } catch {
    console.log('  ERROR: dist/ directory not found. Run `npm run build` first.\n');
    process.exit(1);
  }

  console.log(`  Checking ${htmlFiles.length} HTML files...\n`);

  for (const file of htmlFiles) {
    await auditFile(file);
  }

  // Check for llms.txt
  try {
    await readFile(join(DIST, 'llms.txt'), 'utf-8');
    console.log('  OK     llms.txt found');
  } catch {
    warnings.push('  WARN   llms.txt not found in dist/');
  }

  // Check for robots.txt
  try {
    const robots = await readFile(join(DIST, 'robots.txt'), 'utf-8');
    check(join(DIST, 'robots.txt'), robots.includes('Sitemap:'), 'robots.txt missing Sitemap reference', 'warn');
    console.log('  OK     robots.txt found');
  } catch {
    errors.push('  ERROR  robots.txt not found in dist/');
  }

  // Check for sitemap
  try {
    await readFile(join(DIST, 'sitemap-index.xml'), 'utf-8');
    console.log('  OK     sitemap-index.xml found');
  } catch {
    errors.push('  ERROR  sitemap-index.xml not found in dist/');
  }

  // Report
  console.log('');
  if (warnings.length > 0) {
    console.log('  Warnings:');
    warnings.forEach(w => console.log(w));
    console.log('');
  }

  if (errors.length > 0) {
    console.log('  Errors:');
    errors.forEach(e => console.log(e));
    console.log(`\n  FAILED: ${errors.length} error(s), ${warnings.length} warning(s)\n`);
    process.exit(1);
  } else {
    console.log(`  PASSED: 0 errors, ${warnings.length} warning(s)\n`);
  }
}

main();
