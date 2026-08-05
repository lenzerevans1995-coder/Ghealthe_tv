// Classification ladder for policies arriving via Onyx POLICY_CREATED /
// POLICY_UPDATED webhooks. Ports the house rules used by the floor-board
// reporting queries:
//
//   1. HRA rows are stripped entirely (they are not policies for board
//      purposes). policy_type 'hra' alone is decisive; policy_name is a
//      fallback for HRAs keyed under other types.
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
  // policy_type 'hra' is decisive on its own: most HRA rows carry the parent
  // plan's name (e.g. "Humana Gold Plus SNP-DE", bare H-contract numbers)
  // with carrier "Unknown", so a name-based match would miss them.
  if (lc(p.policy_type) === 'hra') return true;
  const name = lc(p.policy_name);
  return name.includes('hra') || name.includes('health risk assessment');
}

export function isSthhc(p) {
  if (lc(p.policy_type) === 'short_term_home_health_care') return true;
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

// Verified against Aug 2026 keying: MAPD, DSNP, CSNP (incl. lowercase 'csnp')
// all appear as Core; ma_only/pdp kept from the house rules.
const CORE_TYPES = new Set(['mapd', 'ma', 'ma_only', 'dsnp', 'csnp', 'pdp', 'medicare_advantage']);

export function classify(p) {
  if (isHra(p)) return null; // stripped
  if (isSthhc(p)) return 'sthhc';
  const type = lc(p.policy_type);
  if (CORE_TYPES.has(type)) return 'core';
  if (type.includes('hospital_indemnity') || type === 'hi') return 'hi';
  return 'ancillary';
}
