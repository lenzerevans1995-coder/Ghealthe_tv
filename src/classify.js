// Classification ladder for policies arriving via Onyx POLICY_CREATED /
// POLICY_UPDATED webhooks. Ports the house rules used by the floor-board
// reporting queries:
//
//   1. HRA rows are stripped entirely (they are not policies for board
//      purposes). Matched on policy_type + carrier_name + policy_name.
//   2. STHHC classifies BEFORE HI — GTL short-term home health routinely
//      arrives keyed as hospital_indemnity; carrier + policy name win over
//      the raw type.
//   3. ma_only counts as Core.
//   4. The ancillary flag / remaining products fall through to "ancillary".
//
// The keying variants below are seeded from the reporting queries and are
// expected to be refined at milestone 3 against a month of real webhook
// payloads (keying changes month to month — verify with the classification
// diagnostic before trusting new variants).

const lc = (s) => String(s ?? '').toLowerCase();

export function isHra(p) {
  const name = lc(p.policy_name);
  const type = lc(p.policy_type);
  const carrier = lc(p.carrier_name);
  return (
    (name.includes('hra') || name.includes('health risk assessment')) &&
    (type.includes('hra') || carrier.includes('hra') || name.includes('hra'))
  );
}

export function isSthhc(p) {
  const name = lc(p.policy_name);
  const carrier = lc(p.carrier_name);
  return (
    name.includes('short term home health') ||
    name.includes('short-term home health') ||
    name.includes('sthhc') ||
    (carrier.includes('gtl') && name.includes('home health')) ||
    (carrier.includes('guarantee trust') && name.includes('home health'))
  );
}

const CORE_TYPES = new Set(['mapd', 'ma', 'ma_only', 'pdp', 'medicare_advantage']);

export function classify(p) {
  if (isHra(p)) return null; // stripped
  if (isSthhc(p)) return 'sthhc';
  const type = lc(p.policy_type);
  if (CORE_TYPES.has(type)) return 'core';
  if (type.includes('hospital_indemnity') || type === 'hi') return 'hi';
  return 'ancillary';
}
