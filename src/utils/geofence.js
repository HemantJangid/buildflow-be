/**
 * Geofencing utility using the Haversine formula
 * Calculates the distance between two geographic coordinates (in meters)
 */

/**
 * Convert degrees to radians
 * @param {number} degrees
 * @returns {number} radians
 */
const toRadians = (degrees) => {
  return Number(degrees) * (Math.PI / 180);
};

/**
 * Parse and validate a coordinate value (lat or lng)
 * @param {*} value - Raw value from request or DB
 * @param {string} type - 'lat' | 'lng'
 * @returns {number|null} Valid number or null if invalid
 */
const parseCoord = (value, type) => {
  const n = Number(value);
  if (typeof value === 'undefined' || value === null || Number.isNaN(n)) return null;
  if (type === 'lat' && (n < -90 || n > 90)) return null;
  if (type === 'lng' && (n < -180 || n > 180)) return null;
  return n;
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point (degrees)
 * @param {number} lng1 - Longitude of first point (degrees)
 * @param {number} lat2 - Latitude of second point (degrees)
 * @param {number} lng2 - Longitude of second point (degrees)
 * @returns {number} Distance in meters
 */
export const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371000; // Earth's radius in meters

  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

/** Default radius in meters when project radius is missing or invalid */
const DEFAULT_RADIUS_M = 100;
/** Max allowed radius in meters (50 km) to avoid "allow everywhere" mistakes */
const MAX_RADIUS_M = 50000;

/**
 * Check if user coordinates are within project geofence
 * All coordinates and radius are normalized to numbers; radius is in meters.
 *
 * @param {Object} userCoords - User's current coordinates { lat, lng }
 * @param {Object} projectCoords - Project's center coordinates { lat, lng }
 * @param {number} radiusMeters - Project's geofence radius in meters
 * @returns {Object} { isWithinGeofence: boolean, distance: number (meters), radiusUsed: number }
 */
export const checkGeofence = (userCoords, projectCoords, radiusMeters) => {
  const userLat = parseCoord(userCoords?.lat, 'lat');
  const userLng = parseCoord(userCoords?.lng, 'lng');
  const projectLat = parseCoord(projectCoords?.lat, 'lat');
  const projectLng = parseCoord(projectCoords?.lng, 'lng');

  if (userLat === null || userLng === null || projectLat === null || projectLng === null) {
    return {
      isWithinGeofence: false,
      distance: 0,
      radiusUsed: 0,
    };
  }

  let radius = Number(radiusMeters);
  if (Number.isNaN(radius) || radius <= 0) {
    radius = DEFAULT_RADIUS_M;
  }
  if (radius > MAX_RADIUS_M) {
    radius = MAX_RADIUS_M;
  }

  const distance = calculateDistance(userLat, userLng, projectLat, projectLng);
  const roundedDistance = Math.round(distance);

  return {
    isWithinGeofence: distance <= radius,
    distance: roundedDistance,
    radiusUsed: radius,
  };
};

export default {
  calculateDistance,
  checkGeofence,
};
