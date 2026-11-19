// "Main item" groups shown as icon cards on the Inventory page (e.g. Coffee, Tea, Badges).
// Built-in groups below can be renamed / given another icon, and HOD/Admin can add their own;
// those changes are stored in the item_groups table and merged in here.
import type { LucideIcon } from 'lucide-react';
import {
  Apple, Award, Backpack, BookOpen, Box, Briefcase, CakeSlice, Calculator, Camera, Candy, Coffee, Cookie, Croissant, CupSoda, Dice5,
  Droplets, FileBadge, FileText, Flag, Gift, GlassWater, Heart, Highlighter, IceCreamCone, IdCard, Laptop, Leaf, Lightbulb, Medal,
  Megaphone, Mic, Milk, Notebook, Package, Paperclip, PenLine, Pencil, Pizza, Pointer, Popcorn, Presentation, Printer, Puzzle, Ruler,
  Sandwich, Scissors, ScrollText, Shapes, Shirt, ShoppingBag, Soup, Stamp, Star, StickyNote, Tag, ToyBrick, Trophy, Utensils,
  UtensilsCrossed, Wine,
} from 'lucide-react';
import type { Category, Item, ItemGroupRow } from './types';

/** Icons offered in the icon picker, by name (the name is what gets saved). */
export const ICONS: Record<string, LucideIcon> = {
  Coffee, Leaf, Milk, GlassWater, CupSoda, Wine, Droplets, CakeSlice, Cookie, Croissant, Sandwich, Pizza, Soup, Apple, Candy, Popcorn,
  IceCreamCone, Utensils, UtensilsCrossed, Box, Package, ShoppingBag, Gift, Tag, Shirt, Backpack, Briefcase, Award, Medal, Trophy, Star,
  IdCard, Dice5, Puzzle, ToyBrick, Shapes, Presentation, Pointer, Mic, Megaphone, Lightbulb, Flag, BookOpen, Notebook, FileBadge,
  ScrollText, FileText, StickyNote, PenLine, Pencil, Highlighter, Ruler, Scissors, Stamp, Paperclip, Calculator, Printer, Laptop, Camera,
  Heart,
};
export const iconFor = (name: string | null | undefined): LucideIcon => (name && ICONS[name]) || Package;

export interface ItemGroup { id: string; label: string; category: Category; icon: LucideIcon; iconName: string; keywords: string[]; custom: boolean }
type Builtin = Omit<ItemGroup, 'icon' | 'custom'>;

// Order matters inside a category: the first group whose keyword appears in the item name wins
// (e.g. "Cup Cake" is checked against Cakes before Cups & Tableware).
const BUILTIN: Builtin[] = [
  { id: 'coffee', label: 'Coffee', category: 'Refreshments', iconName: 'Coffee', keywords: ['coffee'] },
  { id: 'tea', label: 'Tea', category: 'Refreshments', iconName: 'Leaf', keywords: ['tea'] },
  { id: 'sugar-creamer', label: 'Sugar & Creamer', category: 'Refreshments', iconName: 'Milk', keywords: ['sugar', 'creamer', 'stirrer'] },
  { id: 'drinks', label: 'Water & Drinks', category: 'Refreshments', iconName: 'GlassWater', keywords: ['water', 'juice'] },
  { id: 'cakes', label: 'Cakes', category: 'Refreshments', iconName: 'CakeSlice', keywords: ['cake'] },
  { id: 'snacks', label: 'Biscuits & Snacks', category: 'Refreshments', iconName: 'Cookie', keywords: ['biscuit', 'snack', 'noodle'] },
  { id: 'tableware', label: 'Cups & Tableware', category: 'Refreshments', iconName: 'Utensils', keywords: ['cup', 'plate'] },
  { id: 'tissues', label: 'Tissues & Napkins', category: 'Refreshments', iconName: 'Box', keywords: ['tissue', 'napkin'] },
  { id: 'presenter', label: 'Presenter Tools', category: 'Training Materials', iconName: 'Pointer', keywords: ['pointer'] },
  { id: 'badges', label: 'Badges', category: 'Training Materials', iconName: 'Award', keywords: ['badge'] },
  { id: 'cards', label: 'ID & Name Cards', category: 'Training Materials', iconName: 'IdCard', keywords: ['id card', 'name tent', 'card'] },
  { id: 'games', label: 'Games & Activities', category: 'Training Materials', iconName: 'Dice5', keywords: ['monopoly', 'game', 'ball', 'block'] },
  { id: 'stands', label: 'Stands & Boards', category: 'Training Materials', iconName: 'Presentation', keywords: ['stand'] },
  { id: 'books', label: 'Textbooks', category: 'Training Materials', iconName: 'BookOpen', keywords: ['textbook', 'book'] },
  { id: 'certificates', label: 'Certificates', category: 'Training Materials', iconName: 'FileBadge', keywords: ['certificate'] },
  { id: 'stationery', label: 'Stationery', category: 'Training Materials', iconName: 'PenLine', keywords: ['marker', 'paper', 'sticky', 'tape', 'pen'] },
  { id: 'bags', label: 'Bags & Kits', category: 'Training Materials', iconName: 'Briefcase', keywords: ['bag', 'kit'] },
  { id: 'apparel', label: 'Uniforms & Apparel', category: 'YCP Program', iconName: 'Shirt', keywords: ['uniform', 'shirt'] },
  { id: 'merch', label: 'YCP Merchandise', category: 'YCP Program', iconName: 'Gift', keywords: [] },
  { id: 'paper', label: 'Paper & Files', category: 'Office Supplies', iconName: 'FileText', keywords: ['paper', 'file', 'folder'] },
  { id: 'office-tools', label: 'Office Tools', category: 'Office Supplies', iconName: 'Paperclip', keywords: ['pen', 'stapler', 'clip'] },
];

// Where an item goes when nothing matches its name.
const FALLBACK: Record<Category, Builtin> = {
  Refreshments: { id: 'other-refreshments', label: 'Other Refreshments', category: 'Refreshments', iconName: 'Package', keywords: [] },
  'Training Materials': { id: 'other-training', label: 'Other Materials', category: 'Training Materials', iconName: 'Package', keywords: [] },
  'YCP Program': BUILTIN.find((b) => b.id === 'merch')!,
  'Office Supplies': { id: 'other-office', label: 'Other Office', category: 'Office Supplies', iconName: 'Package', keywords: [] },
};

export const BUILTIN_IDS = new Set([...BUILTIN, ...Object.values(FALLBACK)].map((b) => b.id));

/** All main items for a category ('' = every category): built-ins (with saved name / icon changes) then custom ones. */
export function groupsFor(category: Category | '', saved: ItemGroupRow[] = []): ItemGroup[] {
  const byId = new Map(saved.map((r) => [r.id, r]));
  const fallbacks = Object.values(FALLBACK).filter((f) => !BUILTIN.includes(f));
  const builtins = [...BUILTIN, ...fallbacks].filter((b) => !category || b.category === category).map((b): ItemGroup => {
    const o = byId.get(b.id);
    const iconName = o?.icon || b.iconName;
    return { ...b, label: o?.label || b.label, iconName, icon: iconFor(iconName), custom: false };
  });
  const custom = saved.filter((r) => !BUILTIN_IDS.has(r.id) && (!category || r.category === category))
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((r): ItemGroup => ({ id: r.id, label: r.label, category: r.category, iconName: r.icon, icon: iconFor(r.icon), keywords: [], custom: true }));
  return [...builtins, ...custom];
}

/** Best guess of the main item from the name, within the item's category (built-in groups only). */
export function guessGroup(name: string, category: Category): string {
  const n = name.toLowerCase();
  return BUILTIN.find((g) => g.category === category && g.keywords.some((k) => n.includes(k)))?.id ?? FALLBACK[category].id;
}

export function groupOf(item: Pick<Item, 'name' | 'category' | 'item_group'>, saved: ItemGroupRow[] = []): ItemGroup {
  const list = groupsFor(item.category, saved);
  const chosen = item.item_group ? list.find((g) => g.id === item.item_group) : undefined;
  return chosen ?? list.find((g) => g.id === guessGroup(item.name, item.category))!;
}
