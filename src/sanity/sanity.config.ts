/**
 * Sanity Studio Configuration
 *
 * Local studio for debugging LifeOS data.
 * Run with: npm run studio
 *
 * Note: Uses SANITY_STUDIO_* env vars which Vite exposes to the browser.
 * Add these to .env: SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET
 */

import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './studio-schema.js';

// Vite exposes SANITY_STUDIO_* vars to the browser via import.meta.env
const projectId = import.meta.env.SANITY_STUDIO_PROJECT_ID || '';
const dataset = import.meta.env.SANITY_STUDIO_DATASET || 'production';

export default defineConfig({
  name: 'lifeos-studio',
  title: 'LifeOS Studio',

  projectId,
  dataset,

  plugins: [
    structureTool(),
    visionTool(), // GROQ query playground
  ],

  schema: {
    types: schemaTypes,
  },
});
