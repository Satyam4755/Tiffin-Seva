/**
 * Geospatial Utility for Tiffin Delivery Platform
 * Handles distance calculation and vendor eligibility logic.
 */

// 1. Haversine Formula for accurate geospatial distance (in KM)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(value) {
    return value * Math.PI / 180;
}

/**
 * Check if a user is eligible for delivery based on vendor rules.
 * 
 * Logic:
 * 1. Calculate actual distance.
 * 2. Check if inside overall radius.
 * 3. Check specific directional limits (North, South, East, West).
 *    - If a user is North of vendor, distance must be <= North Limit.
 *    - If direction limit is 0 or empty, that direction is BLOCKED.
 * 
 * @param {Object} userLocation - { lat: number, lng: number }
 * @param {Object} vendorSettings - { 
 *    lat: number, 
 *    lng: number, 
 *    radius: number, // Overall radius in KM
 *    limits: { north: number, south: number, east: number, west: number } // Optional
 * }
 * @returns {boolean} - True if eligible, False otherwise
 */
function checkDeliveryEligibility(userLocation, vendorSettings) {
    if (!userLocation || !vendorSettings) return false;

    // 1. Calculate Real Distance
    const distance = getDistance(
        vendorSettings.lat, vendorSettings.lng,
        userLocation.lat, userLocation.lng
    );

    // 2. Main Radius Check
    if (distance > vendorSettings.radius) {
        return false;
    }

    // If no directional limits are defined at all, return true based on radius
    const limits = vendorSettings.limits;
    if (!limits) return true;

    // 3. Directional Checks
    // Note: Lat > VendorLat = North, Lat < VendorLat = South
    //       Lng > VendorLng = East,  Lng < VendorLng = West

    // Check North
    if (userLocation.lat > vendorSettings.lat) {
        const limitN = limits.north;
        // "If value is 0 or empty, delivery must be BLOCKED"
        if (limitN === undefined || limitN === null || limitN === "" || limitN == 0) return false;
        if (distance > limitN) return false;
    }

    // Check South
    if (userLocation.lat < vendorSettings.lat) {
        const limitS = limits.south;
        if (limitS === undefined || limitS === null || limitS === "" || limitS == 0) return false;
        if (distance > limitS) return false;
    }

    // Check East
    if (userLocation.lng > vendorSettings.lng) {
        const limitE = limits.east;
        if (limitE === undefined || limitE === null || limitE === "" || limitE == 0) return false;
        if (distance > limitE) return false;
    }

    // Check West
    if (userLocation.lng < vendorSettings.lng) {
        const limitW = limits.west;
        if (limitW === undefined || limitW === null || limitW === "" || limitW == 0) return false;
        if (distance > limitW) return false;
    }

    return true;
}

module.exports = { getDistance, checkDeliveryEligibility };
