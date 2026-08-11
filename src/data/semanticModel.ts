export interface SemanticDimension {
  id: string;
  label: string;
  description: string;
  domain: string;
  synonyms: string[];
  parent?: string;
  child?: string;
}

export const semanticDimensions: SemanticDimension[] = [
  { id: 'region', label: 'Region', description: 'Broad geographic area used to group performance.', domain: 'Geography', synonyms: ['geography', 'area'], child: 'market' },
  { id: 'market', label: 'Market', description: 'A more detailed geographic grouping within a region.', domain: 'Geography', synonyms: ['local market'], parent: 'region', child: 'stateGroup' },
  { id: 'stateGroup', label: 'State Group', description: 'A local geography grouping such as metro, urban, suburban, or rural.', domain: 'Geography', synonyms: ['state', 'location type'], parent: 'market' },
  { id: 'channel', label: 'Channel', description: 'How the sale or customer interaction was completed.', domain: 'Sales', synonyms: ['sales channel', 'route to market'], child: 'storeType' },
  { id: 'storeType', label: 'Store Type', description: 'The type of physical retail location.', domain: 'Sales', synonyms: ['store', 'retail type'], parent: 'channel' },
  { id: 'salesMotion', label: 'Sales Motion', description: 'How the customer was engaged, such as inbound, outbound, assisted, or self-serve.', domain: 'Sales', synonyms: ['motion', 'selling motion'] },
  { id: 'productFamily', label: 'Product Family', description: 'High-level product grouping.', domain: 'Product', synonyms: ['product', 'products', 'category', 'product group'], child: 'productTier' },
  { id: 'productTier', label: 'Product Tier', description: 'Relative product level such as Entry, Core, or Premium.', domain: 'Product', synonyms: ['tier', 'product level'], parent: 'productFamily', child: 'deviceBrand' },
  { id: 'deviceBrand', label: 'Device Brand', description: 'Brand associated with a device.', domain: 'Product', synonyms: ['brand', 'device'], parent: 'productTier' },
  { id: 'deviceOs', label: 'Device OS', description: 'Operating system family associated with the device.', domain: 'Product', synonyms: ['os', 'operating system'] },
  { id: 'offer', label: 'Offer', description: 'Commercial offer or promotion attached to the transaction.', domain: 'Commercial', synonyms: ['promotion', 'promo', 'deal'] },
  { id: 'planType', label: 'Plan Type', description: 'Service plan grouping.', domain: 'Commercial', synonyms: ['plan'] },
  { id: 'customerSegment', label: 'Customer Segment', description: 'High-level customer segment such as Consumer, SMB, or Enterprise.', domain: 'Customer', synonyms: ['segment', 'customer type'], child: 'tenureBand' },
  { id: 'tenureBand', label: 'Tenure', description: 'How long the customer has been with the business.', domain: 'Customer', synonyms: ['tenure', 'customer age'], parent: 'customerSegment', child: 'accountType' },
  { id: 'accountType', label: 'Account Type', description: 'Type of customer account such as Postpaid, Prepaid, or Hybrid.', domain: 'Customer', synonyms: ['account'], parent: 'tenureBand' },
  { id: 'ageBand', label: 'Age Band', description: 'Customer age grouping.', domain: 'Customer', synonyms: ['age'] },
  { id: 'creditBand', label: 'Credit Band', description: 'Customer credit grouping.', domain: 'Customer', synonyms: ['credit'] },
  { id: 'acquisitionSource', label: 'Acquisition Source', description: 'Where the customer or opportunity originated.', domain: 'Marketing', synonyms: ['source', 'acquisition'] },
  { id: 'inventoryStatus', label: 'Inventory Status', description: 'Product availability condition such as Healthy, Tight, or Backorder.', domain: 'Operations', synonyms: ['inventory', 'stock'] },
  { id: 'fulfillment', label: 'Fulfillment', description: 'How an order is delivered or collected.', domain: 'Operations', synonyms: ['delivery', 'shipping'] },
  { id: 'serviceTier', label: 'Service Tier', description: 'Service level grouping.', domain: 'Operations', synonyms: ['service level'] },
  { id: 'supportTier', label: 'Support Tier', description: 'Customer support level.', domain: 'Operations', synonyms: ['support'] },
  { id: 'paymentType', label: 'Payment Type', description: 'How payment is made.', domain: 'Account', synonyms: ['payment'] },
  { id: 'contractType', label: 'Contract Type', description: 'Length or type of customer commitment.', domain: 'Account', synonyms: ['contract'] },
  { id: 'promoFlag', label: 'Promotion Status', description: 'Whether a promotion is present.', domain: 'Commercial', synonyms: ['promo status'] },
  { id: 'employeeBand', label: 'Employee Band', description: 'Company size grouping for business customers.', domain: 'Customer', synonyms: ['company size', 'employees'] },
  { id: 'month', label: 'Month', description: 'Calendar month associated with the record.', domain: 'Time', synonyms: ['time', 'date'] },
];

export function semanticFor(id: string) {
  return semanticDimensions.find((d) => d.id === id);
}

export function labelFor(id: string) {
  return semanticFor(id)?.label ?? id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function resolveDimension(text: string, available: string[]) {
  const q = text.toLowerCase();
  return semanticDimensions.find((d) => available.includes(d.id) && [d.id, d.label, ...d.synonyms].some((x) => q.includes(x.toLowerCase())))?.id;
}
