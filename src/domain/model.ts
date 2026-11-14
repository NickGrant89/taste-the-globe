/**
 * Place and food records for Taste the Globe.
 * The web app reads this module directly. A future mobile app should too,
 * instead of inventing a second copy of the sections or the pin shape.
 */

export type SectionId = 'recipes' | 'allotments' | 'free-food' | 'reviews' | 'marketplace'

export type Origin = 'sample' | 'yours' | 'member'

export interface Fact {
  label: string
  value: string
}

export interface Pickup {
  place: string
  window: string
  note: string
}

export interface Entry {
  id: string
  section: SectionId
  title: string
  city: string
  country: string
  lat: number
  lng: number
  summary: string
  story: string
  tags: string[]
  author: string
  authorPlace: string
  authorId?: string
  rating?: number
  ratingCount?: number
  family?: string
  photo?: string
  facts: Fact[]
  lines?: { heading: string; items: string[] }
  pickup?: Pickup
  caution?: string
  origin: Origin
}

export interface PostDraft {
  section: SectionId
  title: string
  city: string
  country: string
  lat: number
  lng: number
  summary: string
  tags: string[]
  pickup?: { place: string; window: string }
}

export interface CityChoice {
  city: string
  country: string
  lat: number
  lng: number
}

export interface Profile {
  name: string
  city: string
  country: string
  bio: string
}

export interface Mail {
  id: string
  from: 'you' | 'them'
  text: string
  at: string
}

export interface Thread {
  id: string
  entryId: string
  withName: string
  messages: Mail[]
}

export interface SectionMeta {
  id: SectionId
  label: string
  blurb: string
  color: string
}

export const AID_CAUTION =
  'Sample pin for this Day 1 build. It is not a live food-bank or surplus listing. Do not travel here expecting food.'

export const MARKET_CAUTION =
  'No payment and no delivery on this pin. Collect from the place and time shown. Any price is a sample figure, not a checkout.'

export const sections: SectionMeta[] = [
  {
    id: 'recipes',
    label: 'Recipes',
    color: '#e6b15a',
    blurb:
      'Search by dish, ingredient, or place. A recipe stays tied to the kitchen it was shared from, so lasagna in Milan is a different pin from lasagna in London.',
  },
  {
    id: 'allotments',
    label: 'Allotments',
    color: '#8fbe78',
    blurb:
      'Plots and balconies, with what is growing now, what grew last season, and what is going in next. Growers can talk to people nearby.',
  },
  {
    id: 'free-food',
    label: 'Free food',
    color: '#7eb8c9',
    blurb:
      'A place on the map for food banks, community fridges, and surplus. The sample pins below are illustrations, not services you can use.',
  },
  {
    id: 'reviews',
    label: 'Reviews',
    color: '#e07a5f',
    blurb:
      'Restaurants, stalls, trucks, bakeries, and street food. The review remembers where the meal happened, not only the name of the dish.',
  },
  {
    id: 'marketplace',
    label: 'Market',
    color: '#d4a017',
    blurb:
      'Home cooks, growers, and small producers. The pin says who has the food, where to collect it, and when. There is no checkout.',
  },
]

export const cityChoices: CityChoice[] = [
  { city: 'Accra', country: 'Ghana', lat: 5.6037, lng: -0.187 },
  { city: 'Bangkok', country: 'Thailand', lat: 13.7563, lng: 100.5018 },
  { city: 'Brooklyn', country: 'United States', lat: 40.6782, lng: -73.9442 },
  { city: 'Buenos Aires', country: 'Argentina', lat: -34.6037, lng: -58.3816 },
  { city: 'Chania', country: 'Greece', lat: 35.5138, lng: 24.018 },
  { city: 'Chengdu', country: 'China', lat: 30.5728, lng: 104.0668 },
  { city: 'Copenhagen', country: 'Denmark', lat: 55.6761, lng: 12.5683 },
  { city: 'Detroit', country: 'United States', lat: 42.3314, lng: -83.0458 },
  { city: 'Fukuoka', country: 'Japan', lat: 33.5902, lng: 130.4017 },
  { city: 'Hanoi', country: 'Vietnam', lat: 21.0278, lng: 105.8342 },
  { city: 'Ho Chi Minh City', country: 'Vietnam', lat: 10.8231, lng: 106.6297 },
  { city: 'Istanbul', country: 'Turkey', lat: 41.0082, lng: 28.9784 },
  { city: 'Lagos', country: 'Nigeria', lat: 6.5244, lng: 3.3792 },
  { city: 'Lisbon', country: 'Portugal', lat: 38.7223, lng: -9.1393 },
  { city: 'London', country: 'United Kingdom', lat: 51.5072, lng: -0.1276 },
  { city: 'Los Angeles', country: 'United States', lat: 34.0522, lng: -118.2437 },
  { city: 'Marrakech', country: 'Morocco', lat: 31.6295, lng: -7.9811 },
  { city: 'Melbourne', country: 'Australia', lat: -37.8136, lng: 144.9631 },
  { city: 'Mexico City', country: 'Mexico', lat: 19.4326, lng: -99.1332 },
  { city: 'Milan', country: 'Italy', lat: 45.4642, lng: 9.19 },
  { city: 'Mumbai', country: 'India', lat: 19.076, lng: 72.8777 },
  { city: 'Nairobi', country: 'Kenya', lat: -1.2921, lng: 36.8219 },
  { city: 'Naples', country: 'Italy', lat: 40.8518, lng: 14.2681 },
  { city: 'Oaxaca', country: 'Mexico', lat: 17.0732, lng: -96.7266 },
  { city: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522 },
  { city: 'Seoul', country: 'South Korea', lat: 37.5665, lng: 126.978 },
  { city: 'St Ives', country: 'United Kingdom', lat: 50.214, lng: -5.48 },
  { city: 'Taipei', country: 'Taiwan', lat: 25.033, lng: 121.5654 },
  { city: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503 },
]

export function sectionMeta(id: SectionId): SectionMeta {
  const found = sections.find((section) => section.id === id)
  if (!found) return sections[0]
  return found
}

export const motto = 'Discover · Experience · Share · Review · Buy · Sell · Grow · Connect'
