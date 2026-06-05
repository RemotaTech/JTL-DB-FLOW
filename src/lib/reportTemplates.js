/**
 * Ready-made report templates — the on-ramp shown on the empty screen.
 *
 * Each template `build()`s an ordered step pipeline against the real bundled
 * JTL schema (schema.json). One click loads a runnable report the merchant can
 * tweak. `requires` lists the tables a template needs so the UI can hide
 * templates that don't fit the active schema version.
 *
 * `color`/`icon`/`tag` drive the template card visuals (see EmptyView).
 */
import { uid } from './steps.js';

export const TEMPLATES = [
  {
    id: 'recent-orders',
    title: 'Neueste Aufträge',
    desc: 'Alle Aufträge mit Kundennummer, neueste zuerst.',
    icon: 'cart', color: '#3b82f6', tag: 'Aufträge',
    requires: ['Verkauf.tAuftrag', 'dbo.tkunde'],
    build: () => [
      { id: uid(), type: 'source', table: 'Verkauf.tAuftrag' },
      { id: uid(), type: 'join', table: 'dbo.tkunde', fromCol: 'Verkauf.tAuftrag.kKunde', toCol: 'dbo.tkunde.kKunde', kind: 'left' },
      { id: uid(), type: 'sort', by: 'Verkauf.tAuftrag.dErstellt', dir: 'desc' },
      { id: uid(), type: 'columns', visible: ['Verkauf.tAuftrag.cAuftragsNr', 'dbo.tkunde.cKundenNr', 'Verkauf.tAuftrag.dErstellt', 'Verkauf.tAuftrag.cWaehrung'] },
    ],
  },
  {
    id: 'cancelled-orders',
    title: 'Stornierte Aufträge',
    desc: 'Aufträge mit Storno-Kennzeichen.',
    icon: 'xCircle', color: '#f43f5e', tag: 'Aufträge',
    requires: ['Verkauf.tAuftrag'],
    build: () => [
      { id: uid(), type: 'source', table: 'Verkauf.tAuftrag' },
      { id: uid(), type: 'filter', conditions: [{ field: 'Verkauf.tAuftrag.nStorno', op: '=', value: '1' }] },
      { id: uid(), type: 'sort', by: 'Verkauf.tAuftrag.dErstellt', dir: 'desc' },
    ],
  },
  {
    id: 'orders-per-customer',
    title: 'Aufträge pro Kunde',
    desc: 'Anzahl Aufträge je Kunde, meiste zuerst.',
    icon: 'users', color: '#10b981', tag: 'Kunden',
    requires: ['Verkauf.tAuftrag', 'dbo.tkunde'],
    build: () => [
      { id: uid(), type: 'source', table: 'Verkauf.tAuftrag' },
      { id: uid(), type: 'join', table: 'dbo.tkunde', fromCol: 'Verkauf.tAuftrag.kKunde', toCol: 'dbo.tkunde.kKunde', kind: 'inner' },
      { id: uid(), type: 'group', by: ['dbo.tkunde.cKundenNr'], metrics: [{ agg: 'Anzahl', field: '', as: 'Anzahl Aufträge' }] },
      { id: uid(), type: 'sort', by: 'Anzahl Aufträge', dir: 'desc' },
    ],
  },
  {
    id: 'products-by-manufacturer',
    title: 'Artikel je Hersteller',
    desc: 'Artikel mit zugehörigem Hersteller.',
    icon: 'package', color: '#a855f7', tag: 'Artikel',
    requires: ['dbo.tArtikel', 'dbo.tHersteller'],
    build: () => [
      { id: uid(), type: 'source', table: 'dbo.tArtikel' },
      { id: uid(), type: 'join', table: 'dbo.tHersteller', fromCol: 'dbo.tArtikel.kHersteller', toCol: 'dbo.tHersteller.kHersteller', kind: 'left' },
      { id: uid(), type: 'sort', by: 'dbo.tHersteller.cName', dir: 'asc' },
      { id: uid(), type: 'columns', visible: ['dbo.tArtikel.cArtNr', 'dbo.tHersteller.cName', 'dbo.tArtikel.fVKNetto'] },
    ],
  },
  {
    id: 'price-above',
    title: 'Artikel über Preis',
    desc: 'Artikel mit VK-Netto über einem Schwellenwert.',
    icon: 'trending', color: '#f59e0b', tag: 'Artikel',
    requires: ['dbo.tArtikel'],
    build: () => [
      { id: uid(), type: 'source', table: 'dbo.tArtikel' },
      { id: uid(), type: 'filter', conditions: [{ field: 'dbo.tArtikel.fVKNetto', op: '>', value: '100' }] },
      { id: uid(), type: 'sort', by: 'dbo.tArtikel.fVKNetto', dir: 'desc' },
      { id: uid(), type: 'columns', visible: ['dbo.tArtikel.cArtNr', 'dbo.tArtikel.fVKNetto'] },
    ],
  },
  {
    id: 'order-positions',
    title: 'Auftragspositionen',
    desc: 'Positionen mit Artikel und Menge je Auftrag.',
    icon: 'listOrdered', color: '#06b6d4', tag: 'Aufträge',
    requires: ['Verkauf.tAuftragPosition', 'Verkauf.tAuftrag', 'dbo.tArtikel'],
    build: () => [
      { id: uid(), type: 'source', table: 'Verkauf.tAuftragPosition' },
      { id: uid(), type: 'join', table: 'Verkauf.tAuftrag', fromCol: 'Verkauf.tAuftragPosition.kAuftrag', toCol: 'Verkauf.tAuftrag.kAuftrag', kind: 'inner' },
      { id: uid(), type: 'join', table: 'dbo.tArtikel', fromCol: 'Verkauf.tAuftragPosition.kArtikel', toCol: 'dbo.tArtikel.kArtikel', kind: 'left' },
      { id: uid(), type: 'columns', visible: ['Verkauf.tAuftrag.cAuftragsNr', 'Verkauf.tAuftragPosition.cArtNr', 'Verkauf.tAuftragPosition.fAnzahl', 'Verkauf.tAuftragPosition.fVkNetto'] },
    ],
  },
];

/** Number of steps a template produces (for the card footer). */
export function templateSteps(t) {
  try { return t.build().length; } catch { return 0; }
}

/** Templates whose required tables all exist in the active schema. */
export function availableTemplates(schema) {
  if (!schema?.tables) return TEMPLATES;
  const have = new Set(schema.tables.map(t => t.name));
  return TEMPLATES.filter(t => t.requires.every(r => have.has(r)));
}
