import type { DataRow } from '../types';

const regions = ['Northeast', 'South', 'Midwest', 'West'] as const;
type Region = typeof regions[number];
interface GeographyNode { market: string; stateGroup: string; }

const geography: Record<Region, readonly GeographyNode[]> = {
  Northeast: [
    { market: 'Boston', stateGroup: 'Metro' },
    { market: 'New York', stateGroup: 'Metro' },
    { market: 'Philadelphia', stateGroup: 'Urban' },
    { market: 'Upstate', stateGroup: 'Suburban' },
  ],
  South: [
    { market: 'Atlanta', stateGroup: 'Metro' },
    { market: 'Dallas', stateGroup: 'Urban' },
    { market: 'Miami', stateGroup: 'Metro' },
    { market: 'Carolinas', stateGroup: 'Suburban' },
  ],
  Midwest: [
    { market: 'Chicago', stateGroup: 'Metro' },
    { market: 'Detroit', stateGroup: 'Urban' },
    { market: 'Minneapolis', stateGroup: 'Suburban' },
    { market: 'Plains', stateGroup: 'Rural' },
  ],
  West: [
    { market: 'Los Angeles', stateGroup: 'Metro' },
    { market: 'Phoenix', stateGroup: 'Urban' },
    { market: 'Seattle', stateGroup: 'Metro' },
    { market: 'Mountain West', stateGroup: 'Rural' },
  ],
};

const channels = ['Store', 'Online', 'Partner', 'Inside Sales'] as const;
type Channel = typeof channels[number];
const channelHierarchy: Record<Channel, readonly string[]> = {
  Store: ['Flagship', 'Standard', 'Kiosk'],
  Online: ['Website', 'Mobile App', 'Assisted Digital'],
  Partner: ['Dealer', 'Retail Partner', 'Agent'],
  'Inside Sales': ['Contact Center', 'Account Team', 'Telesales'],
};

const productFamilies = ['Fiber', 'Wireless', 'Device', 'Accessories'] as const;
type ProductFamily = typeof productFamilies[number];
interface ProductFamilyNode { lines: Record<string, readonly string[]>; brands: readonly string[]; }
const productHierarchy: Record<ProductFamily, ProductFamilyNode> = {
  Fiber: {
    lines: {
      'Home Fiber': ['Fiber 300', 'Fiber Gigabit'],
      'Business Fiber': ['Business 500', 'Enterprise Fiber'],
      'Fiber Add-ons': ['Whole Home Wi-Fi', 'Cloud Backup'],
    },
    brands: ['Nova', 'Vertex'],
  },
  Wireless: {
    lines: {
      Unlimited: ['Unlimited Welcome', 'Unlimited Ultimate'],
      Prepaid: ['Prepaid 15GB', 'Prepaid Unlimited'],
      'Business Mobility': ['Business Mobile', 'Fleet Connect'],
    },
    brands: ['Aster', 'Nova', 'Orion'],
  },
  Device: {
    lines: {
      Smartphone: ['Aster One', 'Nova Max'],
      Tablet: ['Orion Tab', 'Vertex Slate'],
      Wearable: ['Nova Watch', 'Aster Band'],
    },
    brands: ['Aster', 'Nova', 'Orion', 'Vertex'],
  },
  Accessories: {
    lines: {
      Audio: ['Wireless Buds', 'Conference Headset'],
      Power: ['Fast Charger', 'Power Bank'],
      Protection: ['Device Case', 'Screen Guard'],
    },
    brands: ['Aster', 'Vertex'],
  },
};

const customerSegments = ['Consumer', 'SMB', 'Enterprise'] as const;
type CustomerSegment = typeof customerSegments[number];
const customerHierarchy: Record<CustomerSegment, readonly string[]> = {
  Consumer: ['Postpaid', 'Prepaid', 'Hybrid'],
  SMB: ['Business Standard', 'Business Plus', 'Owner Mobile'],
  Enterprise: ['Corporate', 'Strategic', 'Government'],
};

const dims = {
  productTier: ['Entry', 'Core', 'Premium'],
  offer: ['Base', 'Promo A', 'Promo B', 'Bundle'],
  tenureBand: ['0-3m', '4-12m', '1-3y', '3y+'],
  paymentType: ['AutoPay', 'Card', 'Bank', 'Cash'],
  acquisitionSource: ['Organic', 'Paid Search', 'Social', 'Referral'],
  salesMotion: ['Inbound', 'Outbound', 'Assisted', 'Self Serve'],
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

function pick<T>(values: readonly T[], row: number, salt: number): T {
  return values[(row * (salt * 7 + 3) + salt * 11) % values.length];
}

function noise(row: number) {
  return ((row * 9301 + 49297) % 233280) / 233280 - 0.5;
}

export function createSampleData(rows = 1600): DataRow[] {
  return Array.from({ length: rows }, (_, index) => {
    const calendarIndex = index % 24;
    const year = calendarIndex < 12 ? 2025 : 2026;
    const monthNumber = calendarIndex % 12 + 1;
    const quarter = `Q${Math.ceil(monthNumber / 3)}`;
    const month = `${year}-${String(monthNumber).padStart(2, '0')}`;

    const region = pick(regions, index, 1);
    const geographyRow = pick(geography[region], index, 2);
    const channel = pick(channels, index, 3);
    const storeType = pick(channelHierarchy[channel], index, 4);
    const productFamily = pick(productFamilies, index, 5);
    const productLines = Object.keys(productHierarchy[productFamily].lines);
    const productLine = pick(productLines, index, 6);
    const productName = pick(productHierarchy[productFamily].lines[productLine], index, 7);
    const deviceBrand = pick(productHierarchy[productFamily].brands, index, 8);
    const productTier = pick(dims.productTier, index, 9);
    const customerSegment = pick(customerSegments, index, 10);
    const accountType = pick(customerHierarchy[customerSegment], index, 11);
    const offer = pick(dims.offer, index, 12);
    const inventoryStatus = pick(dims.inventoryStatus, index, 13);
    const tenureBand = pick(dims.tenureBand, index, 14);

    const target = 920
      + monthNumber * 13
      + (customerSegment === 'Enterprise' ? 210 : 0)
      + (productTier === 'Premium' ? 115 : 0)
      + (productFamily === 'Fiber' ? 70 : 0);

    let delta = noise(index) * 190;
    if (region === 'West' && channel === 'Store' && productFamily === 'Device') delta -= 480;
    if (offer === 'Promo B' && tenureBand === '0-3m') delta -= 220;
    if (inventoryStatus === 'Backorder' && productFamily === 'Device') delta -= 260;
    if (region === 'Northeast' && channel === 'Online' && productFamily === 'Fiber') delta += 280;
    if (customerSegment === 'Enterprise' && productTier === 'Premium') delta += 160;

    const actual = Math.max(25, target + delta);

    return {
      recordId: `R-${String(index + 1).padStart(5, '0')}`,
      year,
      quarter,
      month,
      region,
      market: geographyRow.market,
      stateGroup: geographyRow.stateGroup,
      channel,
      storeType,
      productFamily,
      productLine,
      productName,
      productTier,
      deviceBrand,
      offer,
      customerSegment,
      accountType,
      tenureBand,
      paymentType: pick(dims.paymentType, index, 15),
      acquisitionSource: pick(dims.acquisitionSource, index, 16),
      salesMotion: pick(dims.salesMotion, index, 17),
      deviceOs: pick(dims.deviceOs, index, 18),
      planType: pick(dims.planType, index, 19),
      promoFlag: pick(dims.promoFlag, index, 20),
      contractType: pick(dims.contractType, index, 21),
      creditBand: pick(dims.creditBand, index, 22),
      ageBand: pick(dims.ageBand, index, 23),
      serviceTier: pick(dims.serviceTier, index, 24),
      supportTier: pick(dims.supportTier, index, 25),
      fulfillment: pick(dims.fulfillment, index, 26),
      inventoryStatus,
      employeeBand: pick(dims.employeeBand, index, 27),
      units: 1 + index % 7,
      target: Math.round(target * 100) / 100,
      actual: Math.round(actual * 100) / 100,
    };
  });
}
