// "Main item" groups shown as icon cards on the Inventory page (e.g. Coffee, Tea, Badges).
import type { LucideIcon } from 'lucide-react';
import {
  Award, BookOpen, Briefcase, CakeSlice, Coffee, Cookie, Dice5, FileBadge, FileText, Gift, GlassWater, IdCard, Leaf, Milk,
  Package, Paperclip, PenLine, Pointer, Presentation, Shirt, Utensils, Box,
} from 'lucide-react';
import type { Category, Item } from './types';

export interface ItemGroup { id: string; label: string; category: Category; icon: LucideIcon; keywords: string[] }

// Order matters inside a category: the first group whose keyword appears in the item name wins
// (e.g. "Cup Cake" is checked against Cakes before Cups & Tableware).
export const ITEM_GROUPS: ItemGroup[] = [
  { id: 'coffee', label: 'Coffee', category: 'Refreshments', icon: Coffee, keywords: ['coffee'] },
  { id: 'tea', label: 'Tea', category: 'Refreshments', icon: Leaf, keywords: ['tea'] },
  { id: 'sugar-creamer', label: 'Sugar & Creamer', category: 'Refreshments', icon: Milk, keywords: ['sugar', 'creamer', 'stirrer'] },
  { id: 'drinks', label: 'Water & Drinks', category: 'Refreshments', icon: GlassWater, keywords: ['water', 'juice'] },
  { id: 'cakes', label: 'Cakes', category: 'Refreshments', icon: CakeSlice, keywords: ['cake'] },
  { id: 'snacks', label: 'Biscuits & Snacks', category: 'Refreshments', icon: Cookie, keywords: ['biscuit', 'snack', 'noodle'] },
  { id: 'tableware', label: 'Cups & Tableware', category: 'Refreshments', icon: Utensils, keywords: ['cup', 'plate'] },
  { id: 'tissues', label: 'Tissues & Napkins', category: 'Refreshments', icon: Box, keywords: ['tissue', 'napkin'] },
  { id: 'presenter', label: 'Presenter Tools', category: 'Training Materials', icon: Pointer, keywords: ['pointer'] },
  { id: 'badges', label: 'Badges', category: 'Training Materials', icon: Award, keywords: ['badge'] },
  { id: 'cards', label: 'ID & Name Cards', category: 'Training Materials', icon: IdCard, keywords: ['id card', 'name tent', 'card'] },
  { id: 'games', label: 'Games & Activities', category: 'Training Materials', icon: Dice5, keywords: ['monopoly', 'game', 'ball', 'block'] },
  { id: 'stands', label: 'Stands & Boards', category: 'Training Materials', icon: Presentation, keywords: ['stand'] },
  { id: 'books', label: 'Textbooks', category: 'Training Materials', icon: BookOpen, keywords: ['textbook', 'book'] },
  { id: 'certificates', label: 'Certificates', category: 'Training Materials', icon: FileBadge, keywords: ['certificate'] },
  { id: 'stationery', label: 'Stationery', category: 'Training Materials', icon: PenLine, keywords: ['marker', 'paper', 'sticky', 'tape', 'pen'] },
  { id: 'bags', label: 'Bags & Kits', category: 'Training Materials', icon: Briefcase, keywords: ['bag', 'kit'] },
  { id: 'apparel', label: 'Uniforms & Apparel', category: 'YCP Program', icon: Shirt, keywords: ['uniform', 'shirt'] },
  { id: 'merch', label: 'YCP Merchandise', category: 'YCP Program', icon: Gift, keywords: [] },
  { id: 'paper', label: 'Paper & Files', category: 'Office Supplies', icon: FileText, keywords: ['paper', 'file', 'folder'] },
  { id: 'office-tools', label: 'Office Tools', category: 'Office Supplies', icon: Paperclip, keywords: ['pen', 'stapler', 'clip'] },
];

const OTHER: Record<Category, ItemGroup> = {
  Refreshments: { id: 'other-refreshments', label: 'Other Refreshments', category: 'Refreshments', icon: Package, keywords: [] },
  'Training Materials': { id: 'other-training', label: 'Other Materials', category: 'Training Materials', icon: Package, keywords: [] },
  'YCP Program': { id: 'merch', label: 'YCP Merchandise', category: 'YCP Program', icon: Gift, keywords: [] },
  'Office Supplies': { id: 'other-office', label: 'Other Office', category: 'Office Supplies', icon: Package, keywords: [] },
};

export function groupsFor(category: Category | ''): ItemGroup[] {
  const list = ITEM_GROUPS.filter((g) => !category || g.category === category);
  const others = Object.values(OTHER).filter((o) => (!category || o.category === category) && !list.some((g) => g.id === o.id));
  return [...list, ...others];
}

/** Best guess of the main item from the name, within the item's category. */
export function guessGroup(name: string, category: Category): string {
  const n = name.toLowerCase();
  return ITEM_GROUPS.find((g) => g.category === category && g.keywords.some((k) => n.includes(k)))?.id ?? OTHER[category].id;
}

export function groupOf(item: Pick<Item, 'name' | 'category' | 'item_group'>): ItemGroup {
  const id = item.item_group && groupsFor(item.category).some((g) => g.id === item.item_group) ? item.item_group : guessGroup(item.name, item.category);
  return groupsFor(item.category).find((g) => g.id === id) ?? OTHER[item.category];
}
