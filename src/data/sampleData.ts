import type { DataRow } from '../types';

const dims = {
  region: ['Northeast', 'South', 'Midwest', 'West'],
  stateGroup: ['Metro', 'Urban', 'Suburban', 'Rural'],
  market: ['A', 'B', 'C', 'D', 'E'],
  channel: ['Store', 'Online', 'Partner', 'Inside Sales'],
  storeType: ['Flagship', 'Standard', 'Kiosk', 'Dealer'],
  productFamily: ['Fiber', 'Wireless', 'Device', 'Accessories'],
  productTier: ['Entry', 'Core', 'Premium'],
  offer: ['Base', 'Promo A', 'Promo B', 'Bundle'],
  customerSegment: ['Consumer', 'SMB', 'Enterprise'],
  tenureBand: ['0-3m', '4-12m', '1-3y', '3y+'],
  accountType: ['Postpaid', 'Prepaid', 'Hybrid'],
  paymentType: ['AutoPay', 'Card', 'Bank', 'Cash'],
  acquisitionSource: ['Organic', 'Paid Search', 'Social', 'Referral'],
  salesMotion: ['Inbound', 'Outbound', 'Assisted', 'Self Serve'],
  deviceBrand: ['Aster', 'Nova', 'Orion', 'Vertex'],
  deviceOs: ['Android', 'iOS', 'Other'],
  planType: ['Unlimited', 'Metered', 'Family', 'Business'],
  promoFlag: ['Promo', 'No Promo'],
  contractType: ['Month-to-month', '12 month', '24 month'],
  creditBand: ['Prime', 'Near Prime', 'Subprime'],
  ageBand: ['18-24', '25-34', '35-44', '45-54', '55+'],
  serviceTier: ['Bronze', 'Silver', 'Gold'],
  supportTier: ['Digital', 'Standard', 'Priority'],
  fulfillment: ['Ship', 'Pickup', 'Same Day'],
  inventoryStatus: ['Healthy', 'Tight', 'Backorder'],
  employeeBand: ['Small', 'Mid', 'Large'],
} as const;

function pick<T>(values: readonly T[], n: number, salt: number): T {
  return values[(n * (salt * 7 + 3) + salt * 11) % values.length];
}

function noise(n: number) {
  return ((n * 9301 + 49297) % 233280) / 233280 - 0.5;
}

export function createSampleData(rows = 1600): DataRow[] {
  return Array.from({ length: rows }, (_, i) => {
    const monthIndex = i % 12;
    const region = pick(dims.region, i, 1);
    const channel = pick(dims.channel, i, 2);
    const productFamily = pick(dims.productFamily, i, 3);
    const productTier = pick(dims.productTier, i, 4);
    const customerSegment = pick(dims.customerSegment, i, 5);
    const offer = pick(dims.offer, i, 6);
    const inventoryStatus = pick(dims.inventoryStatus, i, 7);
    const tenureBand = pick(dims.tenureBand, i, 8);

    const target = 920 + monthIndex * 13 + (customerSegment === 'Enterprise' ? 210 : 0) + (productTier === 'Premium' ? 115 : 0);

    let delta = noise(i) * 190;
    if (region === 'West' && channel === 'Store' && productFamily === 'Device') delta -= 480;
    if (offer === 'Promo B' && tenureBand === '0-3m') delta -= 220;
    if (inventoryStatus === 'Backorder' && productFamily === 'Device') delta -= 260;
    if (region === 'Northeast' && channel === 'Online' && productFamily === 'Fiber') delta += 280;
    if (customerSegment === 'Enterprise' && productTier === 'Premium') delta += 160;

    const actual = Math.max(25, target + delta);

    return {
      recordId: `R-${String(i + 1).padStart(5, '0')}`,
      month: `2026-${String(monthIndex + 1).padStart(2, '0')}`,
      region,
      stateGroup: pick(dims.stateGroup, i, 9),
      market: pick(dims.market, i, 10),
      channel,
      storeType: pick(dims.storeType, i, 11),
      productFamily,
      productTier,
      offer,
      customerSegment,
      tenureBand,
      accountType: pick(dims.accountType, i, 12),
      paymentType: pick(dims.paymentType, i, 13),
      acquisitionSource: pick(dims.acquisitionSource, i, 14),
      salesMotion: pick(dims.salesMotion, i, 15),
      deviceBrand: pick(dims.deviceBrand, i, 16),
      deviceOs: pick(dims.deviceOs, i, 17),
      planType: pick(dims.planType, i, 18),
      promoFlag: pick(dims.promoFlag, i, 19),
      contractType: pick(dims.contractType, i, 20),
      creditBand: pick(dims.creditBand, i, 21),
      ageBand: pick(dims.ageBand, i, 22),
      serviceTier: pick(dims.serviceTier, i, 23),
      supportTier: pick(dims.supportTier, i, 24),
      fulfillment: pick(dims.fulfillment, i, 25),
      inventoryStatus,
      employeeBand: pick(dims.employeeBand, i, 26),
      units: 1 + (i % 7),
      target: Math.round(target * 100) / 100,
      actual: Math.round(actual * 100) / 100,
    };
  });
}
