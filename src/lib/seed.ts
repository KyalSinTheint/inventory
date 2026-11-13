// Demo data. Item names follow the master data list in the BRD (section 8); unit costs,
// quantities, people and deposits are illustrative sample values to replace with real data.
import type {
  Asset, AssetLog, Batch, Budget, Category, Classification, DataSet, Deposit, DepositStatusLog, Expense, Item,
  MaterialRequest, Profile, Settings, StockTxn,
} from './types';
import { budgetCategory, stockDelta } from './logic';

const day = 86_400_000;
const iso = (d: Date) => d.toISOString();
const ago = (days: number) => new Date(Date.now() - days * day);
const dateAgo = (days: number) => iso(ago(days)).slice(0, 10);
let n = 0;
const id = (p: string) => `${p}-${String(++n).padStart(4, '0')}`;

type Row = [name: string, unit: string, cost: number, min: number, qty: number, cls?: Classification];

const REFRESHMENTS: Row[] = [
  ['Nagar Pyan Tea Mix', 'Pack', 4500, 10, 34], ['Coffee - Espresso', 'Pack', 6800, 8, 20], ['Coffee - Fusion', 'Pack', 6200, 8, 15],
  ['Coffee - Premier', 'Pack', 6500, 8, 6], ['Coffee - Royal', 'Pack', 5900, 8, 18], ['Coffee - Sunday', 'Pack', 5200, 8, 22],
  ['Coffee - Rich', 'Pack', 6000, 8, 12], ['Lemon Tea', 'Pack', 4800, 6, 14], ['Amico Drinking Water (1L)', 'Bottle', 400, 120, 360],
  ['Amico Drinking Water (500ml)', 'Bottle', 250, 200, 140], ['Butter Biscuits', 'Pack', 1800, 20, 45], ['Cream Biscuits', 'Pack', 1600, 20, 38],
  ['Sponge Cake', 'Piece', 900, 30, 60], ['Cup Cake', 'Piece', 700, 30, 25], ['Paper Cups (Hot)', 'Pack of 50', 2500, 10, 28],
  ['Paper Cups (Cold)', 'Pack of 50', 2300, 10, 19], ['Paper Plates', 'Pack of 50', 3000, 6, 12], ['Sugar Sticks', 'Box', 3500, 4, 9],
  ['Creamer', 'Jar', 5500, 3, 5], ['Tissue Box', 'Box', 1200, 15, 30], ['Stirrers', 'Pack', 800, 5, 11], ['Snack Box (Mixed)', 'Box', 2500, 20, 15],
  ['Green Tea', 'Pack', 3800, 5, 9], ['Instant Noodles (Cup)', 'Cup', 1100, 12, 24], ['Fruit Juice (Pack)', 'Pack', 900, 24, 48],
  ['Napkins', 'Pack', 1000, 10, 20],
];

const MATERIALS: Row[] = [
  ['Presenter Pointer', 'Unit', 45000, 2, 6, 'Reusable Asset'], ['Badge - Gold', 'Piece', 3500, 20, 64], ['Badge - Silver', 'Piece', 3000, 20, 71],
  ['Badge - Bronze', 'Piece', 2500, 20, 18], ['Trainee ID Card', 'Card', 600, 100, 340], ['Monopoly Board Game', 'Set', 38000, 2, 5, 'Reusable Asset'],
  ['Pingpong Balls', 'Pack', 4500, 3, 8, 'Reusable Asset'], ['Plastic Balls', 'Pack', 5200, 3, 7, 'Reusable Asset'],
  ['Wood Block Set', 'Set', 28000, 2, 4, 'Reusable Asset'], ['Whiteboard Stand', 'Unit', 120000, 1, 3, 'Reusable Asset'],
  ['Flipchart Stand', 'Unit', 95000, 1, 4, 'Reusable Asset'], ['Agency Training Textbook', 'Copy', 8000, 30, 85], ['License Exam Textbook', 'Copy', 9500, 40, 36],
  ['Flipchart Paper', 'Pad', 6500, 6, 14], ['Whiteboard Markers', 'Box', 4200, 6, 10], ['Permanent Markers', 'Box', 3900, 4, 9],
  ['Sticky Notes', 'Pack', 1800, 10, 25], ['Name Tent Cards', 'Pack', 2600, 5, 12], ['Certificate Paper', 'Ream', 14000, 3, 6],
  ['Certificate Folder', 'Piece', 2200, 40, 90], ['Masking Tape', 'Roll', 900, 10, 16], ['Training Kit Bag', 'Piece', 6500, 20, 42],
];

const YCP: Row[] = [
  ['YCP Water Bottle', 'Piece', 5500, 20, 75, 'Merchandise'], ['YCP T-Shirt', 'Piece', 9500, 20, 48, 'Merchandise'],
  ['YCP Lanyard', 'Piece', 1500, 30, 120, 'Merchandise'], ['YCP Notebook', 'Piece', 2800, 30, 96, 'Merchandise'],
  ['YCP Cardholder', 'Piece', 1800, 30, 22, 'Merchandise'], ['Internship Uniform', 'Set', 28000, 10, 24, 'Merchandise'],
  ['Ambassador Uniform', 'Set', 35000, 5, 12, 'Merchandise'], ['YCP Pen', 'Piece', 900, 50, 150, 'Merchandise'],
  ['YCP Tote Bag', 'Piece', 4500, 20, 35, 'Merchandise'],
];

const OFFICE: Row[] = [
  ['A4 Paper', 'Ream', 9800, 10, 26], ['Ball Pens (Blue)', 'Box', 3500, 5, 11], ['Stapler', 'Unit', 6500, 2, 4],
  ['Files & Folders', 'Pack', 4800, 5, 8],
];

export function buildSeed(): DataSet {
  n = 0;
  const now = iso(new Date());
  const profiles: Profile[] = [
    { id: 'u-staff', name: 'Aye Aye Mon', email: 'staff@demo.kbzlife', role: 'staff', active: true, created_at: iso(ago(400)) },
    { id: 'u-staff2', name: 'Kyaw Zin Htet', email: 'staff2@demo.kbzlife', role: 'staff', active: true, created_at: iso(ago(300)) },
    { id: 'u-hod', name: 'Daw Thida Win', email: 'hod@demo.kbzlife', role: 'hod', active: true, created_at: iso(ago(400)) },
    { id: 'u-fin', name: 'Hnin Wai Phyo', email: 'finance@demo.kbzlife', role: 'finance', active: true, created_at: iso(ago(400)) },
    { id: 'u-admin', name: 'Portal Admin', email: 'admin@demo.kbzlife', role: 'admin', active: true, created_at: iso(ago(400)) },
  ];

  const items: Item[] = [];
  const add = (cat: Category, prefix: string, rows: Row[], dflt: Classification) => rows.forEach(([name, unit, cost, min, , cls], i) => {
    items.push({
      id: id('itm'), code: `${prefix}-${String(i + 1).padStart(3, '0')}`, name, category: cat, classification: cls ?? dflt,
      unit, unit_cost: cost, min_level: min, qty_on_hand: 0, active: true, photo: null, created_at: iso(ago(200)),
    });
  });
  add('Refreshments', 'RF', REFRESHMENTS, 'Consumable');
  add('Training Materials', 'TM', MATERIALS, 'Consumable');
  add('YCP Program', 'YCP', YCP, 'Merchandise');
  add('Office Supplies', 'OS', OFFICE, 'Consumable');
  const target = new Map<string, number>();
  [...REFRESHMENTS, ...MATERIALS, ...YCP, ...OFFICE].forEach((r, i) => target.set(items[i].id, r[4]));

  const y = new Date().getFullYear();
  const batches: Batch[] = [
    { id: 'b-lic1', code: `LIC-YGN-${y}-07`, name: 'License Class July Intake (Yangon)', program: 'License', location: 'YGN', start_date: dateAgo(130), end_date: dateAgo(100), budget: 1_800_000, status: 'Completed', created_at: iso(ago(150)) },
    { id: 'b-lic2', code: `LIC-YGN-${y}-10`, name: 'License Class October Intake (Yangon)', program: 'License', location: 'YGN', start_date: dateAgo(35), end_date: dateAgo(5), budget: 2_000_000, status: 'Active', created_at: iso(ago(60)) },
    { id: 'b-lic3', code: `LIC-YGN-${y}-12`, name: 'License Class December Intake (Yangon)', program: 'License', location: 'YGN', start_date: dateAgo(-20), end_date: dateAgo(-45), budget: 2_000_000, status: 'Planned', created_at: iso(ago(10)) },
    { id: 'b-lic0', code: `LIC-MDY-${y - 1}-12`, name: 'License Class December Intake (Mandalay)', program: 'License', location: 'MDY', start_date: dateAgo(345), end_date: dateAgo(320), budget: 1_600_000, status: 'Active', created_at: iso(ago(360)) },
    { id: 'b-lic4', code: `LIC-TGI-${y}-09`, name: 'License Class September Intake (Taunggyi)', program: 'License', location: 'TGI', start_date: dateAgo(70), end_date: dateAgo(45), budget: 1_200_000, status: 'Active', created_at: iso(ago(90)) },
    { id: 'b-corp', code: `CORP-${y}-11`, name: 'New Employee Orientation (Nov)', program: 'Corporate', location: 'YGN', start_date: dateAgo(8), end_date: dateAgo(-2), budget: 1_200_000, status: 'Active', created_at: iso(ago(30)) },
    { id: 'b-agy', code: `AGY-${y}-11`, name: 'Agency Sales Bootcamp', program: 'Agency', location: 'YGN', start_date: dateAgo(15), end_date: dateAgo(10), budget: 1_500_000, status: 'Completed', created_at: iso(ago(40)) },
    { id: 'b-ycp', code: `YCP-${y}-B3`, name: 'Young Career Program Batch 3', program: 'YCP', location: 'YGN', start_date: dateAgo(50), end_date: dateAgo(-40), budget: 3_000_000, status: 'Active', created_at: iso(ago(70)) },
    { id: 'b-pss', code: `PSS-${y}-10`, name: 'Product Knowledge & Customer Service Skills', program: 'Product & Soft Skills', location: 'MDY', start_date: dateAgo(25), end_date: dateAgo(23), budget: 900_000, status: 'Completed', created_at: iso(ago(45)) },
  ];

  const stock_txns: StockTxn[] = [];
  let tx = 0;
  const txn = (p: Partial<StockTxn> & Pick<StockTxn, 'type' | 'item_id' | 'qty'>, daysAgo: number): StockTxn => {
    const it = items.find((i) => i.id === p.item_id)!;
    const t: StockTxn = {
      id: id('txn'), ref: `STK-${new Date(ago(daysAgo)).getFullYear()}-${String(++tx).padStart(4, '0')}`, unit_cost: it.unit_cost,
      batch_id: null, request_id: null, supplier: null, invoice_no: null, condition: null, reason: null, status: 'Approved',
      created_by: 'u-staff', created_at: iso(ago(daysAgo)), decided_by: 'u-hod', decided_at: iso(ago(daysAgo)), decision_note: null, attachment: null, ...p,
    };
    stock_txns.push(t);
    if (t.status === 'Approved') it.qty_on_hand += stockDelta(t);
    return t;
  };

  // Approved issues to batches (via material requests), plus returns.
  const material_requests: MaterialRequest[] = [];
  let mr = 0;
  const request = (batch: string, lines: [number, number][], status: MaterialRequest['status'], daysAgo: number, purpose: string) => {
    const r: MaterialRequest = {
      id: id('mr'), ref: `MR-${y}-${String(++mr).padStart(4, '0')}`, batch_id: batch, purpose, remarks: '', attachment: null, status,
      lines: lines.map(([i, q]) => ({ item_id: items[i].id, qty: q })), created_by: 'u-staff', created_at: iso(ago(daysAgo)),
      decided_by: status === 'Pending' ? null : 'u-hod', decided_at: status === 'Pending' ? null : iso(ago(daysAgo - 1)),
      decision_note: status === 'Rejected' ? 'Quantity too high for 25 trainees, please revise.' : null,
    };
    material_requests.push(r);
    return r;
  };
  const issued = [
    request('b-lic2', [[0, 4], [8, 60], [10, 10], [26 + 12, 25], [26 + 4, 25]], 'Approved', 34, 'Refreshments and textbooks for October license class'),
    request('b-corp', [[1, 3], [8, 40], [14, 4], [26 + 4, 30], [26 + 16, 30]], 'Approved', 8, 'Orientation week supplies'),
    request('b-ycp', [[48, 25], [49, 25], [50, 25], [51, 25]], 'Approved', 48, 'YCP Batch 3 welcome kits'),
    request('b-agy', [[26 + 1, 15], [26 + 2, 10], [8, 50], [11, 12]], 'Approved', 15, 'Bootcamp awards and refreshments'),
    request('b-pss', [[5, 2], [8, 30], [26 + 13, 2], [26 + 16, 20]], 'Approved', 25, 'Product & soft skills workshop, Mandalay'),
    request('b-lic4', [[0, 2], [8, 40], [26 + 12, 20]], 'Approved', 70, 'Taunggyi license class supplies'),
  ];
  const pend = request('b-ycp', [[53, 8], [54, 4]], 'Pending', 1, 'Uniforms for new interns and ambassadors');
  pend.remarks = 'Sizes are in the attached list. Ambassador uniforms needed before the 20th.';
  pend.attachment = { name: 'YCP_B3_uniform_sizes.csv', url: 'data:text/csv;base64,TmFtZSxTaXplCk1hIFBoeXUsTQpNZyBLeWF3LEwK', size: 34 };
  request('b-corp', [[9, 150]], 'Pending', 0, 'Water for closing ceremony');
  request('b-agy', [[2, 20]], 'Rejected', 16, 'Coffee for bootcamp');

  // Opening balances so that the final on-hand quantities match the target figures above.
  const issuedQty = new Map<string, number>();
  for (const r of issued) for (const l of r.lines) issuedQty.set(l.item_id, (issuedQty.get(l.item_id) ?? 0) + l.qty);
  for (const it of items) {
    txn({ type: 'IN', item_id: it.id, qty: (target.get(it.id) ?? 0) + (issuedQty.get(it.id) ?? 0) + 2, supplier: 'Opening balance', reason: 'Opening stock take' }, 180);
  }
  for (const r of issued) for (const l of r.lines) {
    txn({ type: 'OUT', item_id: l.item_id, qty: l.qty, batch_id: r.batch_id, request_id: r.id, reason: r.ref }, (Date.now() - Date.parse(r.created_at)) / day - 1);
  }
  for (const it of items) txn({ type: 'ADJUST', item_id: it.id, qty: -2, reason: 'Opening count variance' }, 170);
  // A few returns after classes.
  txn({ type: 'RETURN', item_id: items[8].id, qty: 12, batch_id: 'b-lic2', condition: 'Good', reason: 'Unopened water returned', created_by: 'u-staff2' }, 4);
  txn({ type: 'RETURN', item_id: items[26 + 12].id, qty: 2, batch_id: 'b-lic2', condition: 'Damaged', reason: 'Torn covers', created_by: 'u-staff2' }, 4);
  // Purchases this year (approved) and one pending purchase.
  const inv = (n: string) => ({ name: `${n}.pdf`, url: 'data:application/pdf;base64,JVBERi0xLjQKJSBkZW1vIGludm9pY2UK', size: 24 });
  txn({ type: 'IN', item_id: items[9].id, qty: 200, supplier: 'Amico Co., Ltd.', invoice_no: 'INV-88231', reason: 'Monthly water', attachment: inv('INV-88231') }, 20);
  txn({ type: 'IN', item_id: items[11].id, qty: 40, supplier: 'City Mart Wholesale', invoice_no: 'CMW-54410', reason: 'Biscuits', attachment: inv('CMW-54410') }, 110);
  txn({ type: 'IN', item_id: items[26 + 11].id, qty: 60, supplier: 'Myanmar Book Centre', invoice_no: 'MBC-2201', reason: 'Textbook reprint', attachment: inv('MBC-2201') }, 150);
  txn({ type: 'IN', item_id: items[48].id, qty: 100, supplier: 'Promo Gifts Co.', invoice_no: 'PG-7731', reason: 'YCP bottles', attachment: inv('PG-7731') }, 240);
  txn({ type: 'IN', item_id: items[26 + 1].id, qty: 50, supplier: 'Golden Awards Shop', invoice_no: 'GA-1102', reason: 'Badge restock' }, 60);
  txn({ type: 'IN', item_id: items[3].id, qty: 24, supplier: 'City Mart Wholesale', invoice_no: 'CMW-55120', reason: 'Coffee restock', status: 'Pending', decided_by: null, decided_at: null, attachment: inv('CMW-55120') }, 1);
  txn({ type: 'ADJUST', item_id: items[12].id, qty: -6, reason: 'Expired cakes written off', status: 'Pending', decided_by: null, decided_at: null }, 0);

  // Reusable assets.
  const assets: Asset[] = [];
  const asset_logs: AssetLog[] = [];
  let at = 0;
  const reg = (name: string, cat: Category, cost: number, status: Asset['status'], condition: Asset['condition'], holder: string | null = null, batch: string | null = null) => {
    const a: Asset = {
      id: id('ast'), asset_tag: `AST-${String(++at).padStart(4, '0')}`, name, serial_no: `SN${(100000 + at * 7919).toString(36).toUpperCase()}`,
      category: cat, purchase_date: dateAgo(300 - at * 5), cost, condition, status, location: 'L&D Store Room, HQ 5th Floor',
      holder, batch_id: batch, created_at: iso(ago(300 - at * 5)),
    };
    assets.push(a);
    asset_logs.push({ id: id('alog'), asset_id: a.id, action: 'Registered', condition: 'Good', holder: null, batch_id: null, cost: 0, note: 'Asset registered', created_by: 'u-staff', created_at: a.created_at });
    if (status === 'Checked Out') asset_logs.push({ id: id('alog'), asset_id: a.id, action: 'Check Out', condition, holder, batch_id: batch, cost: 0, note: 'For class', created_by: 'u-staff', created_at: iso(ago(6)) });
    if (status === 'Maintenance') asset_logs.push({ id: id('alog'), asset_id: a.id, action: 'Maintenance Start', condition, holder: null, batch_id: null, cost: 25000, note: 'Wheel lock repair', created_by: 'u-staff', created_at: iso(ago(3)) });
    if (status === 'Damaged') asset_logs.push({ id: id('alog'), asset_id: a.id, action: 'Reported Damaged', condition: 'Damaged', holder: null, batch_id: null, cost: 0, note: 'Laser no longer works', created_by: 'u-staff2', created_at: iso(ago(12)) });
    return a;
  };
  reg('Presenter Pointer (Logitech R500)', 'Training Materials', 45000, 'Checked Out', 'Good', 'Kyaw Zin Htet', 'b-corp');
  reg('Presenter Pointer (Logitech R500)', 'Training Materials', 45000, 'Available', 'Good');
  reg('Presenter Pointer (Generic)', 'Training Materials', 25000, 'Damaged', 'Damaged');
  reg('Whiteboard Stand (Mobile)', 'Training Materials', 120000, 'Available', 'Good');
  reg('Whiteboard Stand (Mobile)', 'Training Materials', 120000, 'Maintenance', 'Fair');
  reg('Flipchart Stand', 'Training Materials', 95000, 'Checked Out', 'Good', 'Aye Aye Mon', 'b-ycp');
  reg('Flipchart Stand', 'Training Materials', 95000, 'Available', 'Fair');
  reg('Monopoly Board Game', 'Training Materials', 38000, 'Available', 'Good');
  reg('Wood Block Set', 'Training Materials', 28000, 'Checked Out', 'Good', 'Aye Aye Mon', 'b-ycp');

  // License deposits.
  const deposits: Deposit[] = [];
  const deposit_status_log: DepositStatusLog[] = [];
  const townships = ['MaYaKa', 'KaMaYa', 'BaHaNa', 'ThaGaKa', 'LaMaTa', 'DaGaYa', 'AhLaNa'];
  const nrcOf = (i: number, st: number) => `${st}/${townships[i % townships.length]}(N)${String(104_215 + i * 7_331).slice(0, 6)}`;
  const names: [string, string][] = [
    ['Ma Nang Seng', ''], ['Sai Htoo Aung', 'AG-10352'], ['Mg Aung Ko Ko', 'AG-10231'], ['Ma Su Myat Noe', 'AG-10244'], ['Mg Htet Naing', 'AG-10252'], ['Ma Ei Thandar', 'AG-10260'],
    ['Mg Zaw Lin Oo', 'AG-10271'], ['Ma Khin Sandar', 'AG-10285'], ['Mg Pyae Sone', 'AG-10290'], ['Ma Yadanar Htun', 'AG-10302'],
    ['Mg Thura Aung', 'AG-10311'], ['Ma Nandar Hlaing', 'AG-10318'], ['Mg Min Khant', 'AG-10324'], ['Ma Phyu Sin', 'AG-10330'],
    ['Mg Kaung Myat', 'AG-10337'], ['Ma Hsu Lae', 'AG-10345'],
  ];
  const plan: [batch: string, paidDaysAgo: number, status: Deposit['status'], extra?: Partial<Deposit>][] = [
    ['b-lic4', 72, 'Held', { trainee_type: 'External', agent_code: null }], ['b-lic4', 71, 'Held'],
    ['b-lic0', 345, 'Held'], ['b-lic0', 340, 'Held'], ['b-lic0', 372, 'Held'],
    ['b-lic0', 344, 'Refunded'], ['b-lic0', 341, 'Forfeited', { forfeit_reason: 'Service Period Not Met' }],
    ['b-lic1', 130, 'Refunded'], ['b-lic1', 128, 'Forfeited', { forfeit_reason: 'Course Incomplete' }],
    ['b-lic1', 129, 'Refund Request'], ['b-lic1', 131, 'Refund Request', { hod_approved_by: 'u-hod', hod_approved_at: iso(ago(1)) }],
    ['b-lic2', 36, 'Held'], ['b-lic2', 35, 'Held'], ['b-lic2', 35, 'Forfeiture Request', { forfeit_reason: 'Course Incomplete' }],
    ['b-lic2', 34, 'Held'], ['b-lic2', 33, 'Held'],
  ];
  plan.forEach(([batch, paid, status, extra], i) => {
    const created = iso(ago(paid));
    const requested = status !== 'Held';
    const final = status === 'Refunded' || status === 'Forfeited';
    const attach = status === 'Refund Request' || status === 'Refunded'
      ? { name: `Exam_Pass_Certificate_${names[i][1]}.pdf`, url: 'data:text/plain;base64,RGVtbyBhdHRhY2htZW50', size: 18 }
      : requested ? { name: `Forfeiture_Notice_${names[i][1]}.pdf`, url: 'data:text/plain;base64,RGVtbyBhdHRhY2htZW50', size: 18 } : null;
    const d: Deposit = {
      id: id('dep'), ref: `DEP-${new Date(created).getFullYear()}-${String(i + 1).padStart(4, '0')}`, trainee_name: names[i][0],
      nrc: nrcOf(i, batch === 'b-lic0' ? 9 : batch === 'b-lic4' ? 13 : 12), agent_code: names[i][1] || null, trainee_type: i % 4 === 3 ? 'External' : 'Internal',
      training_date: batches.find((b) => b.id === batch)!.start_date, training_end_date: batches.find((b) => b.id === batch)!.end_date,
      documents: [{ name: `Payment_slip_${names[i][0].replace(/\s+/g, '_')}.pdf`, url: 'data:application/pdf;base64,JVBERi0xLjQKJSBkZW1vCg==', size: 18 }],
      batch_id: batch, amount: batch === 'b-lic0' || batch === 'b-lic4' ? 200_000 : 250_000, payment_date: created.slice(0, 10), voucher_ref: null,
      status, forfeit_reason: null, request_note: requested ? (status.includes('Forfeit') ? 'Did not attend the final 3 sessions; HR confirmation attached.' : 'Passed the IRD license exam.') : null,
      attachment: attach, requested_by: requested ? 'u-staff' : null, requested_at: requested ? iso(ago(final ? 20 : 2)) : null,
      hod_approved_by: final ? 'u-hod' : null, hod_approved_at: final ? iso(ago(18)) : null,
      finance_approved_by: status === 'Refunded' ? 'u-fin' : null, finance_approved_at: status === 'Refunded' ? iso(ago(16)) : null,
      finance_voucher_ref: status === 'Refunded' ? `PV-${55800 + i}` : null, closed_at: final ? iso(ago(16)) : null,
      reversal_from: null, reversal_reason: null, created_by: 'u-staff', created_at: created, ...extra,
    };
    deposits.push(d);
    const log = (from: Deposit['status'] | null, to: Deposit['status'], by: string, when: string, note: string | null) =>
      deposit_status_log.push({ id: id('dlog'), deposit_id: d.id, from_status: from, to_status: to, note, attachment_name: null, user_id: by, user_name: profiles.find((p) => p.id === by)!.name, ip: 'demo', created_at: when });
    log(null, 'Held', 'u-staff', created, 'Deposit registered');
    if (requested) log('Held', status === 'Refunded' || status === 'Refund Request' ? 'Refund Request' : 'Forfeiture Request', 'u-staff', d.requested_at!, d.request_note);
    if (status === 'Forfeited') log('Forfeiture Request', 'Forfeited', 'u-hod', d.hod_approved_at!, 'Approved by HOD');
    if (status === 'Refunded') log('Refund Request', 'Refunded', 'u-fin', d.finance_approved_at!, `HOD approved; paid on ${d.finance_voucher_ref}`);
  });

  const ex = (daysAgo: number, batch: string | null, category: string, description: string, amount: number, cat?: Expense['budget_category']): Expense => ({
    id: id('exp'), date: dateAgo(daysAgo), batch_id: batch, category, description, amount,
    budget_category: cat ?? (batch ? budgetCategory(batches.find((b) => b.id === batch)) : 'General'),
    created_by: 'u-staff', created_at: iso(ago(daysAgo)),
  });
  const expenses: Expense[] = [
    ex(34, 'b-lic2', 'Venue', 'Training hall rental (5 days)', 750_000),
    ex(14, 'b-agy', 'Transport', 'Bus hire for field visit', 420_000),
    ex(48, 'b-ycp', 'Printing', 'Program handbooks', 380_000),
    ex(7, 'b-corp', 'Refreshments', 'Lunch boxes, day 1', 310_000),
    ex(90, null, 'Other', 'Store room shelving', 650_000),
    ex(70, 'b-lic4', 'Venue', 'Hotel meeting room, Taunggyi', 520_000),
    ex(68, 'b-lic4', 'Transport', 'Trainer travel YGN–Heho', 460_000),
    ex(25, 'b-pss', 'Trainer Fee', 'External soft-skills facilitator', 600_000),
    ex(130, 'b-lic1', 'Venue', 'Training hall rental', 700_000),
    ex(200, null, 'Printing', 'License exam guide reprint (Mandalay)', 350_000, 'License - MDY'),
    ex(230, null, 'Venue', 'YCP Batch 2 graduation', 900_000, 'YCP'),
    ex(160, null, 'Trainer Fee', 'Product launch training', 450_000, 'Product & Soft Skills'),
  ];

  const budgets: Budget[] = [
    { id: id('bud'), fiscal_year: y, category: 'Overall', amount: 25_000_000, note: 'Approved L&D annual budget', created_at: iso(ago(300)) },
    ...([['YCP', 6_000_000], ['License - YGN', 6_000_000], ['License - MDY', 3_000_000], ['License - TGI', 2_500_000], ['Product & Soft Skills', 3_000_000]] as const)
      .map(([category, amount]) => ({ id: id('bud'), fiscal_year: y, category, amount, note: '', created_at: iso(ago(300)) })),
  ];
  const settings: Settings[] = [{ id: 'settings', retention_alert_months: 11, service_term_months: 12, low_stock_warning_pct: 0, updated_at: now }];

  return {
    profiles, items, batches, stock_txns, material_requests, physical_counts: [], assets, asset_logs, deposits,
    deposit_status_log, expenses, budgets, settings,
    audit_logs: [{ id: id('aud'), user_id: 'u-admin', user_name: 'Portal Admin', action: 'Seed', entity: 'system', entity_id: null, details: 'Demo data loaded', ip: 'demo', created_at: now }],
  };
}
