/**
 * Checks that a business Google returned really belongs to the category we
 * searched for. Google's text search is loose: a furniture search can return
 * a phone shop that happens to be nearby.
 *
 * Google's type labels are used in memory for this decision only. They are
 * not stored.
 */

export type CategoryMatch = 'match' | 'mismatch' | 'unknown';

interface Rule { accept: RegExp | null }

/** Google place types that fit each of our categories. null = no reliable type exists. */
const RULES: Record<string, Rule> = {
  'restaurant': { accept: /(^|_)(restaurant|cafe|cafeteria|bakery|bar|pub|diner|bistro|food_court|meal_takeaway|meal_delivery|food|coffee_shop|ice_cream_shop|sandwich_shop|steak_house|pizzeria|bar_and_grill|catering_service|food_store)$/ },
  'beauty salon': { accept: /^(beauty_salon|hair_salon|hair_care|nail_salon|spa|skin_care_clinic|beautician|makeup_artist|massage|waxing_hair_removal_service|tanning_studio|day_spa|barber_shop)$/ },
  'barbershop': { accept: /^(barber_shop|hair_salon|hair_care|beauty_salon)$/ },
  'fashion boutique': { accept: /^(clothing_store|shoe_store|jewelry_store|department_store|boutique|fashion_accessories_store|womens_clothing_store|mens_clothing_store|tailor|bridal_shop|sportswear_store)$/ },
  'guesthouse': { accept: /^(guest_house|lodging|hotel|motel|hostel|inn|bed_and_breakfast|resort_hotel|extended_stay_hotel|private_guest_room|cottage|budget_japanese_inn|farmstay)$/ },
  'car rental': { accept: /^(car_rental|car_dealer|truck_rental)$/ },
  'furniture': { accept: /^(furniture_store|home_goods_store|home_improvement_store|carpenter|interior_designer|bedding_store|mattress_store|cabinet_maker)$/ },
  'cleaning service': { accept: /^(laundry|dry_cleaner|cleaning_service|house_cleaning_service|carpet_cleaning_service|janitorial_service)$/ },
  'event planning': { accept: /^(event_venue|wedding_venue|banquet_hall|event_planner|wedding_service|party_planner|catering_service|convention_center)$/ },
};

/**
 * Types that describe a clearly different kind of business. Seeing one of
 * these, with no accepted type, means the result does not belong.
 */
const DISTINCT = /^(cell_phone_store|electronics_store|bank|atm|insurance_agency|school|primary_school|secondary_school|university|hospital|doctor|dentist|pharmacy|drugstore|church|mosque|place_of_worship|gas_station|supermarket|grocery_store|convenience_store|car_repair|car_wash|auto_parts_store|real_estate_agency|lawyer|accounting|government_office|local_government_office|police|post_office|courthouse|embassy|library|museum|stadium|gym|fitness_center|pet_store|veterinary_care|hardware_store|liquor_store|book_store|bicycle_store|telecommunications_service_provider|internet_service_provider|travel_agency|moving_company|storage|parking|bus_station|train_station|airport|cemetery|funeral_home|casino|night_club|movie_theater)$/;

/** Each category's accepted types also count as "distinct" when seen under another category. */
function isDistinct(type: string, own: RegExp | null): boolean {
  if (DISTINCT.test(type)) return true;
  return Object.values(RULES).some((r) => r.accept && r.accept !== own && r.accept.test(type));
}

export function matchCategory(category: string, types: readonly string[], primaryType?: string): CategoryMatch {
  const all = [...new Set([...(primaryType ? [primaryType] : []), ...types])]
    .filter((t) => typeof t === 'string')
    .map((t) => t.toLowerCase());
  if (all.length === 0) return 'unknown';

  const rule = RULES[category.trim().toLowerCase()];
  const accept = rule?.accept ?? null;
  if (accept && all.some((t) => accept.test(t))) return 'match';

  // The primary type is Google's own best label. If it names a different kind of business, trust it.
  if (primaryType && isDistinct(primaryType.toLowerCase(), accept)) return 'mismatch';
  if (all.some((t) => DISTINCT.test(t))) return 'mismatch';
  return 'unknown';
}
