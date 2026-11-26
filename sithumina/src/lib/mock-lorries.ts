export type LorryStatus = "empty" | "on_trip";

export interface Lorry {
  id: string;
  plate: string;
  route: string;
  driverName?: string;
  driverPhone?: string;
  driverId?: string;
  vehicleType?: string;
  capacity?: string;
  startLocation?: string;
  endLocation?: string;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  travelRoute?: string;
  viaWaypoints?: Array<{name: string; lat: number; lng: number}>;
  emptyTime?: string;
  returnRoute?: string;
  finalDestination?: string;
  availableSpace?: string;
  availableCapacityKg?: string;
  hasFreezer?: boolean;
  hasHelper?: boolean;
  imageUrl?: string;
  images?: string[];
  maxWeight?: string;
  description?: string;
  lat: number;
  lng: number;
  heading?: number;
  speedKmH?: number;
  status: LorryStatus;
  lastUpdated: string;
  updatedAt?: number;
  isOnline?: boolean;
  isLive?: boolean;
  isOutsideLorry?: boolean;
  isAvailable?: boolean;
  ownershipType?: "company" | "outside";
}

// Real dynamic fleet only - all dummy/mock data removed
export const INITIAL_LORRIES: Lorry[] = [];
