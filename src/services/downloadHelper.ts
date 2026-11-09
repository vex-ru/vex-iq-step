/**
 * Utility for downloading STL/3MF files, binary synthesis, and ZIP generation
 */

import type { VexPartItem } from '../data/vexCatalog';
import { getCachedModel } from './modelCache';
import { createVexProceduralMesh, exportGroupToBinarySTL } from '../three/proceduralVexParts';
import JSZip from 'jszip';

/**
 * Downloads a single part as a binary STL file
 */
export async function downloadPartSTL(part: VexPartItem) {
  let buffer = await getCachedModel(part.filename);

  if (!buffer) {
    // Synthesize binary STL from procedural CAD model
    const group = createVexProceduralMesh(part);
    buffer = exportGroupToBinarySTL(group, part.name);
  }

  const blob = new Blob([buffer], { type: 'model/stl' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = part.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Creates and downloads a ZIP bundle of automation scripts for GitHub Pages, Cloudflare R2 and Git LFS
 */
export async function downloadAutomationBundle() {
  const zip = new JSZip();

  // 1. .gitattributes
  zip.file(
    '.gitattributes',
    `# Git LFS configuration for VEX IQ 3D CAD models
*.stl filter=lfs diff=lfs merge=lfs -text
*.3mf filter=lfs diff=lfs merge=lfs -text
*.step filter=lfs diff=lfs merge=lfs -text
*.stp filter=lfs diff=lfs merge=lfs -text
`
  );

  // 2. deploy.yml
  zip.file(
    '.github/workflows/deploy.yml',
    `name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install --legacy-peer-deps
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/deploy-pages@v4
`
  );

  // 3. sync_to_r2.py
  zip.file(
    'scripts/sync_to_r2.py',
    `#!/usr/bin/env python3
import os
import boto3
from botocore.config import Config

R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "your_id")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "your_key")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY", "your_secret")
BUCKET_NAME = os.environ.get("R2_BUCKET", "vex-iq-models")

s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    config=Config(signature_version="s3v4"),
)

for root, dirs, files in os.walk("stl"):
    for file in files:
        if file.endswith((".stl", ".3mf")):
            local_path = os.path.join(root, file)
            rel_path = os.path.relpath(local_path, ".").replace("\\\\", "/")
            print(f"Uploading {rel_path}...")
            s3.upload_file(local_path, BUCKET_NAME, rel_path)
print("Finished syncing with Cloudflare R2!")
`
  );

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vex-iq-github-and-cloud-config.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
