/**
 * Seed the hub with curated "featured" report templates.
 *
 * Idempotent: each template upserts on a stable id (`tpl-<id>`), so re-running
 * refreshes their content/visuals without resetting their download/execution
 * counters and without creating duplicates.
 *
 * Source of truth is the frontend report templates (so the curated set always
 * matches what ships in the app).
 */
import { TEMPLATES } from '../src/lib/reportTemplates.js';

export async function seedFeatured(prisma) {
  let n = 0;
  for (const t of TEMPLATES) {
    const id = `tpl-${t.id}`;
    const steps = t.build();
    const visuals = {
      title: t.title,
      description: t.desc || '',
      tags: (t.tag || '').toLowerCase(),
      icon: t.icon || 'sparkles',
      color: t.color || '#3b82f6',
      flowData: { steps, vars: [] },
      stepCount: steps.length,
      featured: true,
      author: 'JTL DBFLOW',
    };
    await prisma.flow.upsert({
      where: { id },
      // Refresh visuals/pipeline but keep counters intact
      update: {
        title: visuals.title,
        description: visuals.description,
        tags: visuals.tags,
        icon: visuals.icon,
        color: visuals.color,
        flowData: visuals.flowData,
        stepCount: visuals.stepCount,
        featured: true,
      },
      create: { id, ...visuals },
    });
    n++;
  }
  return n;
}
