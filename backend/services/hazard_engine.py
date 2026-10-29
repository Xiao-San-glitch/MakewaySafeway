from datetime import datetime, timezone
from math import atan2, cos, radians, sin, sqrt

EARTH_RADIUS_KM = 6371.0088
ROUTE_BUFFER_KM = 0.5

FLOOD_TYPES = {"flood", "waterlogging"}
SERIOUS_TYPES = {"road_closure", "crash"}
OTHER_TYPES = {"obstacle", "poor_lighting", "other"}


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = radians(lat1), radians(lat2)
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)

    a = (
        sin(dlat / 2) ** 2
        + cos(p1) * cos(p2) * sin(dlon / 2) ** 2
    )

    return 2 * EARTH_RADIUS_KM * atan2(
        sqrt(a), sqrt(max(0.0, 1.0 - a))
    )


def distance_to_route_km(latitude, longitude, coordinates):
    if not coordinates:
        return None

    point = (latitude, longitude)
    route_points = []

    for item in coordinates:
        if not isinstance(item, (list, tuple)) or len(item) < 2:
            continue

        lon, lat = float(item[0]), float(item[1])

        if -90 <= lat <= 90 and -180 <= lon <= 180:
            route_points.append((lat, lon))

    if not route_points:
        return None

    if len(route_points) == 1:
        return haversine_km(
            latitude, longitude,
            route_points[0][0], route_points[0][1]
        )

    distances = []

    for i in range(len(route_points) - 1):
        lat1, lon1 = route_points[i]
        lat2, lon2 = route_points[i + 1]

        segment_length = haversine_km(lat1, lon1, lat2, lon2)

        if segment_length == 0:
            distances.append(
                haversine_km(latitude, longitude, lat1, lon1)
            )
            continue

        # Approximate the nearest point on the road segment.
        mean_lat = radians((lat1 + lat2) / 2)

        ax = radians(lon1 - longitude) * EARTH_RADIUS_KM * cos(mean_lat)
        ay = radians(lat1 - latitude) * EARTH_RADIUS_KM
        bx = radians(lon2 - longitude) * EARTH_RADIUS_KM * cos(mean_lat)
        by = radians(lat2 - latitude) * EARTH_RADIUS_KM

        dx, dy = bx - ax, by - ay
        denominator = dx * dx + dy * dy

        if denominator == 0:
            t = 0
        else:
            t = max(
                0.0,
                min(1.0, -(ax * dx + ay * dy) / denominator)
            )

        nearest_x = ax + t * dx
        nearest_y = ay + t * dy

        distances.append(sqrt(nearest_x**2 + nearest_y**2))

    return min(distances) if distances else None


def report_age_hours(report):
    timestamp = report.get("reported_at")

    if not timestamp:
        return None

    try:
        parsed = datetime.fromisoformat(
            timestamp.replace("Z", "+00:00")
        )

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)

        return max(
            0,
            (
                datetime.now(timezone.utc)
                - parsed.astimezone(timezone.utc)
            ).total_seconds() / 3600
        )
    except (ValueError, TypeError):
        return None


def freshness_factor(age):
    if age is None:
        return 0.65
    if age <= 6:
        return 1.0
    if age <= 48:
        return 0.65
    return 0.3


def assess_route_risk(hazards, weather=None, route_coordinates=None):
    route_coordinates = route_coordinates or []
    matched = []

    for hazard in hazards:
        if not isinstance(hazard, dict):
            continue

        if hazard.get("status") in {"resolved", "rejected", "expired"}:
            continue

        try:
            lat = float(hazard["latitude"])
            lon = float(hazard["longitude"])
        except (KeyError, TypeError, ValueError):
            continue

        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue

        distance = distance_to_route_km(
            lat, lon, route_coordinates
        )

        if distance is None or distance > ROUTE_BUFFER_KM:
            continue

        item = dict(hazard)
        item["distance_to_route_km"] = round(distance, 3)
        item["age_hours"] = report_age_hours(hazard)
        matched.append(item)

    flood_reports = [
        h for h in matched if h.get("type") in FLOOD_TYPES
    ]

    serious_reports = [
        h for h in matched if h.get("type") in SERIOUS_TYPES
    ]

    other_reports = [
        h for h in matched if h.get("type") in OTHER_TYPES
    ]

    score = 0.0

    for report in flood_reports:
        score += 32 * freshness_factor(report["age_hours"])

    for report in serious_reports:
        score += 25 * freshness_factor(report["age_hours"])

    for report in other_reports:
        score += 10 * freshness_factor(report["age_hours"])

    reasons = []

    rain = None

    if isinstance(weather, dict):
        try:
            rain = float(
                weather.get(
                    "rain_mm",
                    weather.get("precipitation_mm", 0)
                )
            )
            rain = max(0.0, rain)
            score += 25 * min(1.0, rain / 20.0)
            reasons.append(
                f"Reported precipitation: {rain:.1f} mm."
            )
        except (TypeError, ValueError):
            rain = None

    if flood_reports:
        reasons.append(
            f"{len(flood_reports)} flood/waterlogging report(s) "
            "near the route."
        )

    if serious_reports:
        reasons.append(
            f"{len(serious_reports)} closure/crash report(s) "
            "near the route."
        )

    if other_reports:
        reasons.append(
            f"{len(other_reports)} other hazard report(s) "
            "near the route."
        )

    if not matched:
        reasons.append(
            "No active community reports matched the route buffer."
        )

    if rain is None:
        reasons.append(
            "Rainfall data is unavailable; weather risk is uncertain."
        )

    score = round(min(100, max(0, score)))

    if not route_coordinates:
        label = "Insufficient route data"
        confidence = "low"
    elif score >= 70:
        label = "High observed hazard signal"
        confidence = "moderate" if matched and rain is not None else "low"
    elif score >= 40:
        label = "Elevated hazard signal"
        confidence = "moderate" if matched and rain is not None else "low"
    elif score >= 15:
        label = "Watch"
        confidence = "low"
    else:
        label = "Lower observed signal"
        confidence = "low"

    return {
        "score": score,
        "label": label,
        "confidence": confidence,
        "explanation": " ".join(reasons),
        "limitations": [
            "This is a heuristic score, not a validated flood probability.",
            "Community reports may be unverified or outdated.",
            "Rainfall alone cannot confirm that a road is flooded.",
            "No nearby reports does not guarantee that a road is safe."
        ],
        "inputs": {
            "route_geometry_available": bool(route_coordinates),
            "reports_near_route": len(matched),
            "flood_reports_near_route": len(flood_reports),
            "closure_or_crash_reports_near_route": len(serious_reports),
            "other_reports_near_route": len(other_reports),
            "rain_mm": rain,
            "route_buffer_km": ROUTE_BUFFER_KM
        },
        "matched_hazards": matched
    }