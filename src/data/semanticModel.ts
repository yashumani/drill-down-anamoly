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
  { id: 'year', label: 'Year', description: 'Calendar year associated with the record.', domain: 'Time', synonyms: ['calendar year'], child: 'quarter' },
  { id: 'quarter', label: 'Quarter', description: 'Calendar quarter within a year.', domain: 'Time', synonyms: ['qtr'], parent: 'year', child: 'month' },
  { id: 'month', label: 'Month', description: 'Calendar month associated with the record.', domain: 'Time', synonyms: ['time', 'date', 'period'], parent: 'quarter' },

  { id: 'region', label: 'Region', description: 'Broad geographic area used to group performance.', domain: 'Geography', synonyms: ['geography', 'area'], child: 'market' },
  { id: 'market', label: 'Market', description: 'A local operating market within a region.', domain: 'Geography', synonyms: ['local market', 'territory'], parent: 'region' },
  { id: 'stateGroup', label: 'Market Type', description: 'A descriptive market classification such as metro, urban, suburban, or rural. It is not a child level of Market.', domain: 'Geography', synonyms: ['location type', 'market classification'] },

  { id: 'channel', label: 'Channel', description: 'How the sale or customer interaction was completed.', domain: 'Sales', synonyms: ['sales channel', 'route to market'], child: 'storeType' },
  { id: 'storeType', label: 'Channel Subtype', description: 'A more detailed route within a channel, such as Flagship, Website, Dealer, or Contact Center.', domain: 'Sales', synonyms: ['subchannel', 'channel type', 'store type'], parent: 'channel' },
  { id: 'salesMotion', label: 'Sales Motion', description: 'How the customer was engaged, such as inbound, outbound, assisted, or self-serve.', domain: 'Sales', synonyms: ['motion', 'selling motion'] },

  { id: 'productFamily', label: 'Product Family', description: 'High-level product grouping.', domain: 'Product', synonyms: ['product', 'products', 'category', 'product group'], child: 'productLine' },
  { id: 'productLine', label: 'Product Line', description: 'A product line within a product family.', domain: 'Product', synonyms: ['line', 'product subcategory'], parent: 'productFamily', child: 'productName' },
  { id: 'productName', label: 'Product', description: 'A specific product within a product line.', domain: 'Product', synonyms: ['product name', 'item'], parent: 'productLine' },
  { id: 'productTier', label: 'Product Tier', description: 'Relative commercial tier such as Entry, Core, or Premium. This is an attribute, not a structural child level.', domain: 'Product', synonyms: ['tier', 'product level'] },
  { id: 'deviceBrand', label: 'Product Brand', description: 'Brand associated with the product.', domain: 'Product', synonyms: ['brand', 'device brand'] },
  { id: 'deviceOs', label: 'Device OS', description: 'Operating system family associated with a device.', domain: 'Product', synonyms: ['os', 'operating system'] },

  { id: 'offer', label: 'Offer', description: 'Commercial offer or promotion attached to the transaction.', domain: 'Commercial', synonyms: ['promotion', 'promo', 'deal'] },
  { id: 'planType', label: 'Plan Type', description: 'Service plan grouping.', domain: 'Commercial', synonyms: ['plan'] },
  { id: 'promoFlag', label: 'Promotion Status', description: 'Whether a promotion is present.', domain: 'Commercial', synonyms: ['promo status'] },

  { id: 'customerSegment', label: 'Customer Segment', description: 'High-level customer segment such as Consumer, SMB, or Enterprise.', domain: 'Customer', synonyms: ['segment', 'customer type'], child: 'accountType' },
  { id: 'accountType', label: 'Account Type', description: 'A more detailed account category within a customer segment.', domain: 'Customer', synonyms: ['account', 'customer subsegment'], parent: 'customerSegment' },
  { id: 'tenureBand', label: 'Tenure', description: 'How long the customer has been with the business.', domain: 'Customer', synonyms: ['tenure', 'customer age'] },
  { id: 'ageBand', label: 'Age Band', description: 'Customer age grouping.', domain: 'Customer', synonyms: ['age'] },
  { id: 'creditBand', label: 'Credit Band', description: 'Customer credit grouping.', domain: 'Customer', synonyms: ['credit'] },
  { id: 'employeeBand', label: 'Employee Band', description: 'Company-size grouping for business customers.', domain: 'Customer', synonyms: ['company size', 'employees'] },

  { id: 'acquisitionSource', label: 'Acquisition Source', description: 'Where the customer or opportunity originated.', domain: 'Marketing', synonyms: ['source', 'acquisition'] },
  { id: 'inventoryStatus', label: 'Inventory Status', description: 'Product availability condition such as Healthy, Tight, or Backorder.', domain: 'Operations', synonyms: ['inventory', 'stock'] },
  { id: 'fulfillment', label: 'Fulfillment', description: 'How an order is delivered or collected.', domain: 'Operations', synonyms: ['delivery', 'shipping'] },
  { id: 'serviceTier', label: 'Service Tier', description: 'Service-level grouping.', domain: 'Operations', synonyms: ['service level'] },
  { id: 'supportTier', label: 'Support Tier', description: 'Customer support level.', domain: 'Operations', synonyms: ['support'] },
  { id: 'paymentType', label: 'Payment Type', description: 'How payment is made.', domain: 'Account', synonyms: ['payment'] },
  { id: 'contractType', label: 'Contract Type', description: 'Length or type of customer commitment.', domain: 'Account', synonyms: ['contract'] },
];

export function semanticFor(id: string) {
  return semanticDimensions.find((dimension) => dimension.id === id);
}

export function labelFor(id: string) {
  return semanticFor(id)?.label ?? id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function resolveDimension(text: string, available: string[]) {
  const query = text.toLowerCase();
  return semanticDimensions.find((dimension) => available.includes(dimension.id) && [dimension.id, dimension.label, ...dimension.synonyms].some((value) => query.includes(value.toLowerCase())))?.id;
}
