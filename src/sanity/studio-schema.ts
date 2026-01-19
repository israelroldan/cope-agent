/**
 * LifeOS Studio Schema
 *
 * GENERATED FROM: src/sanity/schema.ts
 *
 * This file converts SCHEMA_DEFINITIONS to Sanity Studio format.
 * The source of truth is src/sanity/schema.ts - edit there, not here.
 */

import { defineType, defineField } from 'sanity';
import { SCHEMA_DEFINITIONS } from './schema.js';

/**
 * Convert our schema field definitions to Sanity Studio fields
 */
function convertField(field: {
  name: string;
  type: string;
  required?: boolean;
  description: string;
  options?: string[];
  of?: string;
  to?: string;
}) {
  const baseField: Record<string, unknown> = {
    name: field.name,
    title: field.name.charAt(0).toUpperCase() + field.name.slice(1).replace(/([A-Z])/g, ' $1'),
    description: field.description,
  };

  // Map our types to Sanity types
  switch (field.type) {
    case 'string':
      baseField.type = 'string';
      if (field.options) {
        baseField.options = {
          list: field.options.map(opt => ({ title: opt, value: opt })),
          layout: field.options.length <= 4 ? 'radio' : 'dropdown',
        };
      }
      break;
    case 'text':
      baseField.type = 'text';
      baseField.rows = 4;
      break;
    case 'number':
      baseField.type = 'number';
      break;
    case 'boolean':
      baseField.type = 'boolean';
      break;
    case 'date':
      baseField.type = 'date';
      break;
    case 'datetime':
      baseField.type = 'datetime';
      break;
    case 'array':
      baseField.type = 'array';
      baseField.of = [{ type: field.of || 'string' }];
      if (field.of === 'string') {
        baseField.options = { layout: 'tags' };
      }
      break;
    case 'reference':
      baseField.type = 'reference';
      baseField.to = [{ type: field.to }];
      break;
    default:
      baseField.type = 'string';
  }

  // Add validation for required fields
  if (field.required) {
    baseField.validation = (Rule: { required: () => unknown }) => Rule.required();
  }

  return defineField(baseField as Parameters<typeof defineField>[0]);
}

/**
 * Generate Sanity Studio schema types from SCHEMA_DEFINITIONS
 */
export const schemaTypes = SCHEMA_DEFINITIONS.map(typeDef =>
  defineType({
    name: typeDef.name,
    title: typeDef.title,
    type: 'document',
    fields: typeDef.fields.map(convertField),
    preview: {
      select: {
        title: 'title',
        status: 'status',
      },
      prepare({ title, status }: { title?: string; status?: string }) {
        return {
          title: title || 'Untitled',
          subtitle: status,
        };
      },
    },
  })
);
